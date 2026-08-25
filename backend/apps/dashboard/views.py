from datetime import timedelta
from decimal import Decimal

from django.db.models import Sum, Count
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from apps.accounting.models import Invoice, Payment, CNAMClaim, OutgoingPayment, DunningAction
from apps.crm.models import Appointment, Patient, Ticket, TreatmentPlan, TreatmentSession, Incident, Complaint, DoseDeviation
from apps.hr.models import Employee, LeaveRequest, Absence, Shift
from apps.payroll.models import EmployeeSalary

from apps.accounts.permissions import AdminOnlyPermission
OVERDUE_DAYS = 60
RESOLVED_STATUSES = ["Résolu", "Fermé"]


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    # Mapping département → dimension(s) de stats.
    # Un rôle « racine » (ex: doctor) définit le département par défaut ;
    # n'importe quel job_title avec department="medical" bénéficiera des
    # mêmes stats qu'un médecin, quelle que soit sa fiche de rôle.
    DEPARTMENT_STATS = {
        "medical":  "_get_medical_stats",
        "finance":  "_get_finance_stats",
        "support":  "_get_support_stats",
        "hr":       "_get_hr_stats",
    }

    # Rôles racine → département de référence (fallback si department vide)
    ROLE_TO_DEPARTMENT = {
        "doctor":         "medical",
        "radiotherapist": "medical",
        "receptionist":   "medical",
        "accountant":     "finance",
        "support_client": "support",
        "secretary":      "support",
        "hr":             "hr",
    }

    def _resolve_departments(self, user):
        """
        Retourne l'ensemble des départements actifs pour cet utilisateur.

        Priorité :
        1. profile.department  (renseigné depuis Employee.department via signal)
           → peut contenir un département libre comme "medical" ou "infirmerie"
           → on le normalise vers une clé connue de DEPARTMENT_STATS
        2. ROLE_TO_DEPARTMENT[profile.role]  (fallback rôle → département)
        3. admin / manager  → tous les départements
        """
        profile = getattr(user, "profile", None)
        role = profile.role if profile else None
        _dept_obj = getattr(profile, "department", None) if profile else None
        raw_department = (_dept_obj.name.strip().lower() if _dept_obj else "")

        # Admin et manager voient tout
        if role in ("admin", "manager"):
            return set(self.DEPARTMENT_STATS.keys())

        departments = set()

        # 1. Résolution via le champ department (sous-spécialité ou département libre)
        if raw_department:
            # Correspondance exacte d'abord
            if raw_department in self.DEPARTMENT_STATS:
                departments.add(raw_department)
            else:
                # Correspondance partielle : "service médical" → "medical"
                for key in self.DEPARTMENT_STATS:
                    if key in raw_department:
                        departments.add(key)

        # 2. Fallback : rôle → département si rien trouvé via department
        if not departments and role in self.ROLE_TO_DEPARTMENT:
            departments.add(self.ROLE_TO_DEPARTMENT[role])

        return departments

    def get(self, request):
        user = request.user
        profile = getattr(user, "profile", None)
        role = profile.role if profile else None
        _dept_obj2 = getattr(profile, "department", None) if profile else None
        department = (_dept_obj2.name.strip() if _dept_obj2 else "")

        # Common stats (toujours utiles)
        common_stats = {
            "patients_count": Patient.objects.count(),
            "employees_count": Employee.objects.count(),
            "active_employees": Employee.objects.filter(is_active=True).count(),
            "user_role": role,
            "user_department": department,
        }

        # Stats spécifiques au département résolu
        role_stats = {}
        active_departments = self._resolve_departments(user)

        for dept in active_departments:
            method_name = self.DEPARTMENT_STATS.get(dept)
            if method_name:
                role_stats.update(getattr(self, method_name)())

        # Si aucun département résolu → minimum universel
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
        cnam_pending = CNAMClaim.objects.filter(status="En attente").count()
        cnam_approved = CNAMClaim.objects.filter(status="Approuvée").count()
        cnam_reimbursed = CNAMClaim.objects.filter(status="Remboursée").count()

        # Flux sortants (dépenses)
        outgoing_total = OutgoingPayment.objects.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        outgoing_this_month = OutgoingPayment.objects.filter(
            payment_date__month=timezone.now().month,
            payment_date__year=timezone.now().year,
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        
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
            "outgoing_total": str(outgoing_total),
            "outgoing_this_month": str(outgoing_this_month),
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
            "pending_leave_requests_count": LeaveRequest.objects.filter(status="En attente").count(),
            "approved_leaves_this_month": LeaveRequest.objects.filter(
                status=LeaveRequest.Status.ACCEPTEE,
                start_date__month=timezone.now().month
            ).count(),
            "absences_today": Absence.objects.filter(date=today).count(),
            "shifts_today": Shift.objects.filter(
                date=today
            ).count(),
            "uncovered_shifts_today": Shift.objects.filter(
                date=today
            ).count(),
            "active_employees": Employee.objects.filter(is_active=True).count(),
            "employees_on_leave_today": LeaveRequest.objects.filter(
                status=LeaveRequest.Status.ACCEPTEE,
                start_date__lte=today,
                end_date__gte=today
            ).values("employee").distinct().count(),
        }


# ─────────────────────────────────────────────────────────────────────────────
# US-KPI — Tableau de bord KPI (10 KPI par dimension, seuils rouge/orange/vert)
# GET /api/dashboard/kpi/
# ─────────────────────────────────────────────────────────────────────────────

def _pct(num, denom):
    """Safe integer percentage, returns float 0-100."""
    return round((num / denom) * 100, 1) if denom else 0.0


def _threshold(value, green, orange):
    """
    Return 'green' / 'orange' / 'red' given two thresholds.
    Assumes higher = better when green > orange (e.g. taux_occupation).
    Assumes lower  = better when green < orange (e.g. taux_absence).
    """
    if green >= orange:          # higher is better
        if value >= green:
            return "green"
        if value >= orange:
            return "orange"
        return "red"
    else:                        # lower is better
        if value <= green:
            return "green"
        if value <= orange:
            return "orange"
        return "red"


def _kpi(label, value, unit, green, orange, description="", fmt=None):
    status = _threshold(value, green, orange) if (green is not None and orange is not None) else "green"
    return {
        "label": label,
        "value": value,
        "unit": unit,
        "status": status,
        "target_green": green,
        "target_orange": orange,
        "description": description,
        "fmt": fmt or ("%" if unit == "%" else "number"),
    }


class KpiDashboardView(APIView):
    """
    Tableau de bord KPI — 5 dimensions × ~10 KPI chacune.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.now().date()
        now = timezone.now()

        # ── 1. DIMENSION CLINIQUE ─────────────────────────────────────────────
        total_sessions = TreatmentSession.objects.count()
        completed_sessions = TreatmentSession.objects.filter(status="completed").count()
        missed_sessions = TreatmentSession.objects.filter(status="missed").count()
        active_plans = TreatmentPlan.objects.filter(status="active").count()
        total_plans = TreatmentPlan.objects.count()
        sessions_today = TreatmentSession.objects.filter(scheduled_datetime__date=today).count()
        sessions_this_month = TreatmentSession.objects.filter(
            scheduled_datetime__month=today.month,
            scheduled_datetime__year=today.year
        ).count()
        completed_this_month = TreatmentSession.objects.filter(
            scheduled_datetime__month=today.month,
            scheduled_datetime__year=today.year,
            status="completed",
        ).count()

        total_apts = Appointment.objects.count()
        done_apts = Appointment.objects.filter(status="done").count()
        cancelled_apts = Appointment.objects.filter(status="cancelled").count()
        scheduled_apts = Appointment.objects.filter(status__in=["scheduled", "confirmed"]).count()

        taux_completion_sessions = _pct(completed_sessions, total_sessions)
        taux_missed = _pct(missed_sessions, total_sessions)
        taux_completion_rdv = _pct(done_apts, total_apts)
        taux_annulation_rdv = _pct(cancelled_apts, total_apts)
        taux_plans_actifs = _pct(active_plans, total_plans) if total_plans else 0.0
        taux_sessions_mensuel = _pct(completed_this_month, sessions_this_month)

        clinical_kpis = [
            _kpi("Taux de complétion des séances", taux_completion_sessions, "%", 90, 75,
                 "Séances terminées / séances totales"),
            _kpi("Taux de séances manquées", taux_missed, "%", 5, 10,
                 "Séances manquées / séances totales"),
            _kpi("Taux de complétion des RDV", taux_completion_rdv, "%", 85, 70,
                 "RDV effectués / RDV totaux"),
            _kpi("Taux d'annulation des RDV", taux_annulation_rdv, "%", 8, 15,
                 "RDV annulés / RDV totaux"),
            _kpi("Plans de traitement actifs", active_plans, "", None, None,
                 "Nombre de plans en cours", fmt="count"),
            _kpi("Séances aujourd'hui", sessions_today, "", None, None,
                 "Séances planifiées ce jour", fmt="count"),
            _kpi("Séances ce mois (complétées/%)", taux_sessions_mensuel, "%", 85, 70,
                 "Séances complétées ce mois / planifiées"),
            _kpi("Taux de plans actifs", taux_plans_actifs, "%", 60, 40,
                 "Plans actifs / total plans"),
            _kpi("RDV en attente", scheduled_apts, "", None, None,
                 "RDV planifiés ou confirmés", fmt="count"),
            _kpi("Total patients", Patient.objects.count(), "", None, None,
                 "Patients enregistrés", fmt="count"),
        ]

        # ── 2. DIMENSION FINANCIÈRE ───────────────────────────────────────────
        invoiced = Invoice.objects.aggregate(t=Sum("total_amount"))["t"] or Decimal("0")
        paid = Payment.objects.aggregate(t=Sum("amount"))["t"] or Decimal("0")
        unpaid = max(invoiced - paid, Decimal("0"))

        overdue_cutoff = today - timedelta(days=30)
        overdue_30 = Invoice.objects.filter(status="issued", due_date__lt=overdue_cutoff).count()
        overdue_30_total = Invoice.objects.filter(
            status="issued", due_date__lt=overdue_cutoff
        ).aggregate(t=Sum("total_amount"))["t"] or Decimal("0")

        total_invoices = Invoice.objects.count()
        paid_invoices = Invoice.objects.filter(status="paid").count()
        taux_recouvrement = _pct(float(paid), float(invoiced))
        taux_paid_invoices = _pct(paid_invoices, total_invoices)

        cnam_pending = CNAMClaim.objects.filter(status="En attente").count()
        cnam_approved = CNAMClaim.objects.filter(status="Approuvée").count()
        cnam_total = CNAMClaim.objects.count()
        taux_cnam = _pct(cnam_approved, cnam_total)

        finance_kpis = [
            _kpi("Taux de recouvrement", taux_recouvrement, "%", 85, 70,
                 "Montant encaissé / montant facturé", fmt="%"),
            _kpi("Taux de factures payées", taux_paid_invoices, "%", 80, 60,
                 "Factures payées / factures totales"),
            _kpi("Factures impayées >30j", overdue_30, "", None, None,
                 "Factures en retard depuis plus de 30 jours", fmt="count"),
            _kpi("Montant en souffrance >30j", float(overdue_30_total), "TND", 0, 500,
                 "Montant total en retard >30j", fmt="currency"),
            _kpi("Total facturé (TND)", float(invoiced), "TND", None, None,
                 "Cumul des factures émises", fmt="currency"),
            _kpi("Total encaissé (TND)", float(paid), "TND", None, None,
                 "Cumul des paiements reçus", fmt="currency"),
            _kpi("Reste à encaisser (TND)", float(unpaid), "TND", 0, 1000,
                 "Montant non encore encaissé", fmt="currency"),
            _kpi("Taux approbation CNAM", taux_cnam, "%", 70, 50,
                 "Dossiers CNAM approuvés / soumis"),
            _kpi("Dossiers CNAM en attente", cnam_pending, "", None, None,
                 "Dossiers CNAM pas encore traités", fmt="count"),
            _kpi("Total factures", total_invoices, "", None, None,
                 "Nombre total de factures", fmt="count"),
        ]

        # ── 3. DIMENSION RH ───────────────────────────────────────────────────
        total_emp = Employee.objects.count()
        active_emp = Employee.objects.filter(is_active=True).count()
        pending_lvs = LeaveRequest.objects.filter(status="En attente").count()
        abs_today = Absence.objects.filter(date=today).count()
        taux_absence = _pct(abs_today, active_emp)

        on_leave_today = LeaveRequest.objects.filter(
            status=LeaveRequest.Status.ACCEPTEE,
            start_date__lte=today,
            end_date__gte=today,
        ).values("employee").distinct().count()

        shifts_today = Shift.objects.filter(date=today).count()
        cancelled_shifts = 0
        taux_couverture = _pct(shifts_today - cancelled_shifts, shifts_today)

        lvs_this_month = LeaveRequest.objects.filter(
            status=LeaveRequest.Status.ACCEPTEE,
            start_date__month=today.month,
            start_date__year=today.year,
        ).count()

        hr_kpis = [
            _kpi("Taux d'absence du jour", taux_absence, "%", 5, 10,
                 "Absences aujourd'hui / effectif actif"),
            _kpi("Taux de couverture des shifts", taux_couverture, "%", 90, 75,
                 "Shifts couverts / shifts planifiés"),
            _kpi("Congés en attente de validation", pending_lvs, "", None, None,
                 "Demandes de congé non traitées", fmt="count"),
            _kpi("Employés en congé aujourd'hui", on_leave_today, "", None, None,
                 "Employés avec congé approuvé actif", fmt="count"),
            _kpi("Congés approuvés ce mois", lvs_this_month, "", None, None,
                 "Congés acceptés sur le mois courant", fmt="count"),
            _kpi("Absences aujourd'hui", abs_today, "", None, None,
                 "Nombre d'absences enregistrées ce jour", fmt="count"),
            _kpi("Shifts aujourd'hui", shifts_today, "", None, None,
                 "Total shifts planifiés ce jour", fmt="count"),
            _kpi("Shifts annulés aujourd'hui", cancelled_shifts, "", 0, 2,
                 "Shifts annulés sans remplacement"),
            _kpi("Effectif actif", active_emp, "", None, None,
                 "Employés actifs dans le système", fmt="count"),
            _kpi("Taux d'activation RH", _pct(active_emp, total_emp), "%", 90, 75,
                 "Employés actifs / total employés"),
        ]

        # ── 4. DIMENSION QUALITÉ & INCIDENTS ─────────────────────────────────
        total_incidents = Incident.objects.count()
        resolved_inc = Incident.objects.filter(statut__in=["Résolu", "Fermé"]).count()
        critical_inc = Incident.objects.filter(
            priorite="Critique", statut__in=["Nouveau", "En cours", "En attente"]
        ).count()
        taux_resolution_inc = _pct(resolved_inc, total_incidents)

        total_tickets = Ticket.objects.count()
        resolved_tickets = Ticket.objects.filter(statut__in=RESOLVED_STATUSES).count()
        open_tickets = Ticket.objects.exclude(statut__in=RESOLVED_STATUSES).count()
        critical_tickets = Ticket.objects.filter(
            priorite="Critique"
        ).exclude(statut__in=RESOLVED_STATUSES).count()
        taux_resolution_tkt = _pct(resolved_tickets, total_tickets)

        total_complaints = Complaint.objects.count()
        closed_complaints = Complaint.objects.filter(statut__in=["Résolu", "Fermé", "Clôturé"]).count()
        taux_resolution_cmp = _pct(closed_complaints, total_complaints)

        deviations_pending = DoseDeviation.objects.filter(reviewed=False).count()
        deviations_critical = DoseDeviation.objects.filter(
            severity__in=["major", "critical"], reviewed=False
        ).count()

        quality_kpis = [
            _kpi("Taux de résolution des incidents", taux_resolution_inc, "%", 85, 70,
                 "Incidents résolus / incidents totaux"),
            _kpi("Incidents critiques ouverts", critical_inc, "", 0, 2,
                 "Incidents critiques non résolus"),
            _kpi("Taux de résolution des tickets", taux_resolution_tkt, "%", 80, 65,
                 "Tickets résolus / tickets totaux"),
            _kpi("Tickets critiques ouverts", critical_tickets, "", 0, 3,
                 "Tickets Critique non résolus"),
            _kpi("Taux de clôture des réclamations", taux_resolution_cmp, "%", 75, 60,
                 "Réclamations fermées / réclamations totales"),
            _kpi("Écarts de dose non examinés", deviations_pending, "", 0, 5,
                 "Dose deviations en attente de revue médicale"),
            _kpi("Écarts critiques/majeurs non revus", deviations_critical, "", 0, 1,
                 "Écarts de sévérité critique ou majeure non revus"),
            _kpi("Tickets ouverts", open_tickets, "", None, None,
                 "Tickets non résolus en cours", fmt="count"),
            _kpi("Total réclamations", total_complaints, "", None, None,
                 "Réclamations enregistrées", fmt="count"),
            _kpi("Total incidents", total_incidents, "", None, None,
                 "Incidents médicaux enregistrés", fmt="count"),
        ]

        # ── 5. DIMENSION COMPTABILITÉ (flux, charges, provisions) ─────────────
        # Revenus encaissés ce mois
        paid_this_month = Payment.objects.filter(
            payment_date__month=today.month,
            payment_date__year=today.year,
        ).aggregate(t=Sum("amount"))["t"] or Decimal("0")

        # Dépenses (flux sortants)
        outgoing_total = OutgoingPayment.objects.aggregate(t=Sum("amount"))["t"] or Decimal("0")
        outgoing_this_month = OutgoingPayment.objects.filter(
            payment_date__month=today.month,
            payment_date__year=today.year,
        ).aggregate(t=Sum("amount"))["t"] or Decimal("0")

        # Avances sur salaire (catégorie salary_advance)
        salary_advances_total = OutgoingPayment.objects.filter(
            category="salary_advance"
        ).aggregate(t=Sum("amount"))["t"] or Decimal("0")

        # Provisions créances douteuses avec seuils optimisés
        j30_cutoff = today - timedelta(days=30)
        j60_cutoff = today - timedelta(days=60)
        j90_cutoff = today - timedelta(days=90)

        # Calcul optimisé par tranches d'âge
        provision_total = Decimal("0")
        
        # Factures J30-J59 : provision 25%
        overdue_30_59 = Invoice.objects.filter(
            status="issued",
            due_date__lt=j30_cutoff,
            due_date__gte=j60_cutoff
        ).aggregate(t=Sum("total_amount"))["t"] or Decimal("0")
        provision_total += overdue_30_59 * Decimal("0.25")
        
        # Factures J60-J89 : provision 50%
        overdue_60_89 = Invoice.objects.filter(
            status="issued",
            due_date__lt=j60_cutoff,
            due_date__gte=j90_cutoff
        ).aggregate(t=Sum("total_amount"))["t"] or Decimal("0")
        provision_total += overdue_60_89 * Decimal("0.50")
        
        # Factures J90+ : provision 100%
        overdue_90_plus = Invoice.objects.filter(
            status="issued",
            due_date__lt=j90_cutoff
        ).aggregate(t=Sum("total_amount"))["t"] or Decimal("0")
        provision_total += overdue_90_plus * Decimal("1.00")

        # Masse salariale mensuelle (depuis EmployeeSalary)
        salary_configs = EmployeeSalary.objects.filter(
            employee__is_active=True
        ).only("base_salary", "transport_allowance", "meal_allowance", "bonus_percentage")
        
        masse_salariale = Decimal("0")
        for sc in salary_configs:
            bonus = (sc.base_salary * sc.bonus_percentage) / 100
            masse_salariale += sc.base_salary + sc.transport_allowance + sc.meal_allowance + bonus

        # Solde de trésorerie net (encaissements - décaissements)
        net_cashflow = float(paid) - float(outgoing_total)

        # Taux marge brute simplifiée = (encaissé - masse salariale mensuelle) / encaissé
        marge_brute = _pct(
            float(paid) - float(masse_salariale),
            float(paid)
        ) if float(paid) > 0 else 0.0

        # Délai moyen de paiement (DSO approx) : unpaid / (invoiced / 30)
        dso_days = round(float(unpaid) / (float(invoiced) / 30), 1) if float(invoiced) > 0 else 0.0

        # DunningAction ce mois
        dunning_this_month = DunningAction.objects.filter(
            action_date__month=today.month,
            action_date__year=today.year,
        ).count()

        accounting_kpis = [
            _kpi("Encaissements ce mois (TND)", float(paid_this_month), "TND", None, None,
                 "Total paiements reçus sur le mois courant", fmt="currency"),
            _kpi("Dépenses ce mois (TND)", float(outgoing_this_month), "TND", None, None,
                 "Flux sortants enregistrés ce mois", fmt="currency"),
            _kpi("Masse salariale mensuelle (TND)", float(masse_salariale), "TND", None, None,
                 "Cumul des rémunérations brutes mensuelles", fmt="currency"),
            _kpi("Avances sur salaire versées", float(salary_advances_total), "TND", None, None,
                 "Total avances sur salaire décaissées", fmt="currency"),
            _kpi("Provisions créances douteuses", float(provision_total), "TND", 0, 500,
                 "Provision estimée sur factures en retard (25-50-100%)", fmt="currency"),
            _kpi("Solde net de trésorerie (TND)", net_cashflow, "TND", None, None,
                 "Encaissements cumulés − décaissements cumulés", fmt="currency"),
            _kpi("Marge brute estimée", marge_brute, "%", 40, 20,
                 "( Encaissé − masse salariale ) / Encaissé", fmt="%"),
            _kpi("DSO — délai moyen de paiement", dso_days, "j", 30, 60,
                 "Jours moyens pour encaisser une facture (approx.)"),
            _kpi("Relances émises ce mois", dunning_this_month, "", None, None,
                 "Actions de recouvrement (relances) ce mois", fmt="count"),
            _kpi("Dépenses totales (TND)", float(outgoing_total), "TND", None, None,
                 "Cumul de tous les flux sortants", fmt="currency"),
        ]

        return Response({
            "generated_at": now.isoformat(),
            "period": today.isoformat(),
            "dimensions": [
                {"id": "clinical", "label": "Clinique & Traitements", "kpis": clinical_kpis},
                {"id": "finance", "label": "Finance & Recouvrement", "kpis": finance_kpis},
                {"id": "hr", "label": "Ressources Humaines", "kpis": hr_kpis},
                {"id": "quality", "label": "Qualité & Incidents", "kpis": quality_kpis},
                {"id": "accounting", "label": "Comptabilité & Trésorerie", "kpis": accounting_kpis},
            ],
        })

# ── S4: Export Views ──────────────────────────────────────────────────────────

import io
from django.http import HttpResponse
from django.utils import timezone as tz
from django.db.models.functions import TruncMonth
from django.db.models import Sum, Count
from rest_framework.permissions import IsAuthenticated


def _excel_response(data: list, headers: list, filename_prefix: str) -> HttpResponse:
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
    except ImportError:
        return HttpResponse("openpyxl not installed", status=500)

    wb = Workbook()
    ws = wb.active
    ws.title = "Rapport"
    hfont = Font(bold=True, size=11, color="FFFFFF")
    hfill = PatternFill(start_color="1a73e8", end_color="1a73e8", fill_type="solid")
    border = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"),  bottom=Side(style="thin"),
    )
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=str(h))
        cell.font = hfont; cell.fill = hfill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = border
    for ri, row in enumerate(data, 2):
        for ci, val in enumerate(row, 1):
            cell = ws.cell(row=ri, column=ci)
            cell.value = "" if val is None else (float(val) if hasattr(val, "__float__") else str(val))
            cell.border = border
            cell.alignment = Alignment(horizontal="left", vertical="center")
    for col in range(1, len(headers) + 1):
        ws.column_dimensions[ws.cell(row=1, column=col).column_letter].width = 22
    filename = f"{filename_prefix}_{tz.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    response = HttpResponse(content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    wb.save(response)
    return response


def _pdf_response(data: list, headers: list, filename_prefix: str, title: str = "Rapport") -> HttpResponse:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet
    except ImportError:
        return HttpResponse("reportlab not installed", status=500)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=1*cm, leftMargin=1*cm, topMargin=1*cm, bottomMargin=1*cm)
    styles = getSampleStyleSheet()
    tdata = [[Paragraph(str(h), styles["Heading4"]) for h in headers]]
    for row in data:
        tdata.append([Paragraph(str(v) if v is not None else "", styles["Normal"]) for v in row])
    tbl = Table(tdata, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a73e8")),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, 0), 10),
        ("FONTSIZE",   (0, 1), (-1, -1), 9),
        ("GRID",       (0, 0), (-1, -1), 0.5, colors.grey),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("PADDING",    (0, 0), (-1, -1), 5),
    ]))
    elements = [
        Paragraph(title, styles["Heading1"]),
        Spacer(1, 0.3*cm),
        Paragraph(f"Généré le : {tz.now().strftime('%d/%m/%Y %H:%M')}", styles["Normal"]),
        Spacer(1, 0.4*cm),
        tbl,
    ]
    doc.build(elements)
    pdf = buf.getvalue(); buf.close()
    filename = f"{filename_prefix}_{tz.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response.write(pdf)
    return response


class ExportTicketsView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        from apps.crm.models import Ticket
        tickets = Ticket.objects.select_related("client").all()
        headers = ["N° Ticket", "Titre", "Priorité", "Statut", "Patient", "Créé le"]
        data = [[t.numero, t.titre, t.priorite, t.statut, str(t.client), t.created_at.strftime("%d/%m/%Y")] for t in tickets]
        fmt = request.query_params.get("format", "excel")
        return _pdf_response(data, headers, "tickets", "Rapport Tickets") if fmt == "pdf" else _excel_response(data, headers, "tickets")


class ExportPatientsView(APIView):
    permission_classes = [AdminOnlyPermission]
    def get(self, request):
        from apps.crm.models import Patient
        patients = Patient.objects.all()
        headers = ["MRN", "Prénom", "Nom", "Email", "Téléphone", "Créé le"]
        data = [[p.mrn, p.first_name, p.last_name, p.email, p.phone, p.created_at.strftime("%d/%m/%Y")] for p in patients]
        fmt = request.query_params.get("format", "excel")
        return _pdf_response(data, headers, "patients", "Rapport Patients") if fmt == "pdf" else _excel_response(data, headers, "patients")


class ExportInvoicesView(APIView):
    permission_classes = [AdminOnlyPermission]
    def get(self, request):
        from apps.accounting.models import Invoice
        invoices = Invoice.objects.select_related("patient").all()
        headers = ["N° Facture", "Patient", "Montant", "Statut", "Date émission"]
        data = [[inv.invoice_number, str(inv.patient), float(inv.total_amount), inv.status,
                 inv.issue_date.strftime("%d/%m/%Y") if inv.issue_date else ""] for inv in invoices]
        fmt = request.query_params.get("format", "excel")
        return _pdf_response(data, headers, "factures", "Rapport Factures") if fmt == "pdf" else _excel_response(data, headers, "factures")


class ExportRevenueView(APIView):
    permission_classes = [AdminOnlyPermission]
    def get(self, request):
        from apps.accounting.models import Invoice
        rows = (Invoice.objects.annotate(month=TruncMonth("issue_date"))
                .values("month").annotate(total=Sum("total_amount"), count=Count("id")).order_by("month"))
        headers = ["Mois", "Total (TND)", "Nombre de factures"]
        data = [[r["month"].strftime("%B %Y") if r["month"] else "N/A", float(r["total"] or 0), r["count"]] for r in rows]
        fmt = request.query_params.get("format", "excel")
        return _pdf_response(data, headers, "ca", "Chiffre d'affaires") if fmt == "pdf" else _excel_response(data, headers, "ca")


class ExportSessionsView(APIView):
    permission_classes = [AdminOnlyPermission]
    def get(self, request):
        from apps.crm.models import TreatmentSession
        sessions = TreatmentSession.objects.select_related("treatment_plan__patient").all()
        headers = ["Patient", "Plan", "N° Séance", "Statut", "Date prévue", "Dose (Gy)"]
        data = [[str(s.treatment_plan.patient) if s.treatment_plan else "",
                 s.treatment_plan.name if s.treatment_plan else "",
                 s.session_number, s.status,
                 s.scheduled_datetime.strftime("%d/%m/%Y") if s.scheduled_datetime else "",
                 float(s.dose_delivered) if s.dose_delivered else ""] for s in sessions]
        fmt = request.query_params.get("format", "excel")
        return _pdf_response(data, headers, "seances", "Rapport Séances") if fmt == "pdf" else _excel_response(data, headers, "seances")