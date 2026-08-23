"""
Accounting post-save signals.

Registered in AccountingConfig.ready() (apps.py).
"""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver


@receiver(pre_save, sender="accounting.Invoice")
def _capture_previous_invoice_status(sender, instance, **kwargs):
    """
    Stash the current DB status on the instance before saving so the
    post_save receiver can detect a real status transition (old → new).
    New invoices (pk=None) get _previous_status = None.
    """
    if instance.pk:
        try:
            from apps.accounting.models import Invoice
            instance._previous_status = (
                Invoice.objects.values_list("status", flat=True).get(pk=instance.pk)
            )
        except Exception:
            instance._previous_status = None
    else:
        instance._previous_status = None


@receiver(post_save, sender="accounting.Invoice")
def invoice_issued_patient_note(sender, instance, created, **kwargs):
    """
    When an Invoice *transitions* to status='issued' (not merely saved while
    already issued), append a timestamped note to the patient's dossier so
    billing history is visible inline.

    Guards:
    - Only fires on a real draft→issued transition, not on every save.
    - The [FAC:xxx] marker check prevents duplicates if the signal somehow
      fires twice for the same transition.
    """
    from django.utils import timezone
    from apps.crm.models import Patient

    # Only act on a real transition TO 'issued'
    previous_status = getattr(instance, "_previous_status", None)
    if instance.status != "issued":
        return
    if not created and previous_status == "issued":
        # Already was issued before this save — not a transition
        return

    try:
        patient = Patient.objects.get(pk=instance.patient_id)
    except Patient.DoesNotExist:
        return

    marker = f"[FAC:{instance.invoice_number}]"
    if marker in (patient.notes or ""):
        return

    new_note = (
        f"{marker} Facture émise le {timezone.now().strftime('%d/%m/%Y')} "
        f"— Montant : {instance.total_amount} TND "
        f"(échéance : {instance.due_date or 'non définie'})."
    )

    separator = "\n" if patient.notes else ""
    Patient.objects.filter(pk=patient.pk).update(
        notes=patient.notes + separator + new_note
    )