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
    # Must match the French name in RolePermission.write_permissions / frontend MODULES
    module_label = "Employés"


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
    queryset = LeaveRequest.objects.select_related("employee", "reviewed_by").all()
    serializer_class = LeaveRequestSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "employee"]
    search_fields = ["reason", "employee__first_name", "employee__last_name"]
    ordering_fields = ["start_date", "end_date", "created_at"]

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        leave_request = self.get_object()
        leave_request.status = LeaveRequest.Status.ACCEPTEE
        leave_request.reviewed_by = request.user
        leave_request.save(update_fields=["status", "reviewed_by", "updated_at"])
        return Response(self.get_serializer(leave_request).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        leave_request = self.get_object()
        leave_request.status = LeaveRequest.Status.REFUSEE
        leave_request.reviewed_by = request.user
        leave_request.save(update_fields=["status", "reviewed_by", "updated_at"])
        return Response(self.get_serializer(leave_request).data)


class AbsenceViewSet(viewsets.ModelViewSet):
    queryset = Absence.objects.select_related("employee").all()
    serializer_class = AbsenceSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["employee"]
    search_fields = ["justification", "absence_type", "employee__first_name", "employee__last_name"]
    ordering_fields = ["date", "created_at"]


class SalaryAdvanceViewSet(viewsets.ModelViewSet):
    queryset = SalaryAdvance.objects.select_related("employee", "reviewed_by").all()
    serializer_class = SalaryAdvanceSerializer
    permission_classes = [HrPermission]
    required_roles = ["hr", "admin"]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "employee"]
    search_fields = ["employee__first_name", "employee__last_name", "reason"]
    ordering_fields = ["amount", "status", "created_at"]

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        advance = self.get_object()
        advance.status = SalaryAdvance.Status.APPROUVE
        advance.reviewed_by = request.user
        advance.save(update_fields=["status", "reviewed_by", "updated_at"])
        return Response(self.get_serializer(advance).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        advance = self.get_object()
        advance.status = SalaryAdvance.Status.REFUSE
        advance.reviewed_by = request.user
        advance.save(update_fields=["status", "reviewed_by", "updated_at"])
        return Response(self.get_serializer(advance).data)

    @action(detail=True, methods=["post"])
    def mark_repaid(self, request, pk=None):
        advance = self.get_object()
        advance.status = "Remboursée"
        advance.reviewed_by = request.user
        advance.save(update_fields=["status", "reviewed_by", "updated_at"])
        return Response(self.get_serializer(advance).data)


class ShiftViewSet(viewsets.ModelViewSet):
    queryset = Shift.objects.select_related("employee").all()
    serializer_class = ShiftSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["employee", "date"]
    search_fields = ["notes", "employee__first_name", "employee__last_name"]
    ordering_fields = ["date", "start_time", "created_at"]


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
    filterset_fields = []
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
    filterset_fields = ["status"]
    search_fields = ["title", "description", "trainer"]
    ordering_fields = ["start_date", "end_date", "created_at"]


class TrainingEnrollmentViewSet(viewsets.ModelViewSet):
    queryset = TrainingEnrollment.objects.select_related("employee", "session").all()
    serializer_class = TrainingEnrollmentSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["session", "employee"]
    search_fields = ["employee__first_name", "employee__last_name"]

# ── S3: Document Request ViewSet ─────────────────────────────────────────────

from .models import DocumentRequest
from .serializers import DocumentRequestSerializer


class DocumentRequestViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentRequestSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["statut", "document_type", "employee"]
    search_fields = ["employee__first_name", "employee__last_name", "motif"]
    ordering_fields = ["created_at", "statut"]

    def get_queryset(self):
        user = self.request.user
        profile = getattr(user, "profile", None)
        is_privileged = (
            getattr(profile, "is_super_admin", False)
            or getattr(profile, "role", None) in ("admin", "hr")
            or user.is_superuser
        )
        if is_privileged:
            return DocumentRequest.objects.select_related("employee", "handled_by").all()
        try:
            employee = user.employee_profile
            return DocumentRequest.objects.filter(employee=employee).select_related("employee", "handled_by")
        except Exception:
            return DocumentRequest.objects.none()

    @action(detail=True, methods=["post"], url_path="mark-ready")
    def mark_ready(self, request, pk=None):
        doc = self.get_object()
        doc.statut = DocumentRequest.Status.PRET
        doc.handled_by = request.user
        doc.save(update_fields=["statut", "handled_by", "updated_at"])
        return Response(self.get_serializer(doc).data)

    @action(detail=True, methods=["post"], url_path="mark-refused")
    def mark_refused(self, request, pk=None):
        doc = self.get_object()
        doc.statut = DocumentRequest.Status.REFUSE
        doc.handled_by = request.user
        doc.save(update_fields=["statut", "handled_by", "updated_at"])
        return Response(self.get_serializer(doc).data)


# ── S6: Recruitment ViewSets ─────────────────────────────────────────────────

from .models import JobPost, Application, RecruitmentComment
from .serializers import JobPostSerializer, ApplicationSerializer, RecruitmentCommentSerializer


class JobPostViewSet(viewsets.ModelViewSet):
    serializer_class = JobPostSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "contract_type", "department", "is_internal"]
    search_fields = ["title", "description", "requirements"]
    ordering_fields = ["created_at", "posted_at", "closing_date"]

    def get_queryset(self):
        user = self.request.user
        profile = getattr(user, "profile", None)
        is_privileged = (
            getattr(profile, "is_super_admin", False)
            or getattr(profile, "role", None) in ("admin", "hr")
            or user.is_superuser
        )
        if is_privileged:
            return JobPost.objects.all()
        return JobPost.objects.filter(status=JobPost.Status.PUBLISHED)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        job = self.get_object()
        if job.status != JobPost.Status.DRAFT:
            return Response(
                {"detail": "Seules les offres en brouillon peuvent être publiées."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        job.publish(request.user)
        return Response(self.get_serializer(job).data)

    @action(detail=True, methods=["get"], url_path="applications")
    def list_applications(self, request, pk=None):
        job = self.get_object()
        apps = Application.objects.filter(job_post=job)
        return Response(ApplicationSerializer(apps, many=True).data)


class ApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = ApplicationSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "source", "job_post"]
    search_fields = ["first_name", "last_name", "email"]
    ordering_fields = ["applied_at", "rating"]

    def get_queryset(self):
        user = self.request.user
        profile = getattr(user, "profile", None)
        is_privileged = (
            getattr(profile, "is_super_admin", False)
            or getattr(profile, "role", None) in ("admin", "hr")
            or user.is_superuser
        )
        if is_privileged:
            return Application.objects.select_related("job_post", "candidate", "referred_by").all()
        try:
            emp = user.employee_profile
            return Application.objects.filter(referred_by=emp)
        except Exception:
            return Application.objects.none()

    def perform_create(self, serializer):
        try:
            emp = self.request.user.employee_profile
            serializer.save(
                candidate=emp, first_name=emp.first_name, last_name=emp.last_name,
                email=emp.email, phone=emp.phone, source=Application.Source.INTERNAL,
            )
        except Exception:
            serializer.save()

    @action(detail=True, methods=["post"], url_path="advance-to-interview")
    def advance_to_interview(self, request, pk=None):
        app = self.get_object()
        interview_date = request.data.get("interview_date")
        if interview_date:
            from django.utils.dateparse import parse_datetime
            interview_date = parse_datetime(interview_date)
        app.advance_to_interview(request.user, interview_date)
        return Response(self.get_serializer(app).data)

    @action(detail=True, methods=["post"], url_path="send-offer")
    def send_offer(self, request, pk=None):
        app = self.get_object()
        app.send_offer(request.user)
        return Response(self.get_serializer(app).data)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        app = self.get_object()
        app.accept(request.user)
        return Response(self.get_serializer(app).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        app = self.get_object()
        app.reject(request.user, request.data.get("reason", ""))
        return Response(self.get_serializer(app).data)

    @action(detail=False, methods=["get"], url_path="my-referrals")
    def my_referrals(self, request):
        try:
            emp = request.user.employee_profile
            apps = Application.objects.filter(referred_by=emp)
            return Response(self.get_serializer(apps, many=True).data)
        except Exception:
            return Response([], status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="add-comment")
    def add_comment(self, request, pk=None):
        app = self.get_object()
        serializer = RecruitmentCommentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(application=app, author=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ── S7: Social Events & Motivations ViewSets ─────────────────────────────────

from django.core.exceptions import ValidationError as DjangoValidationError
from .models import SocialEvent, SocialEventComment, EmployeeRecognition, EmployeeBirthday
from .serializers import (
    SocialEventSerializer, SocialEventCommentSerializer,
    EmployeeRecognitionSerializer, EmployeeBirthdaySerializer,
)


class SocialEventViewSet(viewsets.ModelViewSet):
    serializer_class = SocialEventSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["event_type", "status"]
    search_fields = ["title", "description", "location"]
    ordering_fields = ["event_date", "created_at"]

    def get_queryset(self):
        user = self.request.user
        profile = getattr(user, "profile", None)
        is_privileged = (
            getattr(profile, "is_super_admin", False)
            or getattr(profile, "role", None) in ("admin", "hr")
            or user.is_superuser
        )
        if is_privileged:
            return SocialEvent.objects.prefetch_related("participants").all()
        return SocialEvent.objects.filter(
            status__in=[SocialEvent.Status.PLANNED, SocialEvent.Status.ONGOING]
        ).prefetch_related("participants")

    def perform_create(self, serializer):
        serializer.save(organized_by=self.request.user)

    @action(detail=True, methods=["post"])
    def register(self, request, pk=None):
        event = self.get_object()
        try:
            emp = request.user.employee_profile
            event.register_participant(emp)
            return Response(self.get_serializer(event).data)
        except DjangoValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({"detail": "Aucun employé associé."}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def unregister(self, request, pk=None):
        event = self.get_object()
        try:
            emp = request.user.employee_profile
            event.unregister_participant(emp)
            return Response(self.get_serializer(event).data)
        except Exception:
            return Response({"detail": "Aucun employé associé."}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="add-comment")
    def add_comment(self, request, pk=None):
        event = self.get_object()
        serializer = SocialEventCommentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(event=event, author=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class EmployeeRecognitionViewSet(viewsets.ModelViewSet):
    serializer_class = EmployeeRecognitionSerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["employee", "recognition_type"]
    search_fields = ["title", "description"]
    ordering_fields = ["awarded_at"]

    def get_queryset(self):
        return EmployeeRecognition.objects.select_related("employee", "awarded_by").all()

    def perform_create(self, serializer):
        serializer.save(awarded_by=self.request.user)
        emp = serializer.instance.employee
        if emp.user:
            from apps.messaging.models import Notification
            Notification.objects.create(
                recipient=emp.user,
                title=f"Félicitations ! {serializer.instance.get_recognition_type_display()}",
                body=serializer.instance.description[:500],
            )


class EmployeeBirthdayViewSet(viewsets.ModelViewSet):
    serializer_class = EmployeeBirthdaySerializer
    permission_classes = [HrPermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields = ["birth_date"]

    def get_queryset(self):
        return EmployeeBirthday.objects.select_related("employee").all()

    @action(detail=False, methods=["get"])
    def upcoming(self, request):
        from datetime import timedelta
        today  = timezone.now().date()
        in_30  = today + timedelta(days=30)
        result = [b for b in self.get_queryset() if today <= b.next_birthday <= in_30]
        result.sort(key=lambda b: b.next_birthday)
        return Response(self.get_serializer(result, many=True).data)

    @action(detail=False, methods=["get"])
    def today(self, request):
        today = timezone.now().date()
        qs = self.get_queryset().filter(birth_date__month=today.month, birth_date__day=today.day)
        return Response(self.get_serializer(qs, many=True).data)