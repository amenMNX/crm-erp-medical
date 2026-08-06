"""
Accounting post-save signals.

Registered in AccountingConfig.ready() (apps.py).
"""
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender="accounting.Invoice")
def invoice_issued_patient_note(sender, instance, created, **kwargs):
    """
    When an Invoice transitions to status='issued', append a timestamped note
    to the patient's dossier so billing history is visible inline.
    """
    from django.utils import timezone
    from apps.crm.models import Patient

    if instance.status != "issued":
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