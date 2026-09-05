from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AbsenceViewSet, EmployeeViewSet, LeaveRequestViewSet,
    SalaryAdvanceViewSet, ShiftViewSet,
    SkillViewSet, EmployeeSkillViewSet,
    TrainingSessionViewSet, TrainingEnrollmentViewSet,
)

router = DefaultRouter()
router.register("employees",            EmployeeViewSet,           basename="employee")
router.register("leave-requests",       LeaveRequestViewSet,       basename="leave-request")
router.register("absences",             AbsenceViewSet,            basename="absence")
router.register("salary-advances",      SalaryAdvanceViewSet,      basename="salary-advance")
router.register("shifts",               ShiftViewSet,              basename="shift")
router.register("skills",               SkillViewSet,              basename="skill")
router.register("employee-skills",      EmployeeSkillViewSet,      basename="employee-skill")
router.register("training-sessions",    TrainingSessionViewSet,    basename="training-session")
router.register("training-enrollments", TrainingEnrollmentViewSet, basename="training-enrollment")

urlpatterns = [
    path("", include(router.urls)),
]