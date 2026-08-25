from rest_framework import serializers

from .models import CNAMClaim, DunningAction, Invoice, InvoiceLineItem, Payment, SubscriptionPlan, SubscriptionChange, OutgoingPayment

class InvoiceLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLineItem
        fields = [
            "id",
            "description",
            "quantity",
            "unit_price",
            "tax_rate",
            "line_subtotal",
            "line_tax",
            "line_total",
            "created_at",
        ]
        read_only_fields = ["id", "line_subtotal", "line_tax", "line_total", "created_at"]
        
class InvoiceSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.__str__", read_only=True)
    treatment_plan_name = serializers.CharField(source="treatment_plan.name", read_only=True, default=None)
    paid_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    balance_due = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    days_overdue = serializers.IntegerField(read_only=True)
    dunning_stage = serializers.CharField(read_only=True)
    doubtful_provision_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    line_items = InvoiceLineItemSerializer(many=True, required=False)

    class Meta:
        model = Invoice
        fields = [
            "id",
            "patient",
            "patient_name",
            "treatment_plan",
            "treatment_plan_name",
            "invoice_number",
            "issue_date",
            "due_date",
            "status",
            "subtotal",
            "tax_amount",
            "total_amount",
            "paid_amount",
            "balance_due",
            "days_overdue",
            "dunning_stage",
            "doubtful_provision_amount",
            "line_items",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "patient_name",
            "treatment_plan_name",
            "invoice_number",
            "subtotal",
            "tax_amount",
            "total_amount",
            "paid_amount",
            "balance_due",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        line_items_data = validated_data.pop("line_items", [])
        invoice = Invoice.objects.create(**validated_data)

        for item_data in line_items_data:
            InvoiceLineItem.objects.create(invoice=invoice, **item_data)

        if not line_items_data:
            invoice.refresh_payment_status()

        return invoice

    def update(self, instance, validated_data):
        line_items_data = validated_data.pop("line_items", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if line_items_data is not None:
            instance.line_items.all().delete()
            for item_data in line_items_data:
                InvoiceLineItem.objects.create(invoice=instance, **item_data)

        return instance


class PaymentSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "invoice",
            "invoice_number",
            "payment_number",
            "payment_date",
            "amount",
            "method",
            "reference",
            "notes",
            "created_at",
        ]
        read_only_fields = ["id", "invoice_number", "created_at"]


class CNAMClaimSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.__str__", read_only=True)
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)

    class Meta:
        model = CNAMClaim
        fields = [
            "id",
            "patient",
            "patient_name",
            "invoice",
            "invoice_number",
            "cnam_number",
            "status",
            "amount_claimed",
            "amount_reimbursed",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "patient_name", "invoice_number", "created_at", "updated_at"]

class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = [
            "id",
            "name",
            "description",
            "monthly_price",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SubscriptionChangeSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.__str__", read_only=True)
    previous_plan_name = serializers.CharField(source="previous_plan.name", read_only=True, default=None)
    new_plan_name = serializers.CharField(source="new_plan.name", read_only=True, default=None)
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SubscriptionChange
        fields = [
            "id",
            "patient",
            "patient_name",
            "previous_plan",
            "previous_plan_name",
            "new_plan",
            "new_plan_name",
            "reason",
            "notes",
            "effective_date",
            "recorded_by",
            "recorded_by_name",
            "created_at",
        ]
        read_only_fields = ["id", "patient_name", "previous_plan_name", "new_plan_name", "recorded_by", "recorded_by_name", "created_at"]

    def get_recorded_by_name(self, obj):
        if obj.recorded_by is None:
            return None
        return obj.recorded_by.get_full_name() or obj.recorded_by.username

    def create(self, validated_data):
        # Automatically set recorded_by from the request context
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            validated_data["recorded_by"] = request.user
        return super().create(validated_data)
    
class DunningActionSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)
    patient_name   = serializers.CharField(source="invoice.patient.__str__", read_only=True)
    level_display  = serializers.CharField(source="get_level_display", read_only=True)
    method_display = serializers.CharField(source="get_method_display", read_only=True)
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DunningAction
        fields = [
            "id",
            "invoice",
            "invoice_number",
            "patient_name",
            "level",
            "level_display",
            "method",
            "method_display",
            "action_date",
            "fee_amount",
            "notes",
            "recorded_by",
            "recorded_by_name",
            "created_at",
        ]
        read_only_fields = [
            "id", "invoice_number", "patient_name",
            "level_display", "method_display",
            "recorded_by", "recorded_by_name", "created_at",
        ]

    def get_recorded_by_name(self, obj):
        if obj.recorded_by is None:
            return None
        return obj.recorded_by.get_full_name() or obj.recorded_by.username

    def create(self, validated_data):
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            validated_data["recorded_by"] = request.user
        return super().create(validated_data)


class OutgoingPaymentSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    method_display   = serializers.CharField(source="get_method_display", read_only=True)

    class Meta:
        model  = OutgoingPayment
        fields = [
            "id",
            "reference",
            "category",
            "category_display",
            "amount",
            "payment_date",
            "method",
            "method_display",
            "description",
            "source_object_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "reference", "category_display", "method_display", "created_at", "updated_at"]

# ── S8: General Ledger Serializers ────────────────────────────────────────────

from .models import ChartOfAccount, Journal, JournalEntry, JournalLine


class ChartOfAccountSerializer(serializers.ModelSerializer):
    level                = serializers.IntegerField(read_only=True)
    parent_name          = serializers.CharField(source="parent.name", read_only=True)
    account_type_display = serializers.CharField(source="get_account_type_display", read_only=True)

    class Meta:
        model = ChartOfAccount
        fields = [
            "id", "code", "name", "parent", "parent_name",
            "account_type", "account_type_display", "normal_balance",
            "is_active", "is_analytical", "description", "level",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class JournalSerializer(serializers.ModelSerializer):
    journal_type_display = serializers.CharField(source="get_journal_type_display", read_only=True)
    entry_count          = serializers.SerializerMethodField()

    class Meta:
        model = Journal
        fields = [
            "id", "code", "name", "journal_type", "journal_type_display",
            "is_active", "description", "entry_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_entry_count(self, obj):
        return obj.entries.count()


class JournalLineSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source="account.code", read_only=True)
    account_name = serializers.CharField(source="account.name", read_only=True)

    class Meta:
        model = JournalLine
        fields = [
            "id", "entry", "account", "account_code", "account_name",
            "debit", "credit", "description", "analytical_code", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate(self, data):
        has_d = data.get("debit",  0) and data["debit"]  > 0
        has_c = data.get("credit", 0) and data["credit"] > 0
        if has_d and has_c:
            raise serializers.ValidationError("Une ligne ne peut pas avoir à la fois un débit et un crédit.")
        if not has_d and not has_c:
            raise serializers.ValidationError("Une ligne doit avoir un débit ou un crédit.")
        return data


class JournalEntrySerializer(serializers.ModelSerializer):
    journal_code      = serializers.CharField(source="journal.code", read_only=True)
    journal_name      = serializers.CharField(source="journal.name", read_only=True)
    created_by_name   = serializers.CharField(source="created_by.username", read_only=True)
    validated_by_name = serializers.CharField(source="validated_by.username", read_only=True)
    is_balanced       = serializers.BooleanField(read_only=True)
    line_count        = serializers.IntegerField(read_only=True)
    lines             = JournalLineSerializer(many=True, read_only=True)

    class Meta:
        model = JournalEntry
        fields = [
            "id", "entry_number", "journal", "journal_code", "journal_name",
            "entry_date", "description", "reference", "invoice", "payment",
            "total_debit", "total_credit", "is_balanced", "line_count",
            "status", "created_by", "created_by_name",
            "validated_by", "validated_by_name",
            "posted_at", "created_at", "updated_at", "lines",
        ]
        read_only_fields = [
            "id", "entry_number", "total_debit", "total_credit",
            "created_by", "posted_at", "created_at", "updated_at",
        ]


class JournalEntryCreateSerializer(serializers.Serializer):
    journal_id  = serializers.IntegerField()
    entry_date  = serializers.DateField()
    description = serializers.CharField()
    reference   = serializers.CharField(required=False, allow_blank=True, default="")
    invoice_id  = serializers.IntegerField(required=False, allow_null=True, default=None)
    payment_id  = serializers.IntegerField(required=False, allow_null=True, default=None)
    lines       = serializers.ListField(child=serializers.DictField(), min_length=2)

    def validate_lines(self, value):
        total_d = total_c = 0
        for line in value:
            d = float(line.get("debit",  0) or 0)
            c = float(line.get("credit", 0) or 0)
            if d > 0 and c > 0:
                raise serializers.ValidationError("Une ligne ne peut pas avoir débit ET crédit.")
            if d == 0 and c == 0:
                raise serializers.ValidationError("Chaque ligne doit avoir un débit ou un crédit.")
            if not line.get("account"):
                raise serializers.ValidationError("Chaque ligne doit avoir un compte.")
            total_d += d
            total_c += c
        if round(total_d, 3) != round(total_c, 3):
            raise serializers.ValidationError(
                f"Écriture déséquilibrée — Débit: {total_d:.3f}, Crédit: {total_c:.3f}"
            )
        return value

    def create(self, validated_data):
        from django.db import transaction
        lines_data = validated_data.pop("lines")
        with transaction.atomic():
            entry = JournalEntry.objects.create(
                journal_id  = validated_data["journal_id"],
                entry_date  = validated_data["entry_date"],
                description = validated_data["description"],
                reference   = validated_data.get("reference", ""),
                invoice_id  = validated_data.get("invoice_id"),
                payment_id  = validated_data.get("payment_id"),
                created_by  = self.context["request"].user,
                status      = JournalEntry.Status.DRAFT,
            )
            for ld in lines_data:
                JournalLine.objects.create(
                    entry           = entry,
                    account_id      = ld["account"],
                    debit           = ld.get("debit",  0) or 0,
                    credit          = ld.get("credit", 0) or 0,
                    description     = ld.get("description", ""),
                    analytical_code = ld.get("analytical_code", ""),
                )
        return entry
