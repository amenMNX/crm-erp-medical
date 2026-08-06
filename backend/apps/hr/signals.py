"""
HR cross-module signals.

Registered in HrConfig.ready() (apps.py).
"""
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender="hr.SalaryAdvance")
def salary_advance_approved_payment(sender, instance, created, **kwargs):
    """
    When a SalaryAdvance transitions to 'Approuvée', create an OutgoingPayment
    in the accounting module so the cash outflow is visible to accountants.
    """
    from django.utils import timezone
    from apps.accounting.models import OutgoingPayment

    if created:
        return
    if instance.statut != "Approuvée":
        return

    reference = f"AVS-{instance.pk:05d}"

    if OutgoingPayment.objects.filter(reference=reference).exists():
        return

    OutgoingPayment.objects.create(
        reference=reference,
        category=OutgoingPayment.Category.SALARY_ADVANCE,
        amount=instance.amount,
        payment_date=timezone.now().date(),
        method=OutgoingPayment.Method.BANK_TRANSFER,
        description=(
            f"Avance sur salaire approuvée pour {instance.employee} "
            f"(demande du {instance.request_date}). "
            f"Motif : {instance.reason or 'non précisé'}."
        ),
        source_object_id=instance.pk,
    )


@receiver(post_save, sender="hr.Absence")
def absence_alert_treatment_sessions(sender, instance, created, **kwargs):
    """
    When an Absence is recorded, notify admins and doctors if treatment
    sessions are scheduled on that date.
    """
    from django.contrib.auth.models import User
    from apps.crm.models import TreatmentSession
    from apps.messaging.models import Notification

    absent_date = instance.date

    sessions = TreatmentSession.objects.filter(
        scheduled_datetime__date=absent_date,
        status__in=["scheduled", "in_progress"],
    ).select_related("patient", "treatment_plan")

    if not sessions.exists():
        return

    session_list = ", ".join(
        f"S{s.session_number} ({s.patient})" for s in sessions[:5]
    )
    if sessions.count() > 5:
        session_list += f" … +{sessions.count() - 5} autres"

    title = f"Absence signalée — {sessions.count()} séance(s) à réassigner"
    body = (
        f"{instance.employee} est absent(e) le {absent_date.strftime('%d/%m/%Y')}. "
        f"Séances affectées : {session_list}."
    )

    recipients = User.objects.filter(
        userprofile__role__in=["admin", "doctor"]
    ).distinct()

    for user in recipients:
        Notification.objects.get_or_create(
            recipient=user,
            title=title,
            body=body,
            defaults={"level": Notification.Level.WARNING},
        )


@receiver(post_save, sender="hr.LeaveRequest")
def leave_approved_block_shifts(sender, instance, created, **kwargs):
    """
    When a LeaveRequest transitions to 'Acceptée', cancel all PLANNED shifts
    for that employee within the leave period and notify admins.
    """
    from django.contrib.auth.models import User
    from apps.messaging.models import Notification
    from apps.hr.models import Shift

    if created:
        return
    if instance.statut != "Acceptée":
        return

    affected_shifts = Shift.objects.filter(
        employee=instance.employee,
        start_datetime__date__gte=instance.date_debut,
        start_datetime__date__lte=instance.date_fin,
        status=Shift.Status.PLANNED,
    )

    count = affected_shifts.count()
    if count == 0:
        return

    shift_list = ", ".join(
        str(s.start_datetime.date()) for s in affected_shifts[:5]
    )
    if count > 5:
        shift_list += f" … +{count - 5} autres"

    affected_shifts.update(status=Shift.Status.CANCELLED)

    title = f"Congé approuvé — {count} shift(s) annulé(s) pour {instance.employee}"
    body = (
        f"Le congé de {instance.employee} du {instance.date_debut} au {instance.date_fin} "
        f"a été approuvé. {count} shift(s) planifié(s) ont été automatiquement annulés : "
        f"{shift_list}."
    )

    admins = User.objects.filter(userprofile__role="admin").distinct()
    for admin in admins:
        Notification.objects.get_or_create(
            recipient=admin,
            title=title,
            defaults={"body": body, "level": Notification.Level.WARNING},
        )