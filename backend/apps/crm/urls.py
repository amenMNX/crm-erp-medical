from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers as nested_routers

from .views import (
    AppointmentViewSet,
    ComplaintViewSet,
    IncidentViewSet,
    MachineViewSet,
    PatientViewSet,
    PublicComplaintStatusView,
    PublicComplaintSubmitView,
    PublicTicketStatusView,
    PublicTicketSubmitView,
    RoomViewSet,
    TicketCommentViewSet,
    TicketViewSet,
    TreatmentPlanViewSet,
    TreatmentSessionViewSet,
)

# ── Main router ────────────────────────────────────────────────────────────────
router = DefaultRouter()

# CRM resources
router.register("patients", PatientViewSet, basename="patient")
router.register("appointments", AppointmentViewSet, basename="appointment")
router.register("treatment-plans", TreatmentPlanViewSet, basename="treatment-plan")
router.register("treatment-sessions", TreatmentSessionViewSet, basename="treatment-session")

# Equipment
router.register("machines", MachineViewSet, basename="machine")
router.register("rooms", RoomViewSet, basename="room")

# Support
router.register("complaints", ComplaintViewSet, basename="complaint")
router.register("tickets", TicketViewSet, basename="ticket")
router.register("incidents", IncidentViewSet, basename="incident")

# ── Nested router for ticket comments ─────────────────────────────────────────
tickets_router = nested_routers.NestedDefaultRouter(router, "tickets", lookup="ticket")
tickets_router.register("comments", TicketCommentViewSet, basename="ticket-comment")

# ── URL patterns ──────────────────────────────────────────────────────────────
urlpatterns = [
    # Public patient portal (no authentication)
    path("portal/tickets/submit/", PublicTicketSubmitView.as_view(), name="public-ticket-submit"),
    path("portal/tickets/status/", PublicTicketStatusView.as_view(), name="public-ticket-status"),
    path("portal/complaints/submit/", PublicComplaintSubmitView.as_view(), name="public-complaint-submit"),
    path("portal/complaints/status/", PublicComplaintStatusView.as_view(), name="public-complaint-status"),
    
    # API routes
    path("", include(router.urls)),
    path("", include(tickets_router.urls)),
]