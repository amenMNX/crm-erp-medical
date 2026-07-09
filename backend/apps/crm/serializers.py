from rest_framework import serializers

from .models import Appointment, Patient, TreatmentPlan, TreatmentSession

class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = [
            "id",
            "first_name",
            "last_name",
            "cin",
            "phone",
            "email",
            "birth_date",
            "address",
            "medical_record_number",
            "diagnosis",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class AppointmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.__str__", read_only=True)

    class Meta:
        model = Appointment
        fields = [
            "id",
            "patient",
            "patient_name",
            "title",
            "appointment_date",
            "status",
            "reason",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "patient_name", "created_at", "updated_at"]
        
        
class TreatmentPlanSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.__str__", read_only=True)

    class Meta:
        model = TreatmentPlan
        fields = [
            "id",
            "patient",
            "patient_name",
            "name",
            "diagnosis",
            "protocol",
            "total_sessions",
            "dose_per_session",
            "total_dose",
            "start_date",
            "end_date",
            "status",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "patient_name", "created_at", "updated_at"]
        
class TreatmentSessionSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.__str__", read_only=True)
    treatment_plan_name = serializers.CharField(source="treatment_plan.name", read_only=True)

    class Meta:
        model = TreatmentSession
        fields = [
            "id",
            "patient",
            "patient_name",
            "treatment_plan",
            "treatment_plan_name",
            "session_number",
            "scheduled_datetime",
            "actual_datetime",
            "status",
            "machine",
            "room",
            "dose_delivered",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "patient_name",
            "treatment_plan_name",
            "created_at",
            "updated_at",
        ]