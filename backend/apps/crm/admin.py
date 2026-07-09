from django.contrib import admin

# Register your models here.
from .models import Appointment, Patient, TreatmentPlan, TreatmentSession

@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'last_name', 'cin', 'phone', 'email', 'medical_record_number', 'diagnosis')#affichage des champs dans la liste
    search_fields = ('first_name', 'last_name', 'cin', 'phone', 'email', 'medical_record_number', 'diagnosis')#recherche par ces champs
    list_filter = ('created_at', 'updated_at')#filtrage par date de création et de mise à jour
    ordering = ('last_name', 'first_name')
@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "patient",
        "appointment_date",
        "status",
        "created_at",
    )
    search_fields = (
        "title",
        "patient__first_name",
        "patient__last_name",
        "patient__medical_record_number",
    )
    list_filter = ("status", "appointment_date", "created_at")

@admin.register(TreatmentPlan)
class TreatmentPlanAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "patient",
        "status",
        "total_sessions",
        "total_dose",
        "start_date",
        "end_date",
        "created_at",
    )
    search_fields = (
        "name",
        "patient__first_name",
        "patient__last_name",
        "patient__medical_record_number",
    )
    list_filter = ("status", "start_date", "end_date", "created_at")

@admin.register(TreatmentSession)
class TreatmentSessionAdmin(admin.ModelAdmin):
    list_display = (
        "session_number",
        "patient",
        "treatment_plan",
        "scheduled_datetime",
        "actual_datetime",
        "status",
        "machine",
        "room",
        "dose_delivered",
    )
    search_fields = (
        "patient__first_name",
        "patient__last_name",
        "patient__medical_record_number",
        "treatment_plan__name",
        "machine",
        "room",
    )
    list_filter = (
        "status",
        "scheduled_datetime",
        "machine",
        "room",
    )