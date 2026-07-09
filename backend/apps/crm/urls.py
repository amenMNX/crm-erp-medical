from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (
    AppointmentViewSet,
    PatientViewSet,
    TreatmentPlanViewSet,
    TreatmentSessionViewSet,
)

router = DefaultRouter()
router.register("patients", PatientViewSet, basename="patient")
router.register("appointments", AppointmentViewSet, basename="appointment")
router.register("treatment-plans", TreatmentPlanViewSet, basename="treatment-plan")
router.register("treatment-sessions", TreatmentSessionViewSet, basename="treatment-session")

urlpatterns = [
    path("", include(router.urls)),
]