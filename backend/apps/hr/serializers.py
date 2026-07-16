from rest_framework import serializers

from .models import Absence, Employee, LeaveRequest


class EmployeeSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Employee
        fields = [
            "id",
            "user",
            "username",
            "employee_number",
            "first_name",
            "last_name",
            "job_title",
            "department",
            "phone",
            "email",
            "hire_date",
            "contract_type",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "username", "created_at", "updated_at"]


class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.__str__", read_only=True)
    approved_by_name = serializers.CharField(source="approved_by.username", read_only=True)

    class Meta:
        model = LeaveRequest
        fields = [
            "id",
            "employee",
            "employee_name",
            "date_debut",
            "date_fin",
            "motif",
            "statut",
            "notes",
            "approved_by",
            "approved_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "employee_name",
            "approved_by",
            "approved_by_name",
            "created_at",
            "updated_at",
        ]


class AbsenceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.__str__", read_only=True)

    class Meta:
        model = Absence
        fields = [
            "id",
            "employee",
            "employee_name",
            "date",
            "motif",
            "created_at",
        ]
        read_only_fields = ["id", "employee_name", "created_at"]