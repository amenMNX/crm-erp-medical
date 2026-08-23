from rest_framework import serializers
from django.db import transaction

from .models import EmployeeSalary, PayrollBatch, Payroll, PayrollComponent
from apps.hr.models import Employee


class EmployeeSalarySerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.__str__", read_only=True)
    total_monthly_compensation = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True
    )

    class Meta:
        model = EmployeeSalary
        fields = [
            "id",
            "employee",
            "employee_name",
            "base_salary",
            "bank_account",
            "bank_name",
            "tax_id",
            "social_security_number",
            "transport_allowance",
            "meal_allowance",
            "bonus_percentage",
            "total_monthly_compensation",
            "effective_date",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "effective_date", "created_at", "updated_at"]


class PayrollComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollComponent
        fields = [
            "id",
            "name",
            "type",
            "amount",
            "description",
            "source",
            "source_id",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class PayrollSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.__str__", read_only=True)
    components = PayrollComponentSerializer(many=True, read_only=True)

    class Meta:
        model = Payroll
        fields = [
            "id",
            "payroll_batch",
            "employee",
            "employee_name",
            "month",
            "base_salary",
            "transport_allowance",
            "meal_allowance",
            "bonus",
            "absence_deduction",
            "advance_deduction",
            "tax_deduction",
            "social_security",
            "other_deduction",
            "overtime",
            "commission",
            "other_earnings",
            "gross_salary",
            "total_deductions",
            "net_salary",
            "status",
            "payment_date",
            "payment_method",
            "notes",
            "components",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "gross_salary",
            "total_deductions",
            "net_salary",
            "created_at",
            "updated_at",
        ]


class PayrollBatchSerializer(serializers.ModelSerializer):
    payrolls = PayrollSerializer(many=True, read_only=True)
    generated_by_name = serializers.CharField(source="generated_by.username", read_only=True, default=None)
    approved_by_name = serializers.CharField(source="approved_by.username", read_only=True, default=None)

    class Meta:
        model = PayrollBatch
        fields = [
            "id",
            "month",
            "status",
            "total_net_salary",
            "total_deductions",
            "total_earnings",
            "employee_count",
            "notes",
            "generated_by",
            "generated_by_name",
            "approved_by",
            "approved_by_name",
            "generated_at",
            "approved_at",
            "paid_at",
            "payrolls",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "total_net_salary",
            "total_deductions",
            "total_earnings",
            "employee_count",
            "generated_at",
            "approved_at",
            "paid_at",
            "created_at",
            "updated_at",
        ]


class GeneratePayrollSerializer(serializers.Serializer):
    """Serializer for generating payroll for a month."""
    month = serializers.DateField()
    employee_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        help_text="Specific employees to generate payroll for. If empty, generates for all active employees."
    )

    def validate_month(self, value):
        """Ensure month is first day of the month."""
        if value.day != 1:
            raise serializers.ValidationError("Month must be the first day of the month (e.g., 2026-07-01)")
        return value