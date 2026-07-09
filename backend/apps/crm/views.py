from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets

from apps.accounts.permissions import ReadOnlyOrRole

from .models import Appointment, Patient, TreatmentPlan, TreatmentSession
from .serializers import (
    AppointmentSerializer,
    PatientSerializer,
    TreatmentPlanSerializer,
    TreatmentSessionSerializer,
)


class CrmPermission(ReadOnlyOrRole):
    allowed_roles = ["admin", "doctor", "secretary", "radiotherapist"]


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
