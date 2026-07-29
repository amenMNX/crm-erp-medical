from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets , status
from rest_framework.decorators import action
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


class SalaryAdvanceViewSet(viewsets.ModelViewSet):
    queryset = SalaryAdvance.objects.select_related("employee", "approved_by").all()
    serializer_class = SalaryAdvanceSerializer
    permission_classes = [HrPermission]
    required_roles = ["hr", "admin"]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["statut", "employee"]
    search_fields = ["employee__first_name", "employee__last_name" ,"reason", "notes"]
    ordering_fields = ["request_date", "amount", "status" , "created_at"]

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