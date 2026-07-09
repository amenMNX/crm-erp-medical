from django.contrib import admin

from .models import Employee


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = (
        "employee_number",
        "first_name",
        "last_name",
        "job_title",
        "department",
        "contract_type",
        "is_active",
    )
    search_fields = (
        "employee_number",
        "first_name",
        "last_name",
        "job_title",
        "department",
        "email",
        "phone",
    )
    list_filter = ("department", "contract_type", "is_active")