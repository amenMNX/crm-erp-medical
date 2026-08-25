from django.contrib import admin
from .models import Employee, LeaveRequest, Absence, SalaryAdvance


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = (
        "id",  # Use id since employee_number doesn't exist
        "first_name",
        "last_name",
        "position",  # Changed from "job_title" to "position"
        "department",
        "contract_type",
        "is_active",
    )
    search_fields = (
        "first_name",
        "last_name",
        "position",
        "department",
        "email",
        "phone",
    )
    list_filter = ("department", "contract_type", "is_active")


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = ("employee", "start_date", "end_date", "status")  # Changed
    list_filter = ("status",)  # Changed from "statut"
    search_fields = ("employee__first_name", "employee__last_name", "leave_type")


@admin.register(Absence)
class AbsenceAdmin(admin.ModelAdmin):
    list_display = ("employee", "date", "absence_type", "justification")  # Changed
    list_filter = ("absence_type", "date")
    search_fields = ("employee__first_name", "employee__last_name", "justification")


@admin.register(SalaryAdvance)
class SalaryAdvanceAdmin(admin.ModelAdmin):
    list_display = ("employee", "amount", "created_at", "status")  # Changed
    list_filter = ("status",)  # Changed from "statut"
    search_fields = ("employee__first_name", "employee__last_name", "reason")