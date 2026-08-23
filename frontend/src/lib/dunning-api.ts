import { apiFetch } from "./api";

export interface DunningAction {
  id: number;
  invoice: number;
  invoice_number: string;
  patient_name: string;
  level: "j30" | "j60" | "j90" | "huissier";
  level_display: string;
  method: "email" | "courier" | "phone" | "huissier";
  method_display: string;
  action_date: string;
  fee_amount: string;
  notes: string;
  recorded_by: number | null;
  recorded_by_name: string | null;
  created_at: string;
}

export interface OverdueInvoice {
  id: number;
  invoice_number: string;
  patient_name: string;
  total_amount: string;
  paid_amount: string;
  balance_due: string;
  days_overdue: number;
  dunning_stage: string | null;
  doubtful_provision_amount: string;
  due_date: string;
  status: string;
}

export const fetchDunningActions = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return apiFetch<{ results: DunningAction[]; count: number }>(`/accounting/dunning/${qs}`);
};

export const fetchOverdueInvoices = () =>
  apiFetch<OverdueInvoice[]>("/accounting/dunning/overdue-invoices/");

export const createDunningAction = (data: Partial<DunningAction>) =>
  apiFetch<DunningAction>("/accounting/dunning/", {
    method: "POST",
    body: JSON.stringify(data),
  });
