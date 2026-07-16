from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (
    AppointmentViewSet,
    PatientViewSet,
    TreatmentPlanViewSet,
    TreatmentSessionViewSet,
    ComplaintViewSet,
    TicketViewSet,
)

router = DefaultRouter()
router.register("patients", PatientViewSet, basename="patient")
router.register("appointments", AppointmentViewSet, basename="appointment")
router.register("treatment-plans", TreatmentPlanViewSet, basename="treatment-plan")
router.register("treatment-sessions", TreatmentSessionViewSet, basename="treatment-session")
router.register("complaints", ComplaintViewSet, basename="complaint")
router.register("tickets", TicketViewSet, basename="ticket")
urlpatterns = [
    path("", include(router.urls)),
]