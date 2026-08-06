# /tmp/project/backend/apps/dashboard/views.py
from datetime import timedelta
from decimal import Decimal

from django.db.models import Sum, Q, Count
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from apps.accounting.models import Invoice, Payment, CNAMClaim
from apps.crm.models import Appointment, Patient, Ticket, TreatmentPlan, TreatmentSession
from apps.hr.models import Employee, LeaveRequest, Absence, Shift


OVERDUE_DAYS = 60
RESOLVED_STATUSES = ["Résolu", "Fermé"]


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        role = getattr(user, 'role', None)
        if not role and hasattr(user, 'profile'):
            role = user.profile.role
        
        # Common stats (toujours utiles)
        common_stats = {
            "patients_count": Patient.objects.count(),
            "employees_count": Employee.objects.count(),
            "active_employees": Employee.objects.filter(is_active=True).count(),
            "user_role": role,
        }
        
        # Stats spécifiques au rôle
        role_stats = {}
        
        if role in ["admin", "accountant", "finance"]:
            role_stats.update(self._get_finance_stats())
        
        if role in ["admin", "doctor", "radiotherapist", "medical"]:
            role_stats.update(self._get_medical_stats())
        
        if role in ["admin", "support", "agent"]:
            role_stats.update(self._get_support_stats())
        
        if role in ["admin", "hr"]:
            role_stats.update(self._get_hr_stats())
        
        # Si rôle non reconnu ou visiteur, on donne un minimum
        if not role_stats:
            role_stats = {
                "patients_count": Patient.objects.count(),
                "tickets_count": Ticket.objects.count(),
                "invoices_count": Invoice.objects.count(),
            }
        
        return Response({
            **common_stats,
            **role_stats,
        })
    
    def _get_finance_stats(self):
        """Métriques financières pour admin, comptable, finance."""
        paid_total = Payment.objects.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        invoiced_total = Invoice.objects.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        
        overdue_cutoff = timezone.now().date() - timedelta(days=OVERDUE_DAYS)
        overdue_qs = Invoice.objects.filter(
            status="issued",
            due_date__lt=overdue_cutoff,
        )
        overdue_total = overdue_qs.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        overdue_count = overdue_qs.count()
        
        # Dossiers CNAM en attente
        cnam_pending = CNAMClaim.objects.filter(statut="En attente").count()
        cnam_approved = CNAMClaim.objects.filter(statut="Approuvée").count()
        cnam_reimbursed = CNAMClaim.objects.filter(statut="Remboursée").count()
        
        return {
            "invoiced_total": str(invoiced_total),
            "paid_total": str(paid_total),
            "unpaid_total": str(max(invoiced_total - paid_total, Decimal("0.00"))),
            "overdue_invoices_count": overdue_count,
            "overdue_invoices_total": str(overdue_total),
            "overdue_threshold_days": OVERDUE_DAYS,
            "invoices_count": Invoice.objects.count(),
            "payments_count": Payment.objects.count(),
            "paid_invoices_count": Invoice.objects.filter(status="paid").count(),
            "unpaid_invoices_count": Invoice.objects.exclude(status__in=["paid", "cancelled"]).count(),
            "cnam_pending_count": cnam_pending,
            "cnam_approved_count": cnam_approved,
            "cnam_reimbursed_count": cnam_reimbursed,
        }
    
    def _get_medical_stats(self):
        """Métriques cliniques pour admin, médecin, radiothérapeute."""
        today = timezone.now().date()
        
        return {
            "appointments_count": Appointment.objects.count(),
            "treatment_plans_count": TreatmentPlan.objects.count(),
            "treatment_sessions_count": TreatmentSession.objects.count(),
            "scheduled_sessions_count": TreatmentSession.objects.filter(status="scheduled").count(),
            "completed_sessions_count": TreatmentSession.objects.filter(status="completed").count(),
            "active_treatment_plans_count": TreatmentPlan.objects.filter(status="active").count(),
            "missed_sessions_today": TreatmentSession.objects.filter(
                status="missed",
                scheduled_datetime__date=today
            ).count(),
            "sessions_today": TreatmentSession.objects.filter(
                scheduled_datetime__date=today
            ).exclude(status="missed").count(),
            "patients_with_active_plan": TreatmentPlan.objects.filter(
                status="active"
            ).values("patient").distinct().count(),
        }
    
    def _get_support_stats(self):
        """Métriques support pour admin, agent support."""
        tickets_by_status = dict(
            Ticket.objects
            .values("statut")
            .annotate(count=Count("id"))
            .values_list("statut", "count")
        )
        
        return {
            "tickets_count": Ticket.objects.count(),
            "open_tickets_count": Ticket.objects.exclude(statut__in=RESOLVED_STATUSES).count(),
            "resolved_tickets_count": Ticket.objects.filter(statut__in=RESOLVED_STATUSES).count(),
            "critical_tickets": Ticket.objects.filter(
                priorite="Critique"
            ).exclude(statut__in=RESOLVED_STATUSES).count(),
            "tickets_by_status": tickets_by_status,
            "tickets_resolved_this_month": Ticket.objects.filter(
                statut__in=RESOLVED_STATUSES,
                updated_at__month=timezone.now().month
            ).count(),
        }
    
    def _get_hr_stats(self):
        """Métriques RH pour admin, RH."""
        today = timezone.now().date()
        
        return {
            "leave_requests_count": LeaveRequest.objects.count(),
            "pending_leave_requests_count": LeaveRequest.objects.filter(statut="En attente").count(),
            "approved_leaves_this_month": LeaveRequest.objects.filter(
                statut="Acceptée",
                date_debut__month=timezone.now().month
            ).count(),
            "absences_today": Absence.objects.filter(date=today).count(),
            "shifts_today": Shift.objects.filter(
                start_datetime__date=today
            ).count(),
            "uncovered_shifts_today": Shift.objects.filter(
                start_datetime__date=today,
                status="cancelled"
            ).count(),
            "active_employees": Employee.objects.filter(is_active=True).count(),
            "employees_on_leave_today": LeaveRequest.objects.filter(
                statut="Acceptée",
                date_debut__lte=today,
                date_fin__gte=today
            ).values("employee").distinct().count(),
        }