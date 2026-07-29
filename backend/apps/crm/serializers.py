from django.contrib.auth.models import User
from rest_framework import serializers

from .models import Appointment, Complaint, Patient, Ticket, TreatmentPlan, TreatmentSession, Incident, TicketComment

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


class AgentSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "name"]

    def get_name(self, obj):
        full_name = obj.get_full_name()
        return full_name or obj.username


class TicketSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.__str__", read_only=True)
    agents = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.all(), required=False
    )
    agent_details = AgentSerializer(source="agents", many=True, read_only=True)

    class Meta:
        model = Ticket
        fields = [
            "id",
            "numero",
            "titre",
            "description",
            "priorite",
            "statut",
            "client",
            "client_name",
            "agents",
            "agent_details",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "numero", "client_name", "agent_details", "created_at", "updated_at"]


class ComplaintSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.__str__", read_only=True)

    class Meta:
        model = Complaint
        fields = [
            "id",
            "description",
            "statut",
            "client",
            "client_name",
            "created_at",
            "resolved_at",
        ]
        read_only_fields = ["id", "client_name", "created_at", "resolved_at"]


class PublicTicketSubmitSerializer(serializers.Serializer):
    """Unauthenticated submission from the external patient portal.

    Identity is verified by matching medical_record_number + last_name
    against an existing Patient — no account/session is created or required.
    """

    medical_record_number = serializers.CharField()
    last_name = serializers.CharField()
    titre = serializers.CharField(max_length=255)
    description = serializers.CharField()
    priorite = serializers.ChoiceField(
        choices=Ticket.Priority.choices, required=False, default=Ticket.Priority.FAIBLE
    )

    def validate(self, attrs):
        try:
            attrs["patient"] = Patient.objects.get(
                medical_record_number__iexact=attrs["medical_record_number"],
                last_name__iexact=attrs["last_name"],
            )
        except Patient.DoesNotExist:
            raise serializers.ValidationError(
                "Dossier patient introuvable. Vérifiez le numéro de dossier et le nom."
            )
        return attrs

    def create(self, validated_data):
        patient = validated_data.pop("patient")
        validated_data.pop("medical_record_number")
        validated_data.pop("last_name")
        return Ticket.objects.create(client=patient, **validated_data)


class PublicTicketStatusSerializer(serializers.Serializer):
    """Lookup key for the external patient portal's status-check endpoint."""

    numero = serializers.CharField()
    medical_record_number = serializers.CharField()
    
# Add this class
class IncidentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.__str__", read_only=True)
    reported_by_name = serializers.CharField(source="reported_by.get_full_name", read_only=True)
    agents = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.all(), required=False
    )
    agent_details = AgentSerializer(source="agents", many=True, read_only=True)

    class Meta:
        model = Incident
        fields = [
            "id",
            "numero",
            "titre",
            "description",
            "priorite",
            "statut",
            "patient",
            "patient_name",
            "equipment_or_location",
            "reported_by",
            "reported_by_name",
            "agents",
            "agent_details",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "numero", "patient_name", "reported_by_name", "agent_details", "created_at", "updated_at"]

class PublicComplaintSubmitSerializer(serializers.Serializer):
    medical_record_number = serializers.CharField()
    last_name = serializers.CharField()
    description = serializers.CharField()

    def validate(self, attrs):
        try:
            attrs["patient"] = Patient.objects.get(
                medical_record_number__iexact=attrs["medical_record_number"],
                last_name__iexact=attrs["last_name"],
            )
        except Patient.DoesNotExist:
            raise serializers.ValidationError(
                "Dossier patient introuvable. Verifiez le numero de dossier et le nom."
            )
        return attrs

    def create(self, validated_data):
        patient = validated_data.pop("patient")
        validated_data.pop("medical_record_number")
        validated_data.pop("last_name")
        return Complaint.objects.create(client=patient, description=validated_data["description"])


class PublicComplaintStatusSerializer(serializers.Serializer):
    numero = serializers.CharField()
    medical_record_number = serializers.CharField()

class TicketCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = TicketComment
        fields = [
            "id",
            "ticket",
            "author",
            "author_name",
            "body",
            "is_intervention",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "author", "author_name", "created_at", "updated_at"]

    def get_author_name(self, obj):
        if obj.author is None:
            return "Unknown"
        full = obj.author.get_full_name()
        return full or obj.author.username