from django.contrib import admin

from .models import Employee, LeaveRequest, Absence, SalaryAdvance


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
    
@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = ("employee", "date_debut", "date_fin", "statut")
    list_filter = ("statut",)
    search_fields = ("employee__first_name", "employee__last_name")


@admin.register(Absence)
class AbsenceAdmin(admin.ModelAdmin):
    list_display = ("employee", "date", "motif")
    search_fields = ("employee__first_name", "employee__last_name")


@admin.register(SalaryAdvance)
class SalaryAdvanceAdmin(admin.ModelAdmin):
    list_display = ("employee", "amount", "request_date", "statut")
    list_filter = ("statut",)
    search_fields = ("employee__first_name", "employee__last_name", "reason")