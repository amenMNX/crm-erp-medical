from decimal import Decimal

from django.db import models
from django.db.models import Sum

from apps.crm.models import Patient, TreatmentPlan


class Invoice(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ISSUED = "issued", "Issued"
        PAID = "paid", "Paid"
        CANCELLED = "cancelled", "Cancelled"

    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name="invoices",
    )
    treatment_plan = models.ForeignKey(
        TreatmentPlan,
        on_delete=models.SET_NULL,
        related_name="invoices",
        blank=True,
        null=True,
    )
    invoice_number = models.CharField(max_length=50, unique=True)
    issue_date = models.DateField()
    due_date = models.DateField(blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-issue_date", "-created_at"]

    @property
    def paid_amount(self):
        return self.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    @property
    def balance_due(self):
        balance = Decimal(str(self.total_amount)) - self.paid_amount
        return max(balance, Decimal("0.00"))

    def refresh_payment_status(self):
        if self.status == self.Status.CANCELLED:
            return

        total_amount = Decimal(str(self.total_amount))
        next_status = self.Status.PAID if self.paid_amount >= total_amount else self.Status.ISSUED
        if self.status != next_status:
            self.status = next_status
            self.save(update_fields=["status", "updated_at"])

    def __str__(self):
        return self.invoice_number
    
class Payment(models.Model):
    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        CHECK = "check", "Check"

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name="payments",
    )
    payment_number = models.CharField(max_length=50, unique=True)
    payment_date = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(
        max_length=30,
        choices=Method.choices,
        default=Method.CASH,
    )
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-payment_date", "-created_at"]

    def save(self, *args, **kwargs):
        previous_invoice_id = None
        if self.pk:
            previous_invoice_id = Payment.objects.get(pk=self.pk).invoice_id

        super().save(*args, **kwargs)

        if previous_invoice_id and previous_invoice_id != self.invoice_id:
            Invoice.objects.get(pk=previous_invoice_id).refresh_payment_status()
        self.invoice.refresh_payment_status()

    def delete(self, *args, **kwargs):
        invoice = self.invoice
        result = super().delete(*args, **kwargs)
        invoice.refresh_payment_status()
        return result

    def __str__(self):
        return self.payment_number


class CNAMClaim(models.Model):
    """
    Tracks CNAM (Caisse Nationale d'Assurance Maladie) reimbursement claims
    tied to an invoice. Field set is based on the audit report's spec
    reference (section 5.4); no detailed CNAM workflow was otherwise
    documented, so this covers the minimum needed to track a claim's
    lifecycle. Revisit if the actual spec has more detail.
    """

    class Status(models.TextChoices):
        EN_ATTENTE = "En attente", "En attente"
        APPROUVEE = "Approuvée", "Approuvée"
        REJETEE = "Rejetée", "Rejetée"
        REMBOURSEE = "Remboursée", "Remboursée"

    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name="cnam_claims",
    )
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name="cnam_claims",
    )
    cnam_number = models.CharField(max_length=50)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.EN_ATTENTE,
    )
    amount_claimed = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    amount_reimbursed = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"CNAM {self.cnam_number} - {self.patient}"