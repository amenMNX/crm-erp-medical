from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from apps.accounts.permissions import ReadOnlyOrRole
from apps.hr.models import Employee, Absence, LeaveRequest, SalaryAdvance
from .models import EmployeeSalary, PayrollBatch, Payroll, PayrollComponent
from .serializers import (
    EmployeeSalarySerializer,
    PayrollBatchSerializer,
    PayrollSerializer,
    PayrollComponentSerializer,
    GeneratePayrollSerializer,
)


class PayrollPermission(ReadOnlyOrRole):
    allowed_roles = ["admin", "hr", "accountant"]


class EmployeeSalaryViewSet(viewsets.ModelViewSet):
    """Manage employee base salary configuration."""
    queryset = EmployeeSalary.objects.select_related("employee", "created_by").all()
    serializer_class = EmployeeSalarySerializer
    permission_classes = [PayrollPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["employee", "is_active"]
    search_fields = ["employee__first_name", "employee__last_name", "employee__employee_number"]
    ordering_fields = ["base_salary", "effective_date"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class PayrollBatchViewSet(viewsets.ModelViewSet):
    """Manage payroll batches."""
    queryset = PayrollBatch.objects.prefetch_related("payrolls__employee").all()
    serializer_class = PayrollBatchSerializer
    permission_classes = [PayrollPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status"]
    search_fields = ["notes"]
    ordering_fields = ["-month", "status"]

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve a payroll batch."""
        batch = self.get_object()
        if batch.status != PayrollBatch.Status.GENERATED:
            return Response(
                {"detail": "Only generated payrolls can be approved."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        batch.status = PayrollBatch.Status.APPROVED
        batch.approved_by = request.user
        batch.approved_at = timezone.now()
        batch.save()
        
        # Update all payrolls in this batch
        batch.payrolls.update(status=Payroll.Status.APPROVED)
        
        return Response(self.get_serializer(batch).data)

    @action(detail=True, methods=["post"])
    def mark_paid(self, request, pk=None):
        """Mark a payroll batch as paid."""
        batch = self.get_object()
        if batch.status != PayrollBatch.Status.APPROVED:
            return Response(
                {"detail": "Only approved payrolls can be marked as paid."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        batch.status = PayrollBatch.Status.PAID
        batch.paid_at = timezone.now()
        batch.save()
        
        # Update all payrolls in this batch
        payment_date = request.data.get("payment_date", timezone.now().date())
        payment_method = request.data.get("payment_method", "bank_transfer")
        batch.payrolls.update(
            status=Payroll.Status.PAID,
            payment_date=payment_date,
            payment_method=payment_method
        )
        
        return Response(self.get_serializer(batch).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a payroll batch."""
        batch = self.get_object()
        if batch.status in [PayrollBatch.Status.PAID, PayrollBatch.Status.CANCELLED]:
            return Response(
                {"detail": "Paid or cancelled payrolls cannot be cancelled."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        batch.status = PayrollBatch.Status.CANCELLED
        batch.save()
        batch.payrolls.update(status=Payroll.Status.CANCELLED)
        
        return Response(self.get_serializer(batch).data)


class PayrollViewSet(viewsets.ModelViewSet):
    """Manage individual payroll records."""
    queryset = Payroll.objects.select_related("employee", "payroll_batch").all()
    serializer_class = PayrollSerializer
    permission_classes = [PayrollPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "employee", "payroll_batch"]
    search_fields = ["employee__first_name", "employee__last_name", "notes"]
    ordering_fields = ["-month", "net_salary"]


class PayrollComponentViewSet(viewsets.ModelViewSet):
    """Manage payroll components."""
    queryset = PayrollComponent.objects.select_related("payroll").all()
    serializer_class = PayrollComponentSerializer
    permission_classes = [PayrollPermission]


class GeneratePayrollViewSet(viewsets.GenericViewSet):
    """Generate payroll for a month."""
    permission_classes = [PayrollPermission]
    serializer_class = GeneratePayrollSerializer

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Generate payroll for all active employees for a given month."""
        serializer = GeneratePayrollSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        month = serializer.validated_data["month"]
        employee_ids = serializer.validated_data.get("employee_ids")
        
        # Check if payroll already exists for this month
        if PayrollBatch.objects.filter(month=month).exists():
            return Response(
                {"detail": f"Payroll for {month.strftime('%B %Y')} already exists."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get active employees
        if employee_ids:
            employees = Employee.objects.filter(id__in=employee_ids, is_active=True)
        else:
            employees = Employee.objects.filter(is_active=True)
        
        if not employees.exists():
            return Response(
                {"detail": "No active employees found."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        with transaction.atomic():
            # Create payroll batch
            batch = PayrollBatch.objects.create(
                month=month,
                status=PayrollBatch.Status.GENERATED,
                generated_by=request.user,
                generated_at=timezone.now(),
                employee_count=employees.count()
            )
            
            payrolls = []
            for employee in employees:
                payroll = self._generate_employee_payroll(batch, employee, month, request.user)
                payrolls.append(payroll)
            
            # Update batch totals
            batch.total_net_salary = sum(p.net_salary for p in payrolls)
            batch.total_earnings = sum(p.gross_salary for p in payrolls)
            batch.total_deductions = sum(p.total_deductions for p in payrolls)
            batch.save()
            
            return Response(
                {
                    "message": f"Payroll generated successfully for {employees.count()} employees.",
                    "batch_id": batch.id,
                    "total_net_salary": batch.total_net_salary,
                    "employee_count": batch.employee_count
                },
                status=status.HTTP_201_CREATED
            )

    def _generate_employee_payroll(self, batch, employee, month, user):
        """Generate payroll for a single employee."""
        # Get salary configuration
        try:
            salary_config = EmployeeSalary.objects.get(employee=employee, is_active=True)
        except EmployeeSalary.DoesNotExist:
            # Skip employees without salary config
            raise ValueError(f"Employee {employee} has no active salary configuration.")
        
        # Calculate absence deductions
        absence_deduction = self._calculate_absence_deduction(employee, month, salary_config.base_salary)
        
        # Calculate salary advance deductions
        advance_deduction = self._calculate_advance_deduction(employee, month)
        
        # Calculate tax (simplified - 10% of gross for demo)
        gross = (
            salary_config.base_salary +
            salary_config.transport_allowance +
            salary_config.meal_allowance +
            (salary_config.base_salary * salary_config.bonus_percentage / 100)
        )
        tax_deduction = gross * 0.10  # Simple 10% tax
        
        # Social security (simplified - 5% of gross)
        social_security = gross * 0.05
        
        # Create payroll record
        payroll = Payroll.objects.create(
            payroll_batch=batch,
            employee=employee,
            month=month,
            base_salary=salary_config.base_salary,
            transport_allowance=salary_config.transport_allowance,
            meal_allowance=salary_config.meal_allowance,
            bonus=(salary_config.base_salary * salary_config.bonus_percentage / 100),
            absence_deduction=absence_deduction,
            advance_deduction=advance_deduction,
            tax_deduction=tax_deduction,
            social_security=social_security,
            gross_salary=gross,
            total_deductions=absence_deduction + advance_deduction + tax_deduction + social_security,
            status=Payroll.Status.GENERATED,
            generated_by=user,
        )
        
        # Create payroll components for detailed breakdown
        self._create_payroll_components(payroll, salary_config, absence_deduction, advance_deduction, tax_deduction, social_security)
        
        return payroll

    def _calculate_absence_deduction(self, employee, month, base_salary):
        """Calculate salary deduction for absences in the month."""
        # Get absences for this employee in the given month
        absences = Absence.objects.filter(
            employee=employee,
            date__year=month.year,
            date__month=month.month
        )
        
        # Daily rate (assuming 22 working days per month)
        daily_rate = base_salary / 22
        total_deduction = absences.count() * daily_rate
        
        return total_deduction

    def _calculate_advance_deduction(self, employee, month):
        """Calculate salary advance deductions for the month."""
        # Get approved salary advances that haven't been fully repaid
        advances = SalaryAdvance.objects.filter(
            employee=employee,
            statut=SalaryAdvance.Status.APPROUVEE
        )
        
        # If there's a repayment date in the future, deduct the amount
        total_deduction = 0
        for advance in advances:
            # Simple logic: deduct the advance amount from the next payroll
            # In a real system, you'd have a repayment schedule
            total_deduction += advance.amount
        
        return total_deduction

    def _create_payroll_components(self, payroll, salary_config, absence_deduction, advance_deduction, tax_deduction, social_security):
        """Create detailed payroll components."""
        components = [
            # Earnings
            ("Base Salary", "earning", salary_config.base_salary, "base"),
            ("Transport Allowance", "earning", salary_config.transport_allowance, "transport"),
            ("Meal Allowance", "earning", salary_config.meal_allowance, "meal"),
            ("Performance Bonus", "earning", salary_config.base_salary * salary_config.bonus_percentage / 100, "bonus"),
            
            # Deductions
            ("Absence Deduction", "deduction", absence_deduction, "absence"),
            ("Salary Advance Deduction", "deduction", advance_deduction, "advance"),
            ("Tax Deduction", "deduction", tax_deduction, "tax"),
            ("Social Security", "deduction", social_security, "social_security"),
        ]
        
        for name, comp_type, amount, source in components:
            if amount > 0:
                PayrollComponent.objects.create(
                    payroll=payroll,
                    name=name,
                    type=comp_type,
                    amount=amount,
                    source=source
                )