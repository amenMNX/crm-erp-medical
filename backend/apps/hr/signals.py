# apps/hr/signals.py
"""
HR cross-module signals.
"""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from .models import Employee


# NOTE: Role provisioning from job_title is handled entirely in
# EmployeeSerializer._get_or_create_role_from_job_title() (called on create/update).
# We do NOT duplicate that logic here to avoid race conditions and double-saves.


@receiver(post_save, sender=Employee)
def employee_created_or_updated(sender, instance, created, **kwargs):
    """Log employee creation/update."""
    pass


@receiver(post_save, sender="hr.SalaryAdvance")
def salary_advance_approved_payment(sender, instance, created, **kwargs):
    """When a SalaryAdvance transitions to 'Approuvée', create an OutgoingPayment."""
    from django.utils import timezone
    from apps.accounting.models import OutgoingPayment

    if created:
        return
    if instance.statut != "Approuvée":
        return

    reference = f"AVS-{instance.pk:05d}"

    if OutgoingPayment.objects.filter(reference=reference).exists():
        # Payment already created for this advance — this is a duplicate
        # approval (e.g. admin set status back to Approuvée after Remboursée).
        # Log a warning so it's visible in the server logs; do not create
        # a second OutgoingPayment.
        import logging
        logging.getLogger(__name__).warning(
            "Duplicate SalaryAdvance approval detected for advance pk=%s "
            "(reference=%s). OutgoingPayment already exists — skipping.",
            instance.pk,
            reference,
        )
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
    """When an Absence is recorded, notify admins and doctors."""
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
        profile__role__in=["admin", "doctor"]
    ).distinct()

    for user in recipients:
        Notification.objects.get_or_create(
            recipient=user,
            title=title,
            defaults={"body": body, "level": Notification.Level.WARNING},
        )


@receiver(post_save, sender="hr.LeaveRequest")
def leave_approved_block_shifts(sender, instance, created, **kwargs):
    """When a LeaveRequest transitions to 'Acceptée', cancel all PLANNED shifts."""
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

    admins = User.objects.filter(profile__role="admin").distinct()
    for admin in admins:
        Notification.objects.get_or_create(
            recipient=admin,
            title=title,
            defaults={"body": body, "level": Notification.Level.WARNING},
        )