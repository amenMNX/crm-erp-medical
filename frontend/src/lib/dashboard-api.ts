import { apiFetch } from "./api";

export type ApiDashboardSummary = {
  patients_count: number;
  appointments_count: number;
  treatment_plans_count: number;
  treatment_sessions_count: number;
  scheduled_sessions_count: number;
  completed_sessions_count: number;
  active_treatment_plans_count: number;
  invoices_count: number;
  payments_count: number;
  paid_invoices_count: number;
  unpaid_invoices_count: number;
  invoiced_total: string;
  paid_total: string;
  unpaid_total: string;
  tickets_count: number;
  open_tickets_count: number;
  resolved_tickets_count: number;
  employees_count: number;
  leave_requests_count: number;
  pending_leave_requests_count: number;
};

export async function fetchDashboardSummary(): Promise<ApiDashboardSummary> {
  return apiFetch<ApiDashboardSummary>("/dashboard/summary/");
}