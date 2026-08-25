"""
CRM Views Module

This module contains all ViewSets and APIViews for the CRM (Customer Relationship Management)
system, including patient management, appointments, treatment plans, tickets, complaints,
incidents, and public patient portal endpoints.
"""
from django_filters.rest_framework import DjangoFilterBackend
import secrets
from rest_framework import filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from apps.accounts.permissions import ReadOnlyOrRole
from apps.audit.mixins import AuditLoggingMixin
from apps.audit.models import AuditLogEntry
from apps.audit.utils import log_action

from .models import (
    Appointment,
    Complaint,
    Incident,
    Machine,
    MaintenanceLog,
    Patient,
    PatientDocument,
    PatientPortalAccount,
    PatientPortalSession,
    PatientRating,
    PortalMessage,
    Room,
    Ticket,
    TicketComment,
    TreatmentPlan,
    TreatmentSession,
    AppointmentExtension,
    DoctorAvailability,
    PatientSchedulingPreferences,
    WaitingList,
    TreatmentProtocol,
    ProtocolChangeLog,
    DoseDeviation,
)

from .serializers import (
    AppointmentSerializer,
    ComplaintSerializer,
    IncidentSerializer,
    MachineSerializer,
    PatientDocumentSerializer,
    PatientSerializer,
    PortalAccountSerializer,
    PortalLoginSerializer,
    PortalMessageCreateSerializer,
    PortalMessageSerializer,
    PortalPasswordChangeSerializer,
    PortalPasswordResetConfirmSerializer,
    PortalPasswordResetRequestSerializer,
    PortalPatientProfileSerializer,
    PortalRatingSerializer,
    PortalRegisterSerializer,
    PortalTreatmentPlanSerializer,
    PublicComplaintStatusSerializer,
    PublicComplaintSubmitSerializer,
    PublicTicketStatusSerializer,
    PublicTicketSubmitSerializer,
    RoomSerializer,
    StaffReplySerializer,
    TicketCommentSerializer,
    TicketSerializer,
    TreatmentPlanSerializer,
    TreatmentSessionSerializer,
    TreatmentProtocolSerializer,
    TreatmentProtocolListSerializer,
    DoseDeviationSerializer,
    MaintenanceLogSerializer,
)
from apps.accounts.permissions import (
    CrmPermission, 
    TicketPermission, 
    IsAdminRole, 
    IsSuperAdmin,
    AdminOnlyPermission
)
from .apt_scheduling import book_slot, handle_cancellation, suggest_slots
# =============================================================================
# PERMISSION CLASSES
# =============================================================================

class CrmPermission(ReadOnlyOrRole):
    allowed_roles = ["admin", "doctor", "secretary", "radiotherapist"]
    module_label  = "Patients"


class TicketPermission(ReadOnlyOrRole):
    allowed_roles = ["admin", "support_client", "secretary"]
    module_label  = "Tickets"


# =============================================================================
# PATIENT VIEWSET
# =============================================================================

class PatientViewSet(AuditLoggingMixin, viewsets.ModelViewSet):
    """
    ViewSet for Patient CRUD operations and 360° dossier view.
    
    Provides:
    - Standard CRUD operations (list, create, retrieve, update, delete)
    - Search/filter capabilities on patient fields
    - Custom 360° endpoint for complete patient dossier
    
    Permissions: CrmPermission (admin, doctor, secretary, radiotherapist)
    Audit: Tracks changes to patient data
    """
    
    queryset = Patient.objects.all()
    serializer_class = PatientSerializer
    permission_classes = [CrmPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["first_name", "last_name", "cin", "phone", "email", "medical_record_number"]
    ordering_fields = ["first_name", "last_name", "created_at"]
    audit_tracked_fields = ["first_name", "last_name", "cin", "diagnosis", "notes"]

    @action(detail=True, methods=["get"], url_path="360")
    def patient_360(self, request, pk=None):
        """
        Return the complete 360° dossier for a patient in one API call.

        Consolidates: patient info, active treatment plan + cumulative dose,
        upcoming appointments (next 5), open tickets, open invoices summary.
        This is the data needed by the patient dossier page without N+1 calls.
        
        GET /api/crm/patients/{id}/360/
        
        Returns:
            {
                "patient": {...},                  # Full patient data
                "active_plan": {...},              # Current treatment plan or null
                "upcoming_appointments": [...],    # Next 5 scheduled appointments
                "open_tickets": [...],             # Open tickets (recent 5)
                "finance_summary": {
                    "total_invoiced": 0.00,
                    "total_paid": 0.00,
                    "balance_due": 0.00,
                    "open_invoices_count": 0
                }
            }
        """
        patient = self.get_object()

        # --- Active treatment plan ---
        # Get the most recent active treatment plan
        active_plan = (
            patient.treatment_plans
            .filter(status=TreatmentPlan.Status.ACTIVE)
            .order_by("-created_at")
            .first()
        )

        # --- Upcoming appointments ---
        # Get the next 5 scheduled or confirmed appointments
        from django.utils import timezone
        upcoming_appointments = (
            patient.appointments
            .filter(
                appointment_date__gte=timezone.now(),
                status__in=["scheduled", "confirmed"],
            )
            .order_by("appointment_date")[:5]
        )

        # --- Open tickets ---
        # Get the 5 most recent open tickets
        open_tickets = (
            patient.tickets
            .filter(statut__in=["Nouveau", "En cours", "En attente"])
            .order_by("-created_at")[:5]
        )

        # --- Financial summary ---
        try:
            from django.db.models import Sum
            from apps.accounting.models import Invoice, Payment
            invoices_qs = Invoice.objects.filter(patient=patient)
            total_invoiced = float(
                invoices_qs.aggregate(t=Sum("total_amount"))["t"] or 0
            )
            total_paid = float(
                Payment.objects.filter(invoice__patient=patient)
                .aggregate(t=Sum("amount"))["t"] or 0
            )
            open_invoices = invoices_qs.exclude(status="paid").count()
        except Exception:
            total_invoiced = 0
            total_paid = 0
            open_invoices = 0

        return Response({
            "patient": PatientSerializer(patient).data,
            "active_plan": TreatmentPlanSerializer(active_plan).data if active_plan else None,
            "upcoming_appointments": AppointmentSerializer(upcoming_appointments, many=True).data,
            "open_tickets": TicketSerializer(open_tickets, many=True).data,
            "finance_summary": {
                "total_invoiced": total_invoiced,
                "total_paid": total_paid,
                "balance_due": round(total_invoiced - total_paid, 2),
                "open_invoices_count": open_invoices,
            },
        })


# =============================================================================
# APPOINTMENT VIEWSET
# =============================================================================

class AppointmentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Appointment CRUD operations.
    
    Provides standard CRUD operations with filtering and search capabilities.
    Appointments link patients to scheduled medical visits.
    
    Permissions: CrmPermission (admin, doctor, secretary, radiotherapist)
    Filters: status, patient
    Search: title, reason, notes, patient names
    Ordering: appointment_date, created_at
    """
    
    queryset = Appointment.objects.select_related("patient").all()
    serializer_class = AppointmentSerializer
    permission_classes = [CrmPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "patient"]
    search_fields = ["title", "reason", "notes", "patient__first_name", "patient__last_name"]
    ordering_fields = ["appointment_date", "created_at"]


# =============================================================================
# TREATMENT PLAN VIEWSET
# =============================================================================

class TreatmentPlanViewSet(viewsets.ModelViewSet):
    """
    ViewSet for TreatmentPlan CRUD operations.
    
    Manages radiation therapy treatment plans including:
    - Treatment protocol and dosing
    - Session tracking
    - Status management (active, completed, paused)
    
    Permissions: CrmPermission (admin, doctor, secretary, radiotherapist)
    Filters: status, patient
    Search: name, diagnosis, protocol, patient names
    Ordering: created_at, start_date, end_date
    """
    
    queryset = TreatmentPlan.objects.select_related("patient").all()
    serializer_class = TreatmentPlanSerializer
    permission_classes = [CrmPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "patient"]
    search_fields = ["name", "diagnosis", "protocol", "patient__first_name", "patient__last_name"]
    ordering_fields = ["created_at", "start_date", "end_date"]


# =============================================================================
# TREATMENT SESSION VIEWSET
# =============================================================================

class MachineViewSet(viewsets.ModelViewSet):
    """Manage radiotherapy machines (US-EQUIP-01) — MTBF/MTTR/disponibilité/calibration/amortissement."""

    queryset = Machine.objects.prefetch_related("maintenance_logs").all()
    serializer_class = MachineSerializer
    permission_classes = [CrmPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status"]
    search_fields = ["name", "model", "serial_number", "manufacturer"]
    ordering_fields = ["name", "status", "purchase_date", "next_calibration_date"]

    @action(detail=False, methods=["get"])
    def calibration_alerts(self, request):
        """Return machines where calibration is overdue or due within 30 days."""
        from django.utils import timezone
        import datetime
        today = timezone.now().date()
        threshold = today + datetime.timedelta(days=30)
        qs = self.get_queryset().filter(
            next_calibration_date__lte=threshold,
            status=Machine.Status.ACTIVE,
        )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def stats(self, request, pk=None):
        """Return MTBF, MTTR, disponibilité, book_value for a single machine."""
        machine = self.get_object()
        return Response({
            "mtbf_hours": machine.mtbf_hours,
            "mttr_hours": machine.mttr_hours,
            "disponibilite": machine.disponibilite,
            "annual_depreciation": float(machine.annual_depreciation) if machine.annual_depreciation else None,
            "book_value": float(machine.book_value) if machine.book_value else None,
            "calibration_overdue": machine.calibration_overdue,
        })


class MaintenanceLogViewSet(viewsets.ModelViewSet):
    """Journal de maintenance des équipements (US-EQUIP-01)."""

    queryset = MaintenanceLog.objects.select_related("machine").all()
    serializer_class = MaintenanceLogSerializer
    permission_classes = [CrmPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["machine", "intervention_type", "result"]
    search_fields = ["machine__name", "technician", "description"]
    ordering_fields = ["start_datetime", "cost"]


class RoomViewSet(viewsets.ModelViewSet):
    """Manage treatment rooms."""
    
    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    permission_classes = [CrmPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status"]
    search_fields = ["name"]
    ordering_fields = ["name", "status"]

class TreatmentSessionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for TreatmentSession CRUD operations.

    Manages individual treatment sessions within a treatment plan:
    - Session scheduling and tracking
    - Dose delivered per session
    - Machine and room assignments (with conflict detection — US-TRT-04)
    - Session status (scheduled, completed, missed)

    Conflict detection (US-TRT-04):
      On POST/PATCH, if machine or room is non-empty the ViewSet checks for
      overlapping sessions (same machine OR same room, same 1-hour window).
      A conflict does NOT block the save but returns HTTP 200 with a
      ``conflicts`` key in the response so the frontend can show a warning
      and ask the user to confirm.  The caller passes ``force=true`` in the
      request body to bypass the warning and save anyway.

    Alternative slots endpoint:
      GET /api/crm/treatment-sessions/available-slots/?machine=LINAC-1&date=2026-08-05
      Returns the next 5 free 1-hour slots for that machine on that date.

    Permissions: CrmPermission (admin, doctor, secretary, radiotherapist)
    Filters: status, patient, treatment_plan, machine, room
    Search: notes, machine, room, patient names, treatment plan name
    Ordering: scheduled_datetime, session_number, created_at
    """

    # Session duration used for conflict window (minutes).
    SESSION_DURATION_MINUTES = 60

    queryset = TreatmentSession.objects.select_related(
        "patient",
        "treatment_plan",
        "machine",
        "room",
    ).all()
    serializer_class = TreatmentSessionSerializer
    permission_classes = [CrmPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "patient", "treatment_plan", "machine", "room"]
    search_fields = ["notes", "machine__name", "room__name", "patient__first_name", "patient__last_name", "treatment_plan__name"]
    ordering_fields = ["scheduled_datetime", "session_number", "created_at"]

    # ── helpers ───────────────────────────────────────────────────────────────

    def _find_conflicts(self, scheduled_datetime, machine, room, exclude_pk=None):
        from datetime import timedelta
        from django.db.models import Q

        if not scheduled_datetime or (not machine and not room):
            return []

        window_start = scheduled_datetime - timedelta(minutes=self.SESSION_DURATION_MINUTES)
        window_end   = scheduled_datetime + timedelta(minutes=self.SESSION_DURATION_MINUTES)

        active_statuses = [
            TreatmentSession.Status.SCHEDULED,
            TreatmentSession.Status.IN_PROGRESS,
        ]

        resource_filter = Q()
        if machine:
            machine_id = machine.pk if hasattr(machine, "pk") else machine
            resource_filter |= Q(machine_id=machine_id)
        if room:
            room_id = room.pk if hasattr(room, "pk") else room
            resource_filter |= Q(room_id=room_id)

        qs = TreatmentSession.objects.filter(
            resource_filter,
            status__in=active_statuses,
            scheduled_datetime__gt=window_start,
            scheduled_datetime__lt=window_end,
        ).select_related("patient", "machine", "room")

        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)

        conflicts = []
        for s in qs:
            same_machine = machine and s.machine_id == (machine.pk if hasattr(machine, "pk") else machine)
            same_room = room and s.room_id == (room.pk if hasattr(room, "pk") else room)
            conflicts.append({
                "id": s.pk,
                "patient_name": str(s.patient),
                "scheduled_datetime": s.scheduled_datetime.isoformat(),
                "machine": str(s.machine) if s.machine else "",
                "room": str(s.room) if s.room else "",
                "conflict_type": (
                    "machine_and_room" if same_machine and same_room
                    else "machine" if same_machine
                    else "room"
                ),
            })
        return conflicts

    def _available_slots(self, machine, date_str, count=5):
        from datetime import datetime, timedelta
        from django.utils import timezone

        try:
            base_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return []

        slots = []
        for hour in range(8, 18):
            dt = timezone.make_aware(datetime(base_date.year, base_date.month, base_date.day, hour, 0))
            conflicts = self._find_conflicts(dt, machine, room=None)
            if not conflicts:
                slots.append(dt.isoformat())
            if len(slots) >= count:
                break
        return slots

    # ── write interception ────────────────────────────────────────────────────

    def _check_and_respond(self, serializer, exclude_pk=None):
        """
        Shared logic for create and update:
        1. If ``force=true`` in request data → save without conflict check.
        2. Otherwise detect conflicts; if any are found return 200 with
        conflict payload (frontend shows a warning dialog).
        3. If no conflicts → save and return standard 201/200.
        """
        force = str(self.request.data.get("force", "false")).lower() in ("true", "1", "yes")

        scheduled_datetime = serializer.validated_data.get("scheduled_datetime")
        machine = serializer.validated_data.get("machine", "")
        room    = serializer.validated_data.get("room", "")

        if not force:
            conflicts = self._find_conflicts(scheduled_datetime, machine, room, exclude_pk=exclude_pk)
            if conflicts:
                # Build alternative slots for the conflicting machine
                alt_machine = machine or (conflicts[0]["machine"] if conflicts else "")
                alt_date = scheduled_datetime.strftime("%Y-%m-%d") if scheduled_datetime else ""
                alt_slots = self._available_slots(alt_machine, alt_date) if alt_machine and alt_date else []

                return Response(
                    {
                        "warning": "conflict",
                        "message": (
                            f"{len(conflicts)} conflit(s) détecté(s) sur la même machine/salle "
                            "dans la fenêtre d'une heure. Confirmez pour ignorer."
                        ),
                        "conflicts": conflicts,
                        "alternative_slots": alt_slots,
                    },
                    status=status.HTTP_200_OK,
                )

        serializer.save()
        return None  # caller should return the normal DRF response

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        conflict_response = self._check_and_respond(serializer)
        if conflict_response is not None:
            return conflict_response
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        conflict_response = self._check_and_respond(serializer, exclude_pk=instance.pk)
        if conflict_response is not None:
            return conflict_response
        self.perform_update(serializer)
        return Response(serializer.data)

    # ── available-slots action ────────────────────────────────────────────────

    @action(detail=False, methods=["get"], url_path="available-slots")
    def available_slots(self, request):
        """
        GET /api/crm/treatment-sessions/available-slots/
            ?machine=LINAC-1&date=2026-08-05[&count=5]

        Returns free 1-hour slots (ISO 8601) for the given machine on that date.
        Used by the frontend to suggest alternatives when a conflict is detected.
        """
        machine_id = request.query_params.get("machine", "")
        date_str   = request.query_params.get("date", "")
        try:
            count = int(request.query_params.get("count", 5))
        except ValueError:
            count = 5

        if not machine_id or not date_str:
            return Response(
                {"error": "Les paramètres 'machine' et 'date' sont requis."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            machine = Machine.objects.get(pk=int(machine_id))
        except (Machine.DoesNotExist, ValueError):
            return Response(
                {"error": f"Machine introuvable : {machine_id}"},
                status=status.HTTP_404_NOT_FOUND,
            )

        slots = self._available_slots(machine, date_str, count=count)
        return Response({"machine": machine_id, "date": date_str, "available_slots": slots})


# =============================================================================
# TICKET VIEWSET
# =============================================================================

class TicketViewSet(AuditLoggingMixin, viewsets.ModelViewSet):
    """
    ViewSet for Ticket CRUD operations with SLA tracking.
    
    Manages patient support tickets including:
    - Ticket creation and assignment
    - Status tracking (Nouveau, En cours, En attente, Résolu, Fermé)
    - Priority management
    - SLA (Service Level Agreement) compliance tracking
    - Agent assignment
    
    Permissions: TicketPermission (admin, support_client, secretary)
    Filters: statut, priorite, client, agents, sla_breached
    Search: numero, titre, description, client names
    Ordering: created_at, updated_at, priorite, statut, sla_deadline
    Audit: Tracks changes to ticket data
    """
    
    queryset = Ticket.objects.select_related("client").prefetch_related("agents").all()
    serializer_class = TicketSerializer
    permission_classes = [TicketPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["statut", "priorite", "client", "agents", "sla_breached"]
    search_fields = ["numero", "titre", "description", "client__first_name", "client__last_name"]
    ordering_fields = ["created_at", "updated_at", "priorite", "statut", "sla_deadline"]
    audit_tracked_fields = ["titre", "statut", "priorite", "agents"]

    @action(detail=False, methods=["get"], url_path="sla-summary")
    def sla_summary(self, request):
        """
        Return SLA KPIs for the dashboard.

        GET /api/crm/tickets/sla-summary/

        Response:
          {
            "open": 12,                    # Total open tickets
            "breached": 3,                 # Open tickets that breached SLA
            "warning": 2,                  # Open tickets at >75% of SLA window
            "by_priority": {               # Breached tickets by priority
                "Critique": 1,
                "Élevée": 2,
                "Moyenne": 0,
                "Faible": 0
            },
            "breach_rate_30d": 8.3         # % of tickets closed in last 30d that breached SLA
          }
          
        Used for dashboard monitoring and performance tracking.
        """
        from django.utils import timezone
        from django.db.models import Count, Q

        # Define which statuses are considered "open"
        open_statuses = [
            Ticket.Status.NOUVEAU,
            Ticket.Status.EN_COURS,
            Ticket.Status.EN_ATTENTE,
        ]
        now = timezone.now()

        # Query open tickets
        open_qs = Ticket.objects.filter(statut__in=open_statuses)
        total_open = open_qs.count()
        
        # Count SLA breaches among open tickets
        breached = open_qs.filter(sla_breached=True).count()

        # Count tickets in warning state (past 75% of SLA window but not breached)
        warning = sum(
            1 for t in open_qs.select_related()
            if not t.sla_breached and t.sla_status == "warning"
        )

        # Breakdown of breached tickets by priority
        by_priority = dict(
            open_qs.filter(sla_breached=True)
            .values("priorite")
            .annotate(c=Count("id"))
            .values_list("priorite", "c")
        )

        # Calculate breach rate for tickets closed in the last 30 days
        thirty_days_ago = now - timezone.timedelta(days=30)
        closed_30d = Ticket.objects.filter(
            statut__in=[Ticket.Status.RESOLU, Ticket.Status.FERME],
            resolved_at__gte=thirty_days_ago,
        )
        closed_count = closed_30d.count()
        breached_closed = closed_30d.filter(sla_breached=True).count()
        breach_rate = (
            round(breached_closed / closed_count * 100, 1) if closed_count else 0.0
        )

        return Response({
            "open": total_open,
            "breached": breached,
            "warning": warning,
            "by_priority": by_priority,
            "breach_rate_30d": breach_rate,
        })


# =============================================================================
# COMPLAINT VIEWSET
# =============================================================================

class ComplaintViewSet(AuditLoggingMixin, viewsets.ModelViewSet):
    """
    ViewSet for Complaint CRUD operations.
    
    Manages patient complaints and grievances:
    - Complaint submission and tracking
    - Status management (Nouveau, En cours, Résolu, Rejeté)
    - Resolution tracking
    
    Permissions: TicketPermission (admin, support_client, secretary)
    Filters: statut, client
    Search: description, client names
    Ordering: created_at, resolved_at
    Audit: Tracks changes to complaint status
    """
    
    queryset = Complaint.objects.select_related("client").all()
    serializer_class = ComplaintSerializer
    permission_classes = [TicketPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["statut", "client"]
    search_fields = ["description", "client__first_name", "client__last_name"]
    ordering_fields = ["created_at", "resolved_at"]
    audit_tracked_fields = ["statut"]


# =============================================================================
# INCIDENT VIEWSET
# =============================================================================

class IncidentViewSet(AuditLoggingMixin, viewsets.ModelViewSet):
    """
    ViewSet for Incident CRUD operations.
    
    Manages safety incidents, equipment failures, and adverse events:
    - Incident reporting with affected patient (if applicable)
    - Priority and status tracking
    - Agent/investigator assignment
    - Equipment/location tracking
    
    Permissions: TicketPermission (admin, support_client, secretary)
    Filters: statut, priorite, patient, agents
    Search: titre, description, numero, equipment_or_location
    Ordering: created_at, updated_at, priorite, statut
    Audit: Tracks changes to incident data
    
    Note: reported_by is automatically set to the current user on creation.
    """
    
    queryset = Incident.objects.select_related("patient", "reported_by").prefetch_related("agents").all()
    serializer_class = IncidentSerializer
    permission_classes = [TicketPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["statut", "priorite", "patient", "agents"]
    search_fields = ["titre", "description", "numero", "equipment_or_location"]
    ordering_fields = ["created_at", "updated_at", "priorite", "statut"]
    audit_tracked_fields = ["titre", "statut", "priorite", "agents"]

    def perform_create(self, serializer):
        """
        Override create to automatically set reported_by to the current user
        and log the creation action.
        """
        instance = serializer.save(reported_by=self.request.user)
        log_action(instance, AuditLogEntry.Action.CREATE, actor=self.request.user)


# =============================================================================
# PUBLIC PATIENT PORTAL VIEWS
# =============================================================================

# These views are for the external patient portal where patients can submit
# tickets and complaints without logging in.
# Identity is verified by matching medical_record_number + last_name.

class PublicTicketSubmitView(APIView):
    """
    External patient portal — submit a ticket, no login required.

    Identity is verified by medical_record_number + last_name matching an
    existing Patient record; no session/token is issued.
    
    POST /api/crm/public/tickets/submit/
    
    Request body:
        {
            "medical_record_number": "MRN12345",
            "last_name": "Doe",
            "titre": "Issue with scheduling",
            "description": "Detailed description...",
            "priorite": "Moyenne"  # Optional, defaults to "Faible"
        }
    
    Response:
        {
            "numero": "TKT-00042",
            "message": "Votre demande a bien été enregistrée. Conservez ce numéro pour suivre son statut."
        }
    """
    
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonRateThrottle]  # Rate limit to prevent abuse

    def post(self, request):
        serializer = PublicTicketSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket = serializer.save()
        
        # Log the public submission without an actor
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
    """
    External patient portal — check ticket status, no login required.

    Returns only status-relevant fields, never patient/agent details.
    
    POST /api/crm/public/tickets/status/
    
    Request body:
        {
            "numero": "TKT-00042",
            "medical_record_number": "MRN12345"
        }
    
    Response:
        {
            "numero": "TKT-00042",
            "titre": "Issue with scheduling",
            "statut": "En cours",
            "priorite": "Moyenne",
            "created_at": "2024-01-15T10:00:00Z",
            "updated_at": "2024-01-16T14:30:00Z"
        }
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = PublicTicketStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        numero = serializer.validated_data["numero"]
        mrn = serializer.validated_data["medical_record_number"]
        
        # Look up ticket by number and patient MRN
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
            
        # Return only public-safe fields
        return Response(
            {
                "numero": ticket.numero,
                "titre": ticket.titre,
                "statut": ticket.statut,
                "priorite": ticket.priorite,
                "created_at": ticket.created_at,
                "updated_at": ticket.updated_at,
                "resolved_at": ticket.resolved_at,
                "is_resolved": ticket.statut in ("Résolu", "Fermé"),
            }
        )


class PublicComplaintSubmitView(APIView):
    """
    External patient portal — submit a complaint without login.
    
    Identity is verified by medical_record_number + last_name matching
    an existing Patient record.
    
    POST /api/crm/public/complaints/submit/
    
    Request body:
        {
            "medical_record_number": "MRN12345",
            "last_name": "Doe",
            "description": "Detailed complaint description..."
        }
    
    Response:
        {
            "numero": "REC-001",
            "message": "Votre reclamation a bien ete enregistree."
        }
    """
    
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = PublicComplaintSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        complaint = serializer.save()
        
        # Log the public submission without an actor
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
    """
    External patient portal — check complaint status without login.
    
    POST /api/crm/public/complaints/status/
    
    Request body:
        {
            "numero": "REC-001",
            "medical_record_number": "MRN12345"
        }
    
    Response:
        {
            "numero": "REC-001",
            "description": "Detailed complaint description...",
            "statut": "En cours",
            "created_at": "2024-01-15T10:00:00Z",
            "resolved_at": null
        }
    """
    
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = PublicComplaintStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        numero = serializer.validated_data["numero"].strip().upper()
        mrn = serializer.validated_data["medical_record_number"]

        # Validate complaint number format
        if not numero.startswith("REC-"):
            return Response(
                {"detail": "Numero de reclamation invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Extract complaint ID from number
        try:
            complaint_id = int(numero.replace("REC-", "", 1))
        except ValueError:
            return Response(
                {"detail": "Numero de reclamation invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Look up complaint by ID and patient MRN
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


# =============================================================================
# TICKET COMMENT VIEWSET (Nested Resource)
# =============================================================================

class TicketCommentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for CRUD operations on ticket comments/interventions.

    This is a nested resource under tickets:
    /api/crm/tickets/{ticket_pk}/comments/
    
    The ticket_pk is always in scope via the URL, which prevents agents
    from seeing or mutating comments that belong to a different ticket.
    
    Permissions:
        - IsAuthenticated: Must be logged in to access
        - Only the author or admin can edit/delete comments
    
    Features:
        - Comments and interventions (flagged by is_intervention)
        - Author tracking
        - Automatic ticket_id assignment from URL
    """
    
    serializer_class = TicketCommentSerializer
    permission_classes = [TicketPermission]

    def get_queryset(self):
        """
        Filter comments to only those belonging to the ticket specified in the URL.
        
        Returns: QuerySet of TicketComment for the given ticket, ordered by creation.
        """
        return TicketComment.objects.filter(
            ticket_id=self.kwargs["ticket_pk"]
        ).select_related("author")

    def perform_create(self, serializer):
        """
        Automatically set ticket_id from URL and author to current user on creation.
        """
        serializer.save(
            ticket_id=self.kwargs["ticket_pk"],
            author=self.request.user,
        )

    def perform_update(self, serializer):
        """
        Ensure only the original author or admin can edit a comment.
        
        Raises: PermissionDenied if user is not authorized.
        """
        obj = self.get_object()
        if obj.author != self.request.user and not self.request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only edit your own comments.")
        serializer.save()

    def perform_destroy(self, instance):
        """
        Ensure only the original author or admin can delete a comment.
        
        Raises: PermissionDenied if user is not authorized.
        """
        if instance.author != self.request.user and not self.request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only delete your own comments.")
        instance.delete()
    
"""
portal_views.py — US-PAT-04 : Portail Patient

Ajouter ces vues dans backend/apps/crm/views.py (ou importer depuis ici).
Toutes les vues portail commencent par « Portal » pour ne pas entrer en conflit.
"""

# ─── Helpers ──────────────────────────────────────────────────────────────────

PORTAL_SESSION_COOKIE = "portal_session"


def _get_portal_account(request) -> PatientPortalAccount | None:
    """Résout le compte portail depuis le cookie de session."""
    token = request.COOKIES.get(PORTAL_SESSION_COOKIE)
    if not token:
        return None
    try:
        session = PatientPortalSession.objects.select_related(
            "account__patient"
        ).get(token=token)
    except PatientPortalSession.DoesNotExist:
        return None
    if not session.is_valid:
        session.delete()
        return None
    session.refresh()
    return session.account


def _portal_required(func):
    """Décorateur : vérifie la session portail et injecte account + patient."""
    from functools import wraps

    @wraps(func)
    def wrapper(self, request, *args, **kwargs):
        account = _get_portal_account(request)
        if not account:
            return Response(
                {"detail": "Session expirée. Veuillez vous reconnecter."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        request.portal_account = account
        request.portal_patient = account.patient
        return func(self, request, *args, **kwargs)

    return wrapper


# ─── 1. Authentification ──────────────────────────────────────────────────────

class PortalLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        ser = PortalLoginSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        last_name = ser.validated_data["last_name"].strip()
        cin = ser.validated_data["cin"].strip()
        medical_record_number = ser.validated_data["medical_record_number"].strip()
        password = ser.validated_data.get("password", "").strip()

        # 1. Vérifier que le patient existe
        try:
            patient = Patient.objects.get(
                last_name__iexact=last_name,
                cin__iexact=cin,
                medical_record_number__iexact=medical_record_number,
            )
        except Patient.DoesNotExist:
            return Response(
                {"detail": "Identifiants patient incorrects."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # 2. Récupérer ou créer le compte portail
        account, created = PatientPortalAccount.objects.get_or_create(
            patient=patient,
            defaults={
                "email": patient.email or f"portal-{patient.id}@patient.local",
                "password_hash": "",
                "is_active": True,
            },
        )

        if account.is_locked:
            return Response(
                {"detail": "Compte temporairement bloqué. Réessayez dans 15 minutes."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not account.is_active:
            return Response(
                {"detail": "Compte portail désactivé."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # 3. Cas 1 — password fourni → on vérifie
        if password:
            if not account.check_password(password):
                account.record_failed_login()
                return Response(
                    {"detail": "Mot de passe incorrect."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            # Password correct → connecter
            return self._create_session(account, request)

        # 4. Cas 2 — pas de password → envoyer par email si on a une vraie adresse
        real_email = patient.email
        if not real_email:
            return Response(
                {"detail": "Aucune adresse email associée à ce dossier. Contactez le secrétariat."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Générer un nouveau mot de passe temporaire
        temp_password = secrets.token_urlsafe(10)  # ex: "aB3xK9mP2q"
        account.set_password(temp_password)
        account.email = real_email  # synchroniser l'email si besoin
        account.save(update_fields=["password_hash", "email"])

        send_mail(
            subject="Votre accès à l'Espace Patient",
            message=(
                f"Bonjour {patient.first_name} {patient.last_name},\n\n"
                f"Votre mot de passe temporaire pour l'Espace Patient est :\n\n"
                f"    {temp_password}\n\n"
                f"Connectez-vous avec votre nom de famille, CIN, numéro de dossier et ce mot de passe.\n"
                f"Vous pourrez le changer depuis votre profil.\n\n"
                f"Ce message a été généré automatiquement."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[real_email],
            fail_silently=False,
        )

        return Response(
            {"detail": "Un mot de passe temporaire a été envoyé à votre adresse email."},
            status=status.HTTP_200_OK,
        )

    def _create_session(self, account, request):
        account.record_successful_login()
        session = PatientPortalSession.create_for(
            account,
            ip=request.META.get("REMOTE_ADDR"),
            ua=request.META.get("HTTP_USER_AGENT", ""),
        )
        response = Response({
            "patient_id": account.patient.id,
            "patient_name": f"{account.patient.first_name} {account.patient.last_name}",
            "mrn": account.patient.medical_record_number,
            "email": account.email,
        })
        response.set_cookie(
            PORTAL_SESSION_COOKIE,
            session.token,
            max_age=1800,
            httponly=True,
            samesite="Lax",
            secure=not request.META.get("SERVER_NAME", "").startswith("localhost"),
        )
        return response


class PortalLogoutView(APIView):
    """POST /api/portal/auth/logout/"""
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.COOKIES.get(PORTAL_SESSION_COOKIE)
        if token:
            PatientPortalSession.objects.filter(token=token).delete()
        response = Response({"detail": "Déconnecté."})
        response.delete_cookie(PORTAL_SESSION_COOKIE)
        return response


class PortalMeView(APIView):
    """GET /api/portal/auth/me/ — vérifie la session active"""
    permission_classes = [AllowAny]

    def get(self, request):
        account = _get_portal_account(request)
        if not account:
            return Response({"authenticated": False}, status=status.HTTP_401_UNAUTHORIZED)
        return Response({
            "authenticated": True,
            "patient_id": account.patient.id,
            "patient_name": f"{account.patient.first_name} {account.patient.last_name}",
            "mrn": account.patient.medical_record_number,
            "email": account.email,
        })


class PortalPasswordChangeView(APIView):
    """POST /api/portal/auth/change-password/"""
    permission_classes = [AllowAny]

    def post(self, request):
        account = _get_portal_account(request)
        if not account:
            return Response({"detail": "Non authentifié."}, status=401)

        ser = PortalPasswordChangeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        if not account.check_password(ser.validated_data["current_password"]):
            return Response({"detail": "Mot de passe actuel incorrect."}, status=400)

        account.set_password(ser.validated_data["new_password"])
        account.save()
        return Response({"detail": "Mot de passe modifié avec succès."})


class PortalPasswordResetRequestView(APIView):
    """POST /api/portal/auth/reset-password/ — AllowAny"""
    permission_classes = [AllowAny]

    def post(self, request):
        ser = PortalPasswordResetRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        # Réponse générique pour éviter l'énumération d'emails
        try:
            account = PatientPortalAccount.objects.get(
                email=ser.validated_data["email"], is_active=True
            )
            token = account.generate_reset_token()
            account.save()
            # TODO: envoyer email avec lien /portal/reset?token=<token>
            # send_portal_reset_email(account.email, token)
        except PatientPortalAccount.DoesNotExist:
            pass  # Ne pas révéler l'existence de l'email

        return Response(
            {"detail": "Si cet email existe, un lien de réinitialisation a été envoyé."}
        )


class PortalPasswordResetConfirmView(APIView):
    """POST /api/portal/auth/reset-password/confirm/ — AllowAny"""
    permission_classes = [AllowAny]

    def post(self, request):
        ser = PortalPasswordResetConfirmSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        try:
            account = PatientPortalAccount.objects.get(
                reset_token=ser.validated_data["token"],
                is_active=True,
            )
        except PatientPortalAccount.DoesNotExist:
            return Response({"detail": "Token invalide."}, status=400)

        if account.reset_token_expires and timezone.now() > account.reset_token_expires:
            return Response({"detail": "Token expiré. Veuillez refaire une demande."}, status=400)

        account.set_password(ser.validated_data["new_password"])
        account.reset_token = ""
        account.reset_token_expires = None
        account.save()
        return Response({"detail": "Mot de passe réinitialisé avec succès."})


# ─── 2. Dashboard ─────────────────────────────────────────────────────────────

class PortalDashboardView(APIView):
    """GET /api/portal/dashboard/"""
    permission_classes = [AllowAny]

    @_portal_required
    def get(self, request):
        patient = request.portal_patient

        # Prochains RDV (5 max)
        upcoming = Appointment.objects.filter(
            patient=patient,
            status__in=["scheduled", "confirmed"],
            appointment_date__gte=timezone.now(),
        ).select_related("extension__doctor", "extension__room").order_by("appointment_date")[:5]

        # Plan de traitement actif
        active_plan = (
            TreatmentPlan.objects.filter(patient=patient, status="active")
            .prefetch_related("sessions")
            .first()
        )

        # Messages non lus
        unread = PortalMessage.objects.filter(
            patient=patient,
            direction=PortalMessage.Direction.STAFF_TO_PATIENT,
            is_read=False,
        ).count()

        # Factures impayées
        try:
            from apps.accounting.models import Invoice
            unpaid_qs = Invoice.objects.filter(patient=patient, status="issued")
            unpaid_count = unpaid_qs.count()
            unpaid_total = sum(inv.total_amount for inv in unpaid_qs) if unpaid_count else 0
        except Exception:
            unpaid_count = 0
            unpaid_total = 0

        from .serializers import (
            PortalAppointmentSerializer,
            PortalTreatmentPlanSerializer,
            PortalPatientProfileSerializer,
        )

        data = {
            "patient": PortalPatientProfileSerializer(patient).data,
            "upcoming_appointments": PortalAppointmentSerializer(upcoming, many=True).data,
            "active_treatment": PortalTreatmentPlanSerializer(active_plan).data if active_plan else None,
            "unread_messages": unread,
            "unpaid_invoices_count": unpaid_count,
            "unpaid_invoices_total": str(unpaid_total),
        }
        return Response(data)


# ─── 3. Historique Médical ────────────────────────────────────────────────────

class PortalMedicalHistoryView(APIView):
    """GET /api/portal/medical-history/?filter=6m|1y|all"""
    permission_classes = [AllowAny]

    @_portal_required
    def get(self, request):
        patient = request.portal_patient
        period = request.query_params.get("filter", "all")

        qs = TreatmentPlan.objects.filter(patient=patient).prefetch_related("sessions")

        if period == "6m":
            cutoff = timezone.now() - timezone.timedelta(days=180)
            qs = qs.filter(start_date__gte=cutoff)
        elif period == "1y":
            cutoff = timezone.now() - timezone.timedelta(days=365)
            qs = qs.filter(start_date__gte=cutoff)

        qs = qs.order_by("-start_date")
        return Response(PortalTreatmentPlanSerializer(qs, many=True).data)


class PortalAppointmentHistoryView(APIView):
    """GET /api/portal/appointments/?filter=6m|1y|all&upcoming=true"""
    permission_classes = [AllowAny]

    @_portal_required
    def get(self, request):
        patient = request.portal_patient
        period = request.query_params.get("filter", "all")
        upcoming_only = request.query_params.get("upcoming") == "true"

        qs = Appointment.objects.filter(patient=patient).select_related(
            "extension__doctor",
            "extension__room",
        )

        if upcoming_only:
            qs = qs.filter(
                status__in=["scheduled", "confirmed"],
                appointment_date__gte=timezone.now(),
            )
        else:
            if period == "6m":
                cutoff = timezone.now() - timezone.timedelta(days=180)
                qs = qs.filter(appointment_date__gte=cutoff)
            elif period == "1y":
                cutoff = timezone.now() - timezone.timedelta(days=365)
                qs = qs.filter(appointment_date__gte=cutoff)

        qs = qs.order_by("-appointment_date")
        from .serializers import PortalAppointmentSerializer
        return Response(PortalAppointmentSerializer(qs, many=True).data)


# ─── 4. Documents ─────────────────────────────────────────────────────────────

class PortalDocumentListView(APIView):
    """GET /api/portal/documents/"""
    permission_classes = [AllowAny]

    @_portal_required
    def get(self, request):
        patient = request.portal_patient
        doc_type = request.query_params.get("type")
        qs = PatientDocument.objects.filter(patient=patient).select_related("uploaded_by")
        if doc_type:
            qs = qs.filter(document_type=doc_type)
        return Response(PatientDocumentSerializer(qs, many=True).data)


class PortalDocumentDownloadView(APIView):
    """GET /api/portal/documents/<pk>/download/"""
    permission_classes = [AllowAny]

    @_portal_required
    def get(self, request, pk):
        patient = request.portal_patient
        try:
            doc = PatientDocument.objects.get(pk=pk, patient=patient)
        except PatientDocument.DoesNotExist:
            return Response({"detail": "Document introuvable."}, status=404)

        # Retourner l'URL CDN ou le chemin pour le frontend
        return Response({
            "id": doc.id,
            "title": doc.title,
            "file_path": doc.file_path,
            "document_type": doc.document_type,
        })


# ─── 5. Messagerie ────────────────────────────────────────────────────────────

class PortalMessageListView(APIView):
    """
    GET  /api/portal/messages/        — liste des messages
    POST /api/portal/messages/        — envoyer un message au staff
    """
    permission_classes = [AllowAny]

    @_portal_required
    def get(self, request):
        patient = request.portal_patient
        qs = PortalMessage.objects.filter(patient=patient)

        # Marquer les messages staff→patient comme lus
        unread = qs.filter(
            direction=PortalMessage.Direction.STAFF_TO_PATIENT, is_read=False
        )
        for msg in unread:
            msg.mark_read()

        return Response(PortalMessageSerializer(qs, many=True).data)

    @_portal_required
    def post(self, request):
        patient = request.portal_patient
        ser = PortalMessageCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        msg = PortalMessage.objects.create(
            patient=patient,
            direction=PortalMessage.Direction.PATIENT_TO_STAFF,
            subject=ser.validated_data.get("subject", ""),
            content=ser.validated_data["content"],
        )
        # TODO: notifier le staff par email/notification interne
        return Response(PortalMessageSerializer(msg).data, status=201)


class PortalUnreadCountView(APIView):
    """GET /api/portal/messages/unread-count/"""
    permission_classes = [AllowAny]

    @_portal_required
    def get(self, request):
        patient = request.portal_patient
        count = PortalMessage.objects.filter(
            patient=patient,
            direction=PortalMessage.Direction.STAFF_TO_PATIENT,
            is_read=False,
        ).count()
        return Response({"unread": count})


# ── Vue Staff : répondre à un patient ──────────────────────────────────────────

class StaffReplyToPatientView(APIView):
    """
    POST /api/crm/portal/staff-reply/
    Réservée au staff authentifié (agent, médecin, secrétaire).
    """
    permission_classes = [CrmPermission]

    def post(self, request):
        ser = StaffReplySerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        try:
            patient = Patient.objects.get(pk=ser.validated_data["patient_id"])
        except Patient.DoesNotExist:
            return Response({"detail": "Patient introuvable."}, status=404)

        msg = PortalMessage.objects.create(
            patient=patient,
            direction=PortalMessage.Direction.STAFF_TO_PATIENT,
            staff_author=request.user,
            subject=ser.validated_data.get("subject", ""),
            content=ser.validated_data["content"],
        )
        # TODO: notifier le patient (email si notify_email, SMS si notify_sms)
        return Response(PortalMessageSerializer(msg).data, status=201)


# ─── 6. Notation ─────────────────────────────────────────────────────────────

class PortalRatingView(APIView):
    """
    GET  /api/portal/rating/   — historique des notations du patient
    POST /api/portal/rating/   — soumettre une nouvelle notation
    """
    permission_classes = [AllowAny]

    @_portal_required
    def get(self, request):
        patient = request.portal_patient
        ratings = PatientRating.objects.filter(patient=patient)
        return Response(PortalRatingSerializer(ratings, many=True).data)

    @_portal_required
    def post(self, request):
        patient = request.portal_patient
        ser = PortalRatingSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        rating = PatientRating.objects.create(
            patient=patient,
            score=ser.validated_data["score"],
            comment=ser.validated_data.get("comment", ""),
            is_anonymous=True,  # Toujours anonyme (CDC)
            treatment_session=ser.validated_data.get("treatment_session"),
        )
        return Response(PortalRatingSerializer(rating).data, status=201)


# ─── 7. Profil ────────────────────────────────────────────────────────────────

class PortalProfileView(APIView):
    """
    GET   /api/portal/profile/  — lire le profil
    PATCH /api/portal/profile/  — mettre à jour coordonnées
    """
    permission_classes = [AllowAny]

    @_portal_required
    def get(self, request):
        patient = request.portal_patient
        account = request.portal_account
        return Response({
            "patient": PortalPatientProfileSerializer(patient).data,
            "account": PortalAccountSerializer(account).data,
        })

    @_portal_required
    def patch(self, request):
        patient = request.portal_patient
        account = request.portal_account

        # Mise à jour coordonnées patient (champs autorisés seulement)
        patient_ser = PortalPatientProfileSerializer(
            patient, data=request.data.get("patient", {}), partial=True
        )
        patient_ser.is_valid(raise_exception=True)
        patient_ser.save()

        # Mise à jour préférences notification
        account_ser = PortalAccountSerializer(
            account, data=request.data.get("account", {}), partial=True
        )
        account_ser.is_valid(raise_exception=True)
        account_ser.save()

        return Response({
            "patient": patient_ser.data,
            "account": account_ser.data,
        })


# ─── 8. Création compte portail (Staff seulement) ────────────────────────────

class PortalRegisterView(APIView):
    """
    POST /api/crm/portal/register/
    Réservé au staff authentifié (secrétaire/admin) pour créer un compte portail.
    """
    permission_classes = [CrmPermission]

    def post(self, request):
        ser = PortalRegisterSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        account = ser.save()
        return Response(
            {
                "detail": "Compte portail créé.",
                "email": account.email,
                "patient_id": account.patient.id,
            },
            status=201,
        )
# ═══════════════════════════════════════════════════════════════════════════════
# US-APT-02 : Rendez-vous Intelligents — Vues
# ═══════════════════════════════════════════════════════════════════════════════


class SmartSuggestView(APIView):
    """
    POST /api/crm/appointments/smart-suggest/
    Retourne 3 créneaux optimaux scorés.
    """
    permission_classes = [CrmPermission]

    def post(self, request):
        from .serializers import SmartSuggestRequestSerializer
        ser = SmartSuggestRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        try:
            patient = Patient.objects.get(pk=d["patient_id"])
        except Patient.DoesNotExist:
            return Response({"detail": "Patient introuvable."}, status=404)

        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            User.objects.get(pk=d["doctor_id"])
        except User.DoesNotExist:
            return Response({"detail": "Médecin introuvable."}, status=404)

        suggestions = suggest_slots(
            patient=patient,
            doctor_id=d["doctor_id"],
            appointment_type=d.get("appointment_type", "simple"),
            priority=d.get("priority", 2),
            target_date=d.get("target_date"),
        )

        if not suggestions:
            return Response(
                {"detail": "Aucun créneau disponible dans les 60 prochains jours."},
                status=404,
            )

        result = [
            {
                "type": s["type"],
                "datetime": s["datetime"].isoformat(),
                "duration_minutes": s["duration"],
                "score": s["score"],
                "score_label": f"⭐ {s['score']}/10",
            }
            for s in suggestions
        ]
        return Response({"suggestions": result, "count": len(result)})


class SmartBookView(APIView):
    """
    POST /api/crm/appointments/smart-book/
    Crée le RDV à partir d'un créneau sélectionné.
    """
    permission_classes = [CrmPermission]

    def post(self, request):
        from .serializers import SmartBookRequestSerializer
        ser = SmartBookRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        try:
            patient = Patient.objects.get(pk=d["patient_id"])
        except Patient.DoesNotExist:
            return Response({"detail": "Patient introuvable."}, status=404)

        apt = book_slot(
            patient=patient,
            doctor_id=d["doctor_id"],
            slot_dt=d["slot_datetime"],
            appointment_type=d.get("appointment_type", "simple"),
            priority=d.get("priority", 2),
            room_id=d.get("room_id"),
            machine_id=d.get("machine_id"),
            reason=d.get("reason", ""),
        )

        ext = apt.extension
        return Response(
            {
                "appointment_id": apt.id,
                "appointment_date": apt.appointment_date.isoformat(),
                "status": apt.status,
                "duration_minutes": ext.duration_minutes,
                "confirmation_token": ext.confirmation_token,
                "confirmation_deadline": ext.confirmation_deadline.isoformat() if ext.confirmation_deadline else None,
                "message": "Rendez-vous créé. En attente de confirmation patient (48h).",
            },
            status=201,
        )


class AppointmentConfirmView(APIView):
    """
    GET /api/crm/appointments/confirm/<token>/
    Confirmation 1-clic depuis le lien email patient. AllowAny.
    """
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            ext = AppointmentExtension.objects.select_related("appointment").get(
                confirmation_token=token
            )
        except AppointmentExtension.DoesNotExist:
            return Response({"detail": "Lien de confirmation invalide."}, status=404)

        if ext.confirmed_at:
            return Response({"detail": "Ce rendez-vous est déjà confirmé.", "status": "already_confirmed"})

        if ext.confirmation_deadline and timezone.now() > ext.confirmation_deadline:
            ext.appointment.status = "cancelled"
            ext.appointment.save()
            return Response(
                {"detail": "Ce lien a expiré (48h dépassées). Le rendez-vous a été annulé."},
                status=410,
            )

        ext.confirmed_at = timezone.now()
        ext.appointment.status = "confirmed"
        ext.appointment.save()
        ext.save()

        return Response({
            "detail": "Rendez-vous confirmé avec succès.",
            "appointment_date": ext.appointment.appointment_date.isoformat(),
        })


class AppointmentCancelView(APIView):
    """
    POST /api/crm/appointments/<pk>/cancel/
    Annule un RDV et propose le créneau à la liste d'attente.
    """
    permission_classes = [CrmPermission]

    def post(self, request, pk):
        notified = handle_cancellation(pk)
        return Response({
            "detail": "Rendez-vous annulé.",
            "waiting_list_notified": len(notified),
            "notified_patients": [
                f"{w.patient.first_name} {w.patient.last_name}" for w in notified
            ],
        })


class DoctorAvailabilityView(APIView):
    """
    GET  /api/crm/doctors/<doctor_id>/availability/
    POST /api/crm/doctors/<doctor_id>/availability/
    """
    permission_classes = [CrmPermission]

    def get(self, request, doctor_id):
        from .serializers import DoctorAvailabilitySerializer
        qs = DoctorAvailability.objects.filter(doctor_id=doctor_id, is_active=True)
        return Response(DoctorAvailabilitySerializer(qs, many=True).data)

    def post(self, request, doctor_id):
        from .serializers import DoctorAvailabilitySerializer
        data = {**request.data, "doctor": doctor_id}
        ser = DoctorAvailabilitySerializer(data=data)
        ser.is_valid(raise_exception=True)
        avail = ser.save()
        return Response(DoctorAvailabilitySerializer(avail).data, status=201)


class DoctorAvailabilityDetailView(APIView):
    """
    PATCH  /api/crm/doctors/availability/<pk>/
    DELETE /api/crm/doctors/availability/<pk>/
    """
    permission_classes = [CrmPermission]

    def _get(self, pk):
        try:
            return DoctorAvailability.objects.get(pk=pk)
        except DoctorAvailability.DoesNotExist:
            return None

    def patch(self, request, pk):
        from .serializers import DoctorAvailabilitySerializer
        obj = self._get(pk)
        if not obj:
            return Response({"detail": "Introuvable."}, status=404)
        ser = DoctorAvailabilitySerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, pk):
        obj = self._get(pk)
        if not obj:
            return Response({"detail": "Introuvable."}, status=404)
        obj.is_active = False
        obj.save()
        return Response(status=204)


class PatientPreferencesView(APIView):
    """
    GET /api/crm/patients/<patient_id>/scheduling-preferences/
    PUT /api/crm/patients/<patient_id>/scheduling-preferences/
    """
    permission_classes = [CrmPermission]

    def get(self, request, patient_id):
        from .serializers import PatientPreferencesSerializer
        prefs, _ = PatientSchedulingPreferences.objects.get_or_create(
            patient_id=patient_id,
            defaults={"preferred_time_slot": "any", "preferred_days": []},
        )
        return Response(PatientPreferencesSerializer(prefs).data)

    def put(self, request, patient_id):
        from .serializers import PatientPreferencesSerializer
        prefs, _ = PatientSchedulingPreferences.objects.get_or_create(patient_id=patient_id)
        ser = PatientPreferencesSerializer(prefs, data={**request.data, "patient": patient_id})
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class WaitingListView(APIView):
    """
    GET  /api/crm/waiting-list/
    POST /api/crm/waiting-list/
    """
    permission_classes = [CrmPermission]

    def get(self, request):
        from .serializers import WaitingListSerializer
        qs = WaitingList.objects.filter(is_active=True).select_related("patient", "doctor")
        return Response(WaitingListSerializer(qs, many=True).data)

    def post(self, request):
        from .serializers import WaitingListSerializer
        ser = WaitingListSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        entry = ser.save()
        return Response(WaitingListSerializer(entry).data, status=201)


class WaitingListRespondView(APIView):
    """
    POST /api/crm/waiting-list/<pk>/respond/
    Patient répond à une proposition (accept/decline). AllowAny (lien email).
    """
    permission_classes = [AllowAny]

    def post(self, request, pk):
        try:
            entry = WaitingList.objects.get(pk=pk)
        except WaitingList.DoesNotExist:
            return Response({"detail": "Introuvable."}, status=404)

        if not entry.proposal_still_valid:
            return Response({"detail": "Le délai de réponse est expiré (2h)."}, status=410)

        accept = request.data.get("accept", False)
        entry.proposal_accepted = bool(accept)

        if accept:
            apt = book_slot(
                patient=entry.patient,
                doctor_id=entry.doctor_id,
                slot_dt=entry.proposed_slot,
                appointment_type=entry.appointment_type,
                priority=entry.priority,
            )
            entry.is_active = False
            entry.save()
            return Response({
                "detail": "Rendez-vous confirmé.",
                "appointment_id": apt.id,
                "appointment_date": apt.appointment_date.isoformat(),
            })
        else:
            entry.proposed_slot = None
            entry.proposal_expires = None
            entry.save()
            return Response({"detail": "Proposition déclinée. Vous restez en liste d'attente."})


class AppointmentExtensionView(APIView):
    """
    GET   /api/crm/appointments/<pk>/extension/
    PATCH /api/crm/appointments/<pk>/extension/
    """
    permission_classes = [CrmPermission]

    def get(self, request, pk):
        from .serializers import AppointmentExtensionSerializer
        try:
            ext = AppointmentExtension.objects.select_related(
                "doctor", "room", "machine"
            ).get(appointment_id=pk)
        except AppointmentExtension.DoesNotExist:
            return Response({"detail": "Pas d'extension pour ce RDV."}, status=404)
        return Response(AppointmentExtensionSerializer(ext).data)

    def patch(self, request, pk):
        from .serializers import AppointmentExtensionSerializer
        try:
            ext = AppointmentExtension.objects.get(appointment_id=pk)
        except AppointmentExtension.DoesNotExist:
            return Response({"detail": "Pas d'extension pour ce RDV."}, status=404)
        ser = AppointmentExtensionSerializer(ext, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)
    
# ─────────────────────────────────────────────────────────────────────────────
# US-TRT-05 — Protocoles de Traitement : viewsets
# À coller à la fin de backend/apps/crm/views.py
#
# ET ajouter dans l'import models en tête de views.py :
#   TreatmentProtocol, ProtocolChangeLog, DoseDeviation,
#
# ET ajouter dans l'import serializers en tête de views.py :
#   TreatmentProtocolSerializer, TreatmentProtocolListSerializer,
#   DoseDeviationSerializer, ProtocolChangeLogSerializer,
# ─────────────────────────────────────────────────────────────────────────────


class TreatmentProtocolViewSet(viewsets.ModelViewSet):
    """
    CRUD complet + actions workflow pour les protocoles de traitement.

    GET    /api/crm/protocols/              → liste (filtre ?status=)
    POST   /api/crm/protocols/              → créer (draft)
    GET    /api/crm/protocols/{id}/         → détail + changelog
    PUT    /api/crm/protocols/{id}/         → modifier (draft/pending seulement)
    PATCH  /api/crm/protocols/{id}/         → modifier partiel
    DELETE /api/crm/protocols/{id}/         → supprimer (draft seulement)
    POST   /api/crm/protocols/{id}/submit/  → soumettre pour approbation
    POST   /api/crm/protocols/{id}/approve/ → approuver (médecin/admin)
    POST   /api/crm/protocols/{id}/reject/  → rejeter → retour draft
    POST   /api/crm/protocols/{id}/archive/ → archiver un approuvé
    POST   /api/crm/protocols/{id}/clone/   → nouvelle version
    GET    /api/crm/protocols/{id}/versions/ → toutes les versions de la lignée
    """
    permission_classes = [CrmPermission]
    queryset = TreatmentProtocol.objects.select_related(
        "created_by", "approved_by", "parent"
    ).prefetch_related("changelog__performed_by")

    def get_serializer_class(self):
        if self.action == "retrieve":
            return TreatmentProtocolSerializer
        return TreatmentProtocolListSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        status = self.request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)
        cancer = self.request.query_params.get("cancer_type")
        if cancer:
            qs = qs.filter(cancer_type__icontains=cancer)
        search = self.request.query_params.get("search")
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(icd10_code__icontains=search)
                | Q(cancer_type__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        proto = serializer.save(
            status=TreatmentProtocol.Status.DRAFT,
            created_by=self.request.user,
        )
        ProtocolChangeLog.objects.create(
            protocol=proto,
            action="created",
            performed_by=self.request.user,
            comment="Protocole créé",
        )

    def update(self, request, *args, **kwargs):
        proto = self.get_object()
        if proto.status not in (
            TreatmentProtocol.Status.DRAFT,
            TreatmentProtocol.Status.PENDING,
        ):
            return Response(
                {"detail": "Seuls les protocoles en brouillon ou en attente peuvent être modifiés."},
                status=400,
            )
        old_data = TreatmentProtocolListSerializer(proto).data
        response = super().update(request, *args, **kwargs)
        new_data = TreatmentProtocolListSerializer(self.get_object()).data
        # Log champs modifiés
        changes = {
            k: {"from": str(old_data.get(k)), "to": str(new_data.get(k))}
            for k in old_data
            if old_data.get(k) != new_data.get(k) and k not in ("updated_at",)
        }
        if changes:
            ProtocolChangeLog.objects.create(
                protocol=self.get_object(),
                action="updated",
                performed_by=request.user,
                changes=changes,
            )
        return response

    def destroy(self, request, *args, **kwargs):
        proto = self.get_object()
        if proto.status != TreatmentProtocol.Status.DRAFT:
            return Response(
                {"detail": "Seuls les brouillons peuvent être supprimés."},
                status=400,
            )
        return super().destroy(request, *args, **kwargs)

    # ── Actions workflow ───────────────────────────────────────────────────

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        """draft → pending"""
        proto = self.get_object()
        if proto.status != TreatmentProtocol.Status.DRAFT:
            return Response(
                {"detail": "Seul un brouillon peut être soumis."},
                status=400,
            )
        proto.status = TreatmentProtocol.Status.PENDING
        proto.save(update_fields=["status", "updated_at"])
        ProtocolChangeLog.objects.create(
            protocol=proto,
            action="submitted",
            performed_by=request.user,
            comment=request.data.get("comment", ""),
        )
        return Response(TreatmentProtocolSerializer(proto).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """pending → approved"""
        proto = self.get_object()
        if proto.status != TreatmentProtocol.Status.PENDING:
            return Response(
                {"detail": "Seul un protocole en attente peut être approuvé."},
                status=400,
            )
        now = timezone.now()
        proto.status      = TreatmentProtocol.Status.APPROVED
        proto.approved_by = request.user
        proto.approved_at = now
        proto.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
        ProtocolChangeLog.objects.create(
            protocol=proto,
            action="approved",
            performed_by=request.user,
            comment=request.data.get("comment", ""),
        )
        return Response(TreatmentProtocolSerializer(proto).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """pending → draft"""
        proto = self.get_object()
        if proto.status != TreatmentProtocol.Status.PENDING:
            return Response(
                {"detail": "Seul un protocole en attente peut être rejeté."},
                status=400,
            )
        proto.status = TreatmentProtocol.Status.DRAFT
        proto.save(update_fields=["status", "updated_at"])
        ProtocolChangeLog.objects.create(
            protocol=proto,
            action="rejected",
            performed_by=request.user,
            comment=request.data.get("comment", "Rejeté sans commentaire."),
        )
        return Response(TreatmentProtocolSerializer(proto).data)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """approved → archived"""
        proto = self.get_object()
        if proto.status != TreatmentProtocol.Status.APPROVED:
            return Response(
                {"detail": "Seul un protocole approuvé peut être archivé."},
                status=400,
            )
        proto.status = TreatmentProtocol.Status.ARCHIVED
        proto.save(update_fields=["status", "updated_at"])
        ProtocolChangeLog.objects.create(
            protocol=proto,
            action="archived",
            performed_by=request.user,
            comment=request.data.get("comment", ""),
        )
        return Response({"detail": "Protocole archivé."})

    @action(detail=True, methods=["post"])
    def clone(self, request, pk=None):
        """
        Crée une nouvelle version (draft) à partir de la version approuvée.
        Incrémente version, lie parent.
        """
        proto = self.get_object()
        if proto.status != TreatmentProtocol.Status.APPROVED:
            return Response(
                {"detail": "Seul un protocole approuvé peut être cloné."},
                status=400,
            )
        new_proto = TreatmentProtocol.objects.create(
            parent                  = proto,
            version                 = proto.version + 1,
            name                    = proto.name,
            icd10_code              = proto.icd10_code,
            icd10_label             = proto.icd10_label,
            cancer_type             = proto.cancer_type,
            radiation_type          = proto.radiation_type,
            total_dose_gy           = proto.total_dose_gy,
            dose_per_fraction_gy    = proto.dose_per_fraction_gy,
            number_of_fractions     = proto.number_of_fractions,
            fraction_interval       = proto.fraction_interval,
            total_duration_days     = proto.total_duration_days,
            international_reference = proto.international_reference,
            description             = proto.description,
            preparation_instructions = proto.preparation_instructions,
            contraindications       = proto.contraindications,
            status                  = TreatmentProtocol.Status.DRAFT,
            created_by              = request.user,
        )
        ProtocolChangeLog.objects.create(
            protocol=new_proto,
            action="cloned",
            performed_by=request.user,
            comment=f"Cloné depuis v{proto.version} (id {proto.id})",
        )
        return Response(
            TreatmentProtocolSerializer(new_proto).data,
            status=201,
        )

    @action(detail=True, methods=["get"])
    def versions(self, request, pk=None):
        """
        Retourne toutes les versions de la même lignée (même root parent).
        """
        proto = self.get_object()
        # Remonte jusqu'à la racine
        root = proto
        visited = set()
        while root.parent_id and root.parent_id not in visited:
            visited.add(root.id)
            root = root.parent

        def _collect_ids(node):
            ids = [node.id]
            for child in node.children.all():
                ids.extend(_collect_ids(child))
            return ids

        ids = _collect_ids(root)
        qs  = TreatmentProtocol.objects.filter(id__in=ids).order_by("version")
        return Response(TreatmentProtocolListSerializer(qs, many=True).data)


class DoseDeviationViewSet(viewsets.ModelViewSet):
    """
    GET    /api/crm/dose-deviations/               → liste (filtre ?reviewed=false)
    GET    /api/crm/dose-deviations/{id}/           → détail
    PATCH  /api/crm/dose-deviations/{id}/           → mettre à jour notes
    POST   /api/crm/dose-deviations/{id}/review/    → marquer comme relu
    """
    permission_classes = [CrmPermission]
    serializer_class    = DoseDeviationSerializer
    queryset = DoseDeviation.objects.select_related(
        "session__patient", "protocol", "reviewed_by"
    ).order_by("-created_at")

    def get_queryset(self):
        qs = super().get_queryset()
        reviewed = self.request.query_params.get("reviewed")
        if reviewed is not None:
            qs = qs.filter(reviewed=reviewed.lower() == "true")
        severity = self.request.query_params.get("severity")
        if severity:
            qs = qs.filter(severity=severity)
        return qs

    def create(self, request, *args, **kwargs):
        """
        Création automatique : calcule deviation_pct et severity.
        expected_dose_gy et delivered_dose_gy obligatoires.
        """
        expected  = float(request.data.get("expected_dose_gy", 0))
        delivered = float(request.data.get("delivered_dose_gy", 0))
        if expected <= 0:
            return Response({"detail": "expected_dose_gy doit être > 0."}, status=400)
        pct = ((delivered - expected) / expected) * 100
        data = {
            **request.data,
            "deviation_pct": round(pct, 2),
            "severity": DoseDeviation.classify_severity(pct),
        }
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=201)

    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        """Marquer un écart comme relu par le médecin."""
        deviation = self.get_object()
        deviation.reviewed    = True
        deviation.reviewed_by = request.user
        deviation.reviewed_at = timezone.now()
        deviation.notes = request.data.get("notes", deviation.notes)
        deviation.save(update_fields=["reviewed", "reviewed_by", "reviewed_at", "notes"])
        return Response(DoseDeviationSerializer(deviation).data)