from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AbsenceViewSet, EmployeeViewSet, LeaveRequestViewSet

router = DefaultRouter()
router.register("employees", EmployeeViewSet, basename="employee")
router.register("leave-requests", LeaveRequestViewSet, basename="leave-request")
router.register("absences", AbsenceViewSet, basename="absence")

urlpatterns = [
    path("", include(router.urls)),
]