from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Sum
from django.utils import timezone

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

    def _generate_invoice_number(self):
        prefix = "IN-"
        last_invoice = (
            Invoice.objects
            .filter(invoice_number__startswith=prefix)
            .order_by("-invoice_number")
            .first()
        )

        if not last_invoice:
            return f"{prefix}0001"

        try:
            last_number = int(last_invoice.invoice_number.split("-")[-1])
        except ValueError:
            last_number = 0

        return f"{prefix}{last_number + 1:04d}"

    def recalculate_totals(self):
        totals = self.line_items.aggregate(
            subtotal=Sum("line_subtotal"),
            tax=Sum("line_tax"),
            total=Sum("line_total"),
        )

        self.subtotal = totals["subtotal"] or Decimal("0.00")
        self.tax_amount = totals["tax"] or Decimal("0.00")
        self.total_amount = totals["total"] or Decimal("0.00")
        self.save(update_fields=["subtotal", "tax_amount", "total_amount", "updated_at"])
        self.refresh_payment_status()

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            self.invoice_number = self._generate_invoice_number()
        super().save(*args, **kwargs)
        
    def __str__(self):
        return self.invoice_number

class InvoiceLineItem(models.Model):
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name="line_items",
    )
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1.00"))
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Tax percentage. Example: 19.00 for 19%",
    )
    line_subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    line_tax = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    line_total = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def clean(self):
        if self.quantity <= 0:
            raise ValidationError({"quantity": "Quantity must be greater than zero."})
        if self.unit_price < 0:
            raise ValidationError({"unit_price": "Unit price cannot be negative."})
        if self.tax_rate < 0:
            raise ValidationError({"tax_rate": "Tax rate cannot be negative."})

    def save(self, *args, **kwargs):
        self.full_clean()

        self.line_subtotal = self.quantity * self.unit_price
        self.line_tax = self.line_subtotal * self.tax_rate / Decimal("100.00")
        self.line_total = self.line_subtotal + self.line_tax

        super().save(*args, **kwargs)
        self.invoice.recalculate_totals()

    def delete(self, *args, **kwargs):
        invoice = self.invoice
        result = super().delete(*args, **kwargs)
        invoice.recalculate_totals()
        return result

    def __str__(self):
        return f"{self.invoice.invoice_number} - {self.description}"

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

class SubscriptionPlan(models.Model):
    """A named subscription tier (e.g. 'Forfait Standard', 'Forfait VIP').

    Plans are referenced by SubscriptionChange records so the history of
    what plan a patient was on is preserved even if the plan's label changes.
    """

    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    monthly_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class SubscriptionChange(models.Model):
    """Records every time a patient's subscription plan is changed.

    This is the "gestion du changement de forme d'abonnement" requirement
    from the DOCX. Each row is an immutable audit trail entry — the current
    plan is the one on the most recent row for a given patient. Rows are
    never edited or deleted.
    """

    class Reason(models.TextChoices):
        UPGRADE = "upgrade", "Upgrade"
        DOWNGRADE = "downgrade", "Downgrade"
        INITIAL = "initial", "Initial subscription"
        CANCELLATION = "cancellation", "Cancellation"
        REACTIVATION = "reactivation", "Reactivation"
        OTHER = "other", "Other"

    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name="subscription_changes",
    )
    previous_plan = models.ForeignKey(
        SubscriptionPlan,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    new_plan = models.ForeignKey(
        SubscriptionPlan,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    reason = models.CharField(
        max_length=20,
        choices=Reason.choices,
        default=Reason.OTHER,
    )
    notes = models.TextField(blank=True)
    effective_date = models.DateField()
    recorded_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subscription_changes_recorded",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-effective_date", "-created_at"]

    def __str__(self):
        prev = self.previous_plan.name if self.previous_plan else "None"
        new = self.new_plan.name if self.new_plan else "None"
        return f"{self.patient} | {prev} → {new} ({self.effective_date})"

class OutgoingPayment(models.Model):
    """
    Records a cash outflow that is NOT linked to a patient invoice.
    Currently used for salary advance payouts; can be extended for
    supplier payments, maintenance costs, etc.
    """

    class Category(models.TextChoices):
        SALARY_ADVANCE = "salary_advance", "Avance sur salaire"
        SUPPLIER      = "supplier",       "Fournisseur"
        OTHER         = "other",          "Autre"

    class Method(models.TextChoices):
        CASH          = "cash",          "Espèces"
        BANK_TRANSFER = "bank_transfer", "Virement bancaire"
        CHECK         = "check",         "Chèque"

    reference        = models.CharField(max_length=100, unique=True)
    category         = models.CharField(
        max_length=30,
        choices=Category.choices,
        default=Category.OTHER,
    )
    amount           = models.DecimalField(max_digits=10, decimal_places=2)
    payment_date     = models.DateField()
    method           = models.CharField(
        max_length=30,
        choices=Method.choices,
        default=Method.BANK_TRANSFER,
    )
    description      = models.TextField(blank=True)
    # Generic link to the source object (e.g. the SalaryAdvance id)
    source_object_id = models.PositiveIntegerField(null=True, blank=True)

    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-payment_date", "-created_at"]

    def __str__(self):
        return f"{self.reference} — {self.amount} ({self.get_category_display()})"