from decimal import Decimal

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
    # Surfaced from Patient so the frontend can display the scheme without a
    # second API call.
    patient_cnam_scheme = serializers.CharField(source="patient.cnam_scheme", read_only=True)
    patient_cnam_scheme_display = serializers.CharField(
        source="patient.get_cnam_scheme_display", read_only=True
    )
    line_items = InvoiceLineItemSerializer(many=True, required=False)

    class Meta:
        model = Invoice
        fields = [
            "id",
            "patient",
            "patient_name",
            "patient_cnam_scheme",
            "patient_cnam_scheme_display",
            "treatment_plan",
            "treatment_plan_name",
            "invoice_number",
            "issue_date",
            "due_date",
            "status",
            "subtotal",
            "tax_amount",
            "total_amount",
            "patient_share",
            "cnam_share",
            "is_apci",
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
            "patient_cnam_scheme",
            "patient_cnam_scheme_display",
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

    def validate(self, data):
        patient_share = data.get("patient_share", self.instance.patient_share if self.instance else Decimal("0.00"))
        cnam_share = data.get("cnam_share", self.instance.cnam_share if self.instance else Decimal("0.00"))
        is_apci = data.get("is_apci", self.instance.is_apci if self.instance else False)

        # Enforce APCI rule: no ticket modérateur when APCI is flagged.
        if is_apci and patient_share > Decimal("0.00"):
            raise serializers.ValidationError(
                {"patient_share": "Une facture APCI est prise en charge à 100 % : le patient ne paie pas de ticket modérateur (patient_share doit être 0)."}
            )

        return data

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