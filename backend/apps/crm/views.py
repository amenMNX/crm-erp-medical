from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets

from apps.accounts.permissions import ReadOnlyOrRole

from .models import Appointment, Complaint, Patient, Ticket, TreatmentPlan, TreatmentSession
from .serializers import (
    AppointmentSerializer,
    ComplaintSerializer,
    PatientSerializer,
    TicketSerializer,
    TreatmentPlanSerializer,
    TreatmentSessionSerializer,
)


class CrmPermission(ReadOnlyOrRole):
    allowed_roles = ["admin", "doctor", "secretary", "radiotherapist"]


class TicketPermission(ReadOnlyOrRole):
    # "support_client" is the current backend role slug for support agents
    # (apps.accounts.models.UserProfile.Role.SUPPORT_CLIENT). Revisit this
    # list once the role mismatch (frontend vs backend) is reconciled.
    allowed_roles = ["admin", "support_client", "secretary"]


class PatientViewSet(viewsets.ModelViewSet):
    queryset = Patient.objects.all()
    serializer_class = PatientSerializer
    permission_classes = [CrmPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["first_name", "last_name", "cin", "phone", "email", "medical_record_number"]
    ordering_fields = ["first_name", "last_name", "created_at"]


class AppointmentViewSet(viewsets.ModelViewSet):
    queryset = Appointment.objects.select_related("patient").all()
    serializer_class = AppointmentSerializer
    permission_classes = [CrmPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "patient"]
    search_fields = ["title", "reason", "notes", "patient__first_name", "patient__last_name"]
    ordering_fields = ["appointment_date", "created_at"]


class TreatmentPlanViewSet(viewsets.ModelViewSet):
    queryset = TreatmentPlan.objects.select_related("patient").all()
    serializer_class = TreatmentPlanSerializer
    permission_classes = [CrmPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "patient"]
    search_fields = ["name", "diagnosis", "protocol", "patient__first_name", "patient__last_name"]
    ordering_fields = ["created_at", "start_date", "end_date"]


class TreatmentSessionViewSet(viewsets.ModelViewSet):
    queryset = TreatmentSession.objects.select_related("patient", "treatment_plan").all()
    serializer_class = TreatmentSessionSerializer
    permission_classes = [CrmPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "patient", "treatment_plan", "machine", "room"]
    search_fields = ["notes", "machine", "room", "patient__first_name", "patient__last_name", "treatment_plan__name"]
    ordering_fields = ["scheduled_datetime", "session_number", "created_at"]


class TicketViewSet(viewsets.ModelViewSet):
    queryset = Ticket.objects.select_related("client").prefetch_related("agents").all()
    serializer_class = TicketSerializer
    permission_classes = [TicketPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["statut", "priorite", "client", "agents"]
    search_fields = ["numero", "titre", "description", "client__first_name", "client__last_name"]
    ordering_fields = ["created_at", "updated_at", "priorite", "statut"]


class ComplaintViewSet(viewsets.ModelViewSet):
    queryset = Complaint.objects.select_related("client").all()
    serializer_class = ComplaintSerializer
    permission_classes = [TicketPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["statut", "client"]
    search_fields = ["description", "client__first_name", "client__last_name"]
    ordering_fields = ["created_at", "resolved_at"]