"""
CRM Views Module

This module contains all ViewSets and APIViews for the CRM (Customer Relationship Management)
system, including patient management, appointments, treatment plans, tickets, complaints,
incidents, and public patient portal endpoints.
"""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.accounts.permissions import ReadOnlyOrRole
from apps.audit.mixins import AuditLoggingMixin
from apps.audit.models import AuditLogEntry
from apps.audit.utils import log_action

from .models import (
    Appointment, Complaint, Machine, Patient, Room,
    Ticket, TreatmentPlan, TreatmentSession,
    Incident, TicketComment,
)
from .serializers import (
    AppointmentSerializer,
    ComplaintSerializer,
    IncidentSerializer,
    MachineSerializer,
    PatientSerializer,
    PublicComplaintStatusSerializer,
    PublicComplaintSubmitSerializer,
    PublicTicketStatusSerializer,
    PublicTicketSubmitSerializer,
    RoomSerializer,
    TicketCommentSerializer,
    TicketSerializer,
    TreatmentPlanSerializer,
    TreatmentSessionSerializer,
)


# =============================================================================
# PERMISSION CLASSES
# =============================================================================

class CrmPermission(ReadOnlyOrRole):
    """
    Permission class for CRM (clinical) resources.
    
    Allows access to users with roles:
    - admin: Full system access
    - doctor: Medical staff
    - secretary: Administrative staff
    - radiotherapist: Radiation therapy staff
    
    Used for: Patients, Appointments, Treatment Plans, Treatment Sessions
    """
    allowed_roles = ["admin", "doctor", "secretary", "radiotherapist"]


class TicketPermission(ReadOnlyOrRole):
    """
    Permission class for support/ticketing resources.
    
    Allows access to users with roles:
    - admin: Full system access
    - support_client: Support agents handling tickets/complaints
    - secretary: Administrative staff
    
    Used for: Tickets, Complaints, Incidents
    """
    allowed_roles = ["admin", "support_client", "secretary"]


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
        # Aggregate invoice data from accounting module
        try:
            from apps.accounting.models import Invoice
            invoices_qs = Invoice.objects.filter(patient=patient)
            total_invoiced = sum(float(i.total_amount) for i in invoices_qs)
            total_paid = sum(float(i.paid_amount) for i in invoices_qs)
            open_invoices = invoices_qs.exclude(status="paid").count()
        except Exception:
            # Fallback if accounting module is not available
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
    """Manage radiotherapy machines."""
    
    queryset = Machine.objects.all()
    serializer_class = MachineSerializer
    permission_classes = [CrmPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status"]
    search_fields = ["name", "model"]
    ordering_fields = ["name", "status"]


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
    permission_classes = [permissions.IsAuthenticated]

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