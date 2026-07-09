from rest_framework import serializers

from .models import Employee


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