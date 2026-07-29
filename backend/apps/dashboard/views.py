from decimal import Decimal

from django.db.models import Sum
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from apps.accounting.models import Invoice, Payment
from apps.crm.models import Appointment, Patient, Ticket, TreatmentPlan, TreatmentSession
from apps.hr.models import Employee, LeaveRequest


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        paid_total = Payment.objects.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        invoiced_total = Invoice.objects.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")

        resolved_statuses = ["Résolu", "Fermé"]

        data = {
            "patients_count": Patient.objects.count(),
            "appointments_count": Appointment.objects.count(),
            "treatment_plans_count": TreatmentPlan.objects.count(),
            "treatment_sessions_count": TreatmentSession.objects.count(),
            "scheduled_sessions_count": TreatmentSession.objects.filter(status="scheduled").count(),
            "completed_sessions_count": TreatmentSession.objects.filter(status="completed").count(),
            "active_treatment_plans_count": TreatmentPlan.objects.filter(status="active").count(),
            "invoices_count": Invoice.objects.count(),
            "payments_count": Payment.objects.count(),
            "paid_invoices_count": Invoice.objects.filter(status="paid").count(),
            "unpaid_invoices_count": Invoice.objects.exclude(status__in=["paid", "cancelled"]).count(),
            "invoiced_total": str(invoiced_total),
            "paid_total": str(paid_total),
            "unpaid_total": str(max(invoiced_total - paid_total, Decimal("0.00"))),
            "tickets_count": Ticket.objects.count(),
            "open_tickets_count": Ticket.objects.exclude(statut__in=resolved_statuses).count(),
            "resolved_tickets_count": Ticket.objects.filter(statut__in=resolved_statuses).count(),
            "employees_count": Employee.objects.count(),
            "leave_requests_count": LeaveRequest.objects.count(),
            "pending_leave_requests_count": LeaveRequest.objects.filter(statut="En attente").count(),
        }

        return Response(data)