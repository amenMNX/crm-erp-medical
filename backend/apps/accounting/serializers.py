from rest_framework import serializers

from .models import CNAMClaim, Invoice, Payment


class InvoiceSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.__str__", read_only=True)
    treatment_plan_name = serializers.CharField(source="treatment_plan.name", read_only=True)
    paid_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    balance_due = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

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
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "patient_name",
            "treatment_plan_name",
            "paid_amount",
            "balance_due",
            "created_at",
            "updated_at",
        ]


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