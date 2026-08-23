# apps/hr/views.py
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from apps.accounts.permissions import ReadOnlyOrRole
from .models import Absence, Employee, LeaveRequest, SalaryAdvance, Shift
from .serializers import (
    AbsenceSerializer,
    EmployeeSerializer,
    LeaveRequestSerializer,
    SalaryAdvanceSerializer,
    ShiftSerializer,
)


class HrPermission(ReadOnlyOrRole):
    allowed_roles = ["admin", "hr"]


class IsSuperuser(BasePermission):
    """Grants access only to superusers — nobody else can set or change
    an employee's login password, not even staff admins or HR managers."""

    message = "Only superadmins can perform this action."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.select_related("user", "salary_config").prefetch_related("leave_requests").all()
    serializer_class = EmployeeSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["department", "contract_type", "is_active"]
    search_fields = [
        "employee_number",
        "first_name",
        "last_name",
        "job_title",
        "department",
        "email",
        "phone",
        "user__username",
    ]
    ordering_fields = ["last_name", "first_name", "hire_date", "created_at"]

    @action(
        detail=True,
        methods=["post"],
        url_path="set-password",
        permission_classes=[IsSuperuser],   # ← superadmins only
    )
    def set_password(self, request, pk=None):
        """
        POST /hr/employees/{id}/set-password/
        Body: { "password": "newSecret123" }

        Superadmins only — sets or resets an employee's login password.
        """
        employee = self.get_object()

        if not employee.user_id:
            return Response(
                {"detail": "This employee has no linked user account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        password = request.data.get("password", "")
        if not password or len(password) < 8:
            return Response(
                {"detail": "Password must be at least 8 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        employee.user.set_password(password)
        employee.user.save(update_fields=["password"])
        return Response({"detail": "Password updated successfully."}, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["post"],
        url_path="link-user",
        permission_classes=[IsSuperuser],   # ← superadmins only
    )
    def link_user(self, request, pk=None):
        """
        POST /hr/employees/{id}/link-user/
        Body: { "user_id": 42 }   (or omit to auto-create a new Django user)

        Lets an admin manually link an existing Django User to an employee,
        or trigger the auto-creation flow if the employee was created before
        the auto-create logic was in place.
        """
        from django.contrib.auth import get_user_model
        employee = self.get_object()
        User = get_user_model()

        user_id = request.data.get("user_id")

        if user_id:
            try:
                user = User.objects.get(pk=user_id)
            except User.DoesNotExist:
                return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        else:
            # Auto-create
            serializer = self.get_serializer(employee)
            user = serializer._get_or_create_django_user(
                first_name=employee.first_name,
                last_name=employee.last_name,
                email=employee.email,
                password=None,
                job_title=employee.job_title,
            )

        employee.user = user
        employee.save(update_fields=["user"])
        return Response(
            {"detail": "User linked.", "user_id": user.pk, "username": user.username},
            status=status.HTTP_200_OK,
        )


class LeaveRequestViewSet(viewsets.ModelViewSet):
    queryset = LeaveRequest.objects.select_related("employee", "approved_by").all()
    serializer_class = LeaveRequestSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["statut", "employee"]
    search_fields = ["motif", "notes", "employee__first_name", "employee__last_name"]
    ordering_fields = ["date_debut", "date_fin", "created_at"]

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        leave_request = self.get_object()
        leave_request.statut = LeaveRequest.Status.ACCEPTEE
        leave_request.approved_by = request.user
        leave_request.save(update_fields=["statut", "approved_by", "updated_at"])
        return Response(self.get_serializer(leave_request).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        leave_request = self.get_object()
        leave_request.statut = LeaveRequest.Status.REFUSEE
        leave_request.approved_by = request.user
        leave_request.save(update_fields=["statut", "approved_by", "updated_at"])
        return Response(self.get_serializer(leave_request).data)


class AbsenceViewSet(viewsets.ModelViewSet):
    queryset = Absence.objects.select_related("employee").all()
    serializer_class = AbsenceSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["employee"]
    search_fields = ["motif", "employee__first_name", "employee__last_name"]
    ordering_fields = ["date", "created_at"]


class SalaryAdvanceViewSet(viewsets.ModelViewSet):
    queryset = SalaryAdvance.objects.select_related("employee", "approved_by").all()
    serializer_class = SalaryAdvanceSerializer
    permission_classes = [HrPermission]
    required_roles = ["hr", "admin"]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["statut", "employee"]
    search_fields = ["employee__first_name", "employee__last_name", "reason", "notes"]
    ordering_fields = ["request_date", "amount", "status", "created_at"]

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        advance = self.get_object()
        advance.statut = SalaryAdvance.Status.APPROUVEE
        advance.approved_by = request.user
        advance.save(update_fields=["statut", "approved_by", "updated_at"])
        return Response(self.get_serializer(advance).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        advance = self.get_object()
        advance.statut = SalaryAdvance.Status.REFUSEE
        advance.approved_by = request.user
        advance.save(update_fields=["statut", "approved_by", "updated_at"])
        return Response(self.get_serializer(advance).data)

    @action(detail=True, methods=["post"])
    def mark_repaid(self, request, pk=None):
        advance = self.get_object()
        advance.statut = SalaryAdvance.Status.REMBOURSEE
        advance.amount_repaid = advance.amount
        advance.repayment_date = request.data.get("repayment_date") or advance.repayment_date
        advance.save(update_fields=["statut", "amount_repaid", "repayment_date", "updated_at"])
        return Response(self.get_serializer(advance).data)


class ShiftViewSet(viewsets.ModelViewSet):
    queryset = Shift.objects.select_related("employee").all()
    serializer_class = ShiftSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["employee", "status", "location"]
    search_fields = ["title", "location", "notes", "employee__first_name", "employee__last_name"]
    ordering_fields = ["start_datetime", "end_datetime", "created_at"]


# ─── US-RH-01 : Compétences & Formations ─────────────────────────────────────

from .models import Skill, EmployeeSkill, TrainingSession, TrainingEnrollment
from .serializers import (
    SkillSerializer, EmployeeSkillSerializer,
    TrainingSessionSerializer, TrainingEnrollmentSerializer,
)


class SkillViewSet(viewsets.ModelViewSet):
    queryset = Skill.objects.all()
    serializer_class = SkillSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["category", "is_active"]
    search_fields = ["name", "description"]


class EmployeeSkillViewSet(viewsets.ModelViewSet):
    queryset = EmployeeSkill.objects.select_related("employee", "skill").all()
    serializer_class = EmployeeSkillSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["employee", "skill", "level"]
    search_fields = ["employee__first_name", "employee__last_name", "skill__name"]


class TrainingSessionViewSet(viewsets.ModelViewSet):
    queryset = TrainingSession.objects.prefetch_related("enrollments").all()
    serializer_class = TrainingSessionSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "skill"]
    search_fields = ["title", "description", "trainer"]
    ordering_fields = ["start_date", "end_date", "created_at"]


class TrainingEnrollmentViewSet(viewsets.ModelViewSet):
    queryset = TrainingEnrollment.objects.select_related("employee", "session").all()
    serializer_class = TrainingEnrollmentSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["session", "employee", "result"]
    search_fields = ["employee__first_name", "employee__last_name"]