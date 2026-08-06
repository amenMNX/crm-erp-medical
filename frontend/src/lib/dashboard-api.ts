// /tmp/project/src/lib/dashboard-api.ts
import { apiFetch } from "./api";

export type ApiDashboardSummary = {
  // Common
  patients_count: number;
  employees_count: number;
  active_employees: number;
  user_role: string;

  // Finance
  invoiced_total?: string;
  paid_total?: string;
  unpaid_total?: string;
  overdue_invoices_count?: number;
  overdue_invoices_total?: string;
  overdue_threshold_days?: number;
  invoices_count?: number;
  payments_count?: number;
  paid_invoices_count?: number;
  unpaid_invoices_count?: number;
  cnam_pending_count?: number;
  cnam_approved_count?: number;
  cnam_reimbursed_count?: number;

  // Medical
  appointments_count?: number;
  treatment_plans_count?: number;
  treatment_sessions_count?: number;
  scheduled_sessions_count?: number;
  completed_sessions_count?: number;
  active_treatment_plans_count?: number;
  missed_sessions_today?: number;
  sessions_today?: number;
  patients_with_active_plan?: number;

  // Support
  tickets_count?: number;
  open_tickets_count?: number;
  resolved_tickets_count?: number;
  critical_tickets?: number;
  tickets_by_status?: Record<string, number>;
  tickets_resolved_this_month?: number;

  // HR
  leave_requests_count?: number;
  pending_leave_requests_count?: number;
  approved_leaves_this_month?: number;
  absences_today?: number;
  shifts_today?: number;
  uncovered_shifts_today?: number;
  employees_on_leave_today?: number;
};

export async function fetchDashboardSummary(): Promise<ApiDashboardSummary> {
  return apiFetch<ApiDashboardSummary>("/dashboard/summary/");
}