from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers as nested_routers

from .views import (
    AppointmentViewSet,
    ComplaintViewSet,
    IncidentViewSet,
    MachineViewSet,
    MaintenanceLogViewSet,
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
    # ── Portail Patient ──
    PortalLoginView,
    PortalLogoutView,
    PortalMeView,
    PortalPasswordChangeView,
    PortalPasswordResetRequestView,
    PortalPasswordResetConfirmView,
    PortalDashboardView,
    PortalMedicalHistoryView,
    PortalAppointmentHistoryView,
    PortalDocumentListView,
    PortalDocumentDownloadView,
    PortalMessageListView,
    PortalUnreadCountView,
    StaffReplyToPatientView,
    PortalRatingView,
    PortalProfileView,
    PortalRegisterView,
    # ── US-APT-02 : Rendez-vous Intelligents ──
    SmartSuggestView,
    SmartBookView,
    AppointmentConfirmView,
    AppointmentCancelView,
    AppointmentExtensionView,
    DoctorAvailabilityView,
    DoctorAvailabilityDetailView,
    PatientPreferencesView,
    WaitingListView,
    WaitingListRespondView,
    # ── US-TRT-05 : Protocoles de Traitement ──
    TreatmentProtocolViewSet,
    DoseDeviationViewSet,
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
router.register("maintenance-logs", MaintenanceLogViewSet, basename="maintenance-log")

# US-TRT-05 — Protocoles de Traitement
router.register("protocols", TreatmentProtocolViewSet, basename="protocol")
router.register("dose-deviations", DoseDeviationViewSet, basename="dose-deviation")

# Support
router.register("complaints", ComplaintViewSet, basename="complaint")
router.register("tickets", TicketViewSet, basename="ticket")
router.register("incidents", IncidentViewSet, basename="incident")

# ── Nested router for ticket comments ─────────────────────────────────────────
tickets_router = nested_routers.NestedDefaultRouter(router, "tickets", lookup="ticket")
tickets_router.register("comments", TicketCommentViewSet, basename="ticket-comment")

# ── URL patterns ──────────────────────────────────────────────────────────────
urlpatterns = [

    # ── Portail Patient — Auth (AllowAny) ─────────────────────────────────
    path("portal/auth/login/",                    PortalLoginView.as_view(),                name="portal-login"),
    path("portal/auth/logout/",                   PortalLogoutView.as_view(),               name="portal-logout"),
    path("portal/auth/me/",                       PortalMeView.as_view(),                   name="portal-me"),
    path("portal/auth/change-password/",          PortalPasswordChangeView.as_view(),       name="portal-change-password"),
    path("portal/auth/reset-password/",           PortalPasswordResetRequestView.as_view(), name="portal-reset-password"),
    path("portal/auth/reset-password/confirm/",   PortalPasswordResetConfirmView.as_view(), name="portal-reset-password-confirm"),

    # ── Portail Patient — Données (session cookie) ────────────────────────
    path("portal/dashboard/",                     PortalDashboardView.as_view(),            name="portal-dashboard"),
    path("portal/medical-history/",               PortalMedicalHistoryView.as_view(),       name="portal-medical-history"),
    path("portal/appointments/",                  PortalAppointmentHistoryView.as_view(),   name="portal-appointments"),
    path("portal/documents/",                     PortalDocumentListView.as_view(),         name="portal-documents"),
    path("portal/documents/<int:pk>/download/",   PortalDocumentDownloadView.as_view(),     name="portal-document-download"),
    path("portal/messages/",                      PortalMessageListView.as_view(),          name="portal-messages"),
    path("portal/messages/unread-count/",         PortalUnreadCountView.as_view(),          name="portal-unread-count"),
    path("portal/rating/",                        PortalRatingView.as_view(),               name="portal-rating"),
    path("portal/profile/",                       PortalProfileView.as_view(),              name="portal-profile"),

    # ── Portail Patient — Staff (IsAuthenticated) ─────────────────────────
    path("portal/staff-reply/",                   StaffReplyToPatientView.as_view(),        name="portal-staff-reply"),
    path("portal/register/",                      PortalRegisterView.as_view(),             name="portal-register"),

    # ── Public (no auth) ──────────────────────────────────────────────────
    path("portal/tickets/submit/",                PublicTicketSubmitView.as_view(),         name="public-ticket-submit"),
    path("portal/tickets/status/",                PublicTicketStatusView.as_view(),         name="public-ticket-status"),
    path("portal/complaints/submit/",             PublicComplaintSubmitView.as_view(),      name="public-complaint-submit"),
    path("portal/complaints/status/",             PublicComplaintStatusView.as_view(),      name="public-complaint-status"),

    # ── US-APT-02 : Rendez-vous Intelligents ─────────────────────────────
    path("appointments/smart-suggest/",                     SmartSuggestView.as_view(),             name="apt-smart-suggest"),
    path("appointments/smart-book/",                        SmartBookView.as_view(),                name="apt-smart-book"),
    path("appointments/confirm/<str:token>/",               AppointmentConfirmView.as_view(),       name="apt-confirm"),
    path("appointments/<int:pk>/cancel/",                   AppointmentCancelView.as_view(),        name="apt-cancel"),
    path("appointments/<int:pk>/extension/",                AppointmentExtensionView.as_view(),     name="apt-extension"),
    path("doctors/<int:doctor_id>/availability/",           DoctorAvailabilityView.as_view(),       name="doctor-availability"),
    path("doctors/availability/<int:pk>/",                  DoctorAvailabilityDetailView.as_view(), name="doctor-availability-detail"),
    path("patients/<int:patient_id>/scheduling-preferences/", PatientPreferencesView.as_view(),     name="patient-scheduling-prefs"),
    path("waiting-list/",                                   WaitingListView.as_view(),              name="waiting-list"),
    path("waiting-list/<int:pk>/respond/",                  WaitingListRespondView.as_view(),       name="waiting-list-respond"),

    # ── Router URLs ───────────────────────────────────────────────────────
    path("", include(router.urls)),
    path("", include(tickets_router.urls)),
]