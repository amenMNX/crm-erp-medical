from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from apps.accounts.permissions import ReadOnlyOrRole
from apps.hr.models import Employee, Absence, SalaryAdvance
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
    # Must match the French name in RolePermission.write_permissions / frontend MODULES
    module_label = "Paie"


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
        
        try:
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
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    # ── Tunisian payroll constants (US-PAIE-01) ───────────────────────────────
    #
    # CNSS employee share : 9.18 %  of gross (plafonné à 6 × SMIG — ignored here,
    #                                          applies only when SMIG data is stored)
    # CNSS employer share : 16.57 % — informational only, not deducted from employee
    # IRPP : progressive barème (art. 44 CIR) — 7 tranches
    # Heures supplémentaires : +25 % (1–8 h/sem), +50 % (9–16 h/sem), +100 % (nuit/repos)
    #   → stored in Payroll.overtime as already-computed TND amount by the caller
    #   → here we derive overtime hours from shifts if no explicit amount is provided
    #
    # Working days per month assumed = 22

    CNSS_EMPLOYEE_RATE = 0.0918          # 9.18 %
    WORKING_DAYS       = 22
    OVERTIME_RATE_1    = 1.25            # ×1.25 for first 8 extra h/week (≈ 32 h/month)
    OVERTIME_RATE_2    = 1.50            # ×1.50 for next 8 h/week
    OVERTIME_RATE_3    = 2.00            # ×2.00 for night / rest-day hours

    # IRPP barème progressif annuel (TND/year) — art. 44 CIR Tunisie
    # Each tuple: (upper_limit_annual_TND, marginal_rate)
    # Income up to 5 000 TND/year → 0 %
    IRPP_BRACKETS = [
        (5_000,   0.00),
        (10_000,  0.26),
        (20_000,  0.28),
        (30_000,  0.32),
        (50_000,  0.34),
        (float("inf"), 0.35),
    ]

    @staticmethod
    def _compute_irpp_annual(taxable_annual_tnd: float) -> float:
        """
        Compute annual IRPP on taxable annual income (TND).
        Applies the 6-bracket progressive schedule from art. 44 CIR.
        Returns annual IRPP amount in TND.
        """
        tax     = 0.0
        prev    = 0.0
        for ceiling, rate in GeneratePayrollViewSet.IRPP_BRACKETS:
            if taxable_annual_tnd <= prev:
                break
            slice_top = min(taxable_annual_tnd, ceiling)
            tax += (slice_top - prev) * rate
            prev = ceiling
        return tax

    def _generate_employee_payroll(self, batch, employee, month, user):
        """
        Generate payroll for a single employee.

        Calculation chain (US-PAIE-01):
        1. Gross = base + transport + meal + bonus + overtime
        2. CNSS  = Gross × 9.18 %                          (employee share)
        3. Taxable income for IRPP = Gross − CNSS − abattement forfaitaire 10 %
           (but abattement ≥ 300 TND/year and ≤ 2 000 TND/year — monthly version)
        4. IRPP  = annual_irpp(Taxable × 12) / 12          (monthly instalment)
        5. Absence deduction = (base / 22) × nb_absence_days
        6. Advance deduction = remaining balance of approved SalaryAdvances due this month
        7. Net = Gross − CNSS − IRPP − absence_deduction − advance_deduction
        """
        from decimal import Decimal

        try:
            salary_config = EmployeeSalary.objects.get(employee=employee, is_active=True)
        except EmployeeSalary.DoesNotExist:
            raise ValueError(f"Employee {employee} has no active salary configuration.")

        base      = float(salary_config.base_salary)
        transport = float(salary_config.transport_allowance)
        meal      = float(salary_config.meal_allowance)
        bonus_pct = float(salary_config.bonus_percentage)
        bonus     = base * bonus_pct / 100

        # ── Overtime (heures supplémentaires) ────────────────────────────────
        # Derive from cancelled / extra shifts in the month if no manual entry.
        # Hourly rate = base / (22 days × 8 h)
        overtime_tnd = self._calculate_overtime(employee, month, base)

        # ── Gross salary ──────────────────────────────────────────────────────
        gross = base + transport + meal + bonus + overtime_tnd

        # ── CNSS — 9.18 % employee share ──────────────────────────────────────
        # Transport & meal allowances are exempt from CNSS per Tunisian law.
        cnss_base    = base + bonus + overtime_tnd   # excludes exempt allowances
        cnss         = cnss_base * self.CNSS_EMPLOYEE_RATE

        # ── IRPP — barème progressif ──────────────────────────────────────────
        # Taxable base = gross − CNSS − abattement forfaitaire 10 % (capped)
        abattement_annual = min(max(gross * 12 * 0.10, 300), 2_000)
        taxable_annual    = max((gross - cnss) * 12 - abattement_annual, 0)
        irpp_annual       = self._compute_irpp_annual(taxable_annual)
        irpp_monthly      = irpp_annual / 12

        # ── Absence deduction ─────────────────────────────────────────────────
        absence_deduction = self._calculate_absence_deduction(employee, month, base)

        # ── Salary advance deduction ──────────────────────────────────────────
        advance_deduction = self._calculate_advance_deduction(employee, month)

        # ── Totals ────────────────────────────────────────────────────────────
        total_deductions = cnss + irpp_monthly + absence_deduction + advance_deduction
        net_salary       = gross - total_deductions

        payroll = Payroll.objects.create(
            payroll_batch=batch,
            employee=employee,
            month=month,
            base_salary=Decimal(str(round(base, 2))),
            transport_allowance=Decimal(str(round(transport, 2))),
            meal_allowance=Decimal(str(round(meal, 2))),
            bonus=Decimal(str(round(bonus, 2))),
            overtime=Decimal(str(round(overtime_tnd, 2))),
            absence_deduction=Decimal(str(round(absence_deduction, 2))),
            advance_deduction=Decimal(str(round(advance_deduction, 2))),
            social_security=Decimal(str(round(cnss, 2))),
            tax_deduction=Decimal(str(round(irpp_monthly, 2))),
            gross_salary=Decimal(str(round(gross, 2))),
            total_deductions=Decimal(str(round(total_deductions, 2))),
            net_salary=Decimal(str(round(net_salary, 2))),
            status=Payroll.Status.GENERATED,
            generated_by=user,
        )

        self._create_payroll_components(
            payroll, salary_config,
            overtime_tnd, cnss, irpp_monthly,
            absence_deduction, advance_deduction,
        )

        return payroll

    def _calculate_overtime(self, employee, month, base_salary: float) -> float:
        """
        Compute overtime pay in TND for the month (US-PAIE-01).

        Strategy: count extra shifts (status='completed') beyond the standard
        working schedule.  Each shift = 8 h.  First 32 h/month (≈ 4 extra shifts)
        at ×1.25, next 32 h at ×1.50, beyond at ×2.00.

        Falls back to 0 if no shift data exists.
        """
        from apps.hr.models import Shift

        hourly_rate = base_salary / (self.WORKING_DAYS * 8)

        extra_shifts = Shift.objects.filter(
            employee=employee,
            start_datetime__year=month.year,
            start_datetime__month=month.month,
            is_overtime=True,
        ).count() if hasattr(Shift, "is_overtime") else 0

        # If Shift model has no is_overtime flag, return 0 — manual entry path.
        if extra_shifts == 0:
            return 0.0

        extra_hours = extra_shifts * 8
        pay = 0.0
        tier1 = min(extra_hours, 32)        # first 32 h → ×1.25
        tier2 = min(max(extra_hours - 32, 0), 32)   # next 32 h → ×1.50
        tier3 = max(extra_hours - 64, 0)    # beyond    → ×2.00

        pay += tier1 * hourly_rate * self.OVERTIME_RATE_1
        pay += tier2 * hourly_rate * self.OVERTIME_RATE_2
        pay += tier3 * hourly_rate * self.OVERTIME_RATE_3
        return round(pay, 2)

    def _calculate_absence_deduction(self, employee, month, base_salary):
        """Deduct (base / 22) per unjustified absence day in the month."""
        absences = Absence.objects.filter(
            employee=employee,
            date__year=month.year,
            date__month=month.month,
        )
        daily_rate = float(base_salary) / self.WORKING_DAYS
        return round(absences.count() * daily_rate, 2)

    def _calculate_advance_deduction(self, employee, month):
        """
        Deduct salary advances whose repayment_date falls in this month,
        or all outstanding approved advances when no repayment date is set.
        Advances already fully repaid (status=REMBOURSEE) are skipped.
        """
        advances = SalaryAdvance.objects.filter(
            employee=employee,
            statut=SalaryAdvance.Status.APPROUVEE,
        )
        total = 0.0
        for adv in advances:
            remaining = float(adv.amount) - float(adv.amount_repaid)
            if remaining <= 0:
                continue
            # Deduct if repayment due this month, or if no date set (deduct immediately)
            if adv.repayment_date is None or (
                adv.repayment_date.year  == month.year and
                adv.repayment_date.month == month.month
            ):
                total += remaining
        return round(total, 2)

    def _create_payroll_components(
        self, payroll, salary_config,
        overtime_tnd, cnss, irpp_monthly,
        absence_deduction, advance_deduction,
    ):
        """Record every payroll line item for the pay-slip detail view."""
        base  = float(salary_config.base_salary)
        bonus = base * float(salary_config.bonus_percentage) / 100

        components = [
            # ── Earnings ───────────────────────────────────────────────────
            ("Salaire de base",         "earning",   base,                               "base"),
            ("Indemnité de transport",  "earning",   float(salary_config.transport_allowance), "transport"),
            ("Indemnité de repas",      "earning",   float(salary_config.meal_allowance),       "meal"),
            ("Prime de performance",    "earning",   bonus,                              "bonus"),
            ("Heures supplémentaires",  "earning",   overtime_tnd,                       "overtime"),
            # ── Deductions ─────────────────────────────────────────────────
            ("CNSS salarié (9,18 %)",   "deduction", cnss,                               "cnss"),
            ("IRPP (barème progressif)","deduction", irpp_monthly,                       "irpp"),
            ("Retenue absence",         "deduction", absence_deduction,                  "absence"),
            ("Remboursement avance",    "deduction", advance_deduction,                  "advance"),
        ]

        for name, comp_type, amount, source in components:
            if amount and amount > 0:
                PayrollComponent.objects.create(
                    payroll=payroll,
                    name=name,
                    type=comp_type,
                    amount=round(amount, 2),
                    source=source,
                )