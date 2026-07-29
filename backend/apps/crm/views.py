from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.accounts.permissions import ReadOnlyOrRole
from apps.audit.mixins import AuditLoggingMixin
from apps.audit.models import AuditLogEntry
from apps.audit.utils import log_action

from .models import Appointment, Complaint, Patient, Ticket, TreatmentPlan, TreatmentSession, Incident, TicketComment
from .serializers import (
    AppointmentSerializer, ComplaintSerializer, PatientSerializer,
    PublicComplaintStatusSerializer,
    PublicComplaintSubmitSerializer,
    PublicTicketStatusSerializer,
    PublicTicketSubmitSerializer,
    TicketSerializer, TreatmentPlanSerializer, TreatmentSessionSerializer, IncidentSerializer,
    TicketCommentSerializer
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


class TicketViewSet(AuditLoggingMixin, viewsets.ModelViewSet):
    queryset = Ticket.objects.select_related("client").prefetch_related("agents").all()
    serializer_class = TicketSerializer
    permission_classes = [TicketPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["statut", "priorite", "client", "agents"]
    search_fields = ["numero", "titre", "description", "client__first_name", "client__last_name"]
    ordering_fields = ["created_at", "updated_at", "priorite", "statut"]
    audit_tracked_fields = ["titre", "statut", "priorite", "agents"]


class ComplaintViewSet(AuditLoggingMixin, viewsets.ModelViewSet):
    queryset = Complaint.objects.select_related("client").all()
    serializer_class = ComplaintSerializer
    permission_classes = [TicketPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["statut", "client"]
    search_fields = ["description", "client__first_name", "client__last_name"]
    ordering_fields = ["created_at", "resolved_at"]
    audit_tracked_fields = ["statut"]


class PublicTicketSubmitView(APIView):
    """External patient portal — submit a ticket, no login required.

    Identity is verified by medical_record_number + last_name matching an
    existing Patient record; no session/token is issued.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = PublicTicketSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket = serializer.save()
        log_action(
            ticket,
            AuditLogEntry.Action.CREATE,
            actor=None,
            changes={"source": "patient_portal"},
        )
        return Response(
            {
                "numero": ticket.numero,
                "message": "Votre demande a bien été enregistrée. Conservez ce numéro pour suivre son statut.",
            },
            status=status.HTTP_201_CREATED,
        )


class PublicTicketStatusView(APIView):
    """External patient portal — check ticket status, no login required.

    Returns only status-relevant fields, never patient/agent details.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = PublicTicketStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        numero = serializer.validated_data["numero"]
        mrn = serializer.validated_data["medical_record_number"]
        try:
            ticket = Ticket.objects.select_related("client").get(
                numero__iexact=numero,
                client__medical_record_number__iexact=mrn,
            )
        except Ticket.DoesNotExist:
            return Response(
                {"detail": "Aucune demande trouvée avec ces informations."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            {
                "numero": ticket.numero,
                "titre": ticket.titre,
                "statut": ticket.statut,
                "priorite": ticket.priorite,
                "created_at": ticket.created_at,
                "updated_at": ticket.updated_at,
            }
        )

class IncidentViewSet(AuditLoggingMixin, viewsets.ModelViewSet):
    queryset = Incident.objects.select_related("patient", "reported_by").prefetch_related("agents").all()
    serializer_class = IncidentSerializer
    permission_classes = [TicketPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["statut", "priorite", "patient", "agents"]
    search_fields = ["titre", "description", "numero", "equipment_or_location"]
    ordering_fields = ["created_at", "updated_at", "priorite", "statut"]
    audit_tracked_fields = ["titre", "statut", "priorite", "agents"]

    def perform_create(self, serializer):
        instance = serializer.save(reported_by=self.request.user)
        log_action(instance, AuditLogEntry.Action.CREATE, actor=self.request.user)
        
class PublicComplaintSubmitView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = PublicComplaintSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        complaint = serializer.save()
        log_action(
            complaint,
            AuditLogEntry.Action.CREATE,
            actor=None,
            changes={"source": "patient_portal"},
        )

        return Response(
            {
                "numero": f"REC-{complaint.id:03d}",
                "message": "Votre reclamation a bien ete enregistree.",
            },
            status=status.HTTP_201_CREATED,
        )


class PublicComplaintStatusView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = PublicComplaintStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        numero = serializer.validated_data["numero"].strip().upper()
        mrn = serializer.validated_data["medical_record_number"]

        if not numero.startswith("REC-"):
            return Response(
                {"detail": "Numero de reclamation invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            complaint_id = int(numero.replace("REC-", "", 1))
        except ValueError:
            return Response(
                {"detail": "Numero de reclamation invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            complaint = Complaint.objects.select_related("client").get(
                id=complaint_id,
                client__medical_record_number__iexact=mrn,
            )
        except Complaint.DoesNotExist:
            return Response(
                {"detail": "Aucune reclamation trouvee avec ces informations."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "numero": f"REC-{complaint.id:03d}",
                "description": complaint.description,
                "statut": complaint.statut,
                "created_at": complaint.created_at,
                "resolved_at": complaint.resolved_at,
            }
        )


class TicketCommentViewSet(viewsets.ModelViewSet):
    """CRUD for comments/interventions on a ticket.

    Nested under /api/crm/tickets/{ticket_pk}/comments/ so the ticket_pk
    is always in scope — this prevents agents seeing or mutating comments
    that belong to a different ticket.
    """

    serializer_class = TicketCommentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return TicketComment.objects.filter(
            ticket_id=self.kwargs["ticket_pk"]
        ).select_related("author")

    def perform_create(self, serializer):
        serializer.save(
            ticket_id=self.kwargs["ticket_pk"],
            author=self.request.user,
        )

    def perform_update(self, serializer):
        # Only the original author (or an admin) may edit a comment.
        obj = self.get_object()
        if obj.author != self.request.user and not self.request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only edit your own comments.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.author != self.request.user and not self.request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only delete your own comments.")
        instance.delete()