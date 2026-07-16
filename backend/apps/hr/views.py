from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import ReadOnlyOrRole
from .models import Absence, Employee, LeaveRequest
from .serializers import AbsenceSerializer, EmployeeSerializer, LeaveRequestSerializer

class HrPermission(ReadOnlyOrRole):
    allowed_roles = ["admin", "hr"]

class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.select_related("user").all()
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