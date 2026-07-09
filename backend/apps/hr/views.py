from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from apps.accounts.permissions import ReadOnlyOrRole
from .models import Employee
from .serializers import EmployeeSerializer

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