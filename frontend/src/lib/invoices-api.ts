import { apiFetch } from "./api";

export type InvoiceStatus = "draft" | "issued" | "paid" | "cancelled";

export type ApiInvoice = {
  id: number;
  patient: number;
  patient_name: string;
  treatment_plan: number | null;
  treatment_plan_name: string | null;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  paid_amount: string;
  balance_due: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchInvoices(): Promise<ApiInvoice[]> {
  const data = await apiFetch<Paginated<ApiInvoice>>("/accounting/invoices/");
  return unwrap(data);
}

export type InvoiceWritePayload = {
  patient: number;
  treatment_plan?: number | null;
  invoice_number: string;
  issue_date: string;
  due_date?: string | null;
  status?: InvoiceStatus;
  subtotal?: string;
  tax_amount?: string;
  total_amount?: string;
  notes?: string;
};

export function createInvoice(payload: InvoiceWritePayload): Promise<ApiInvoice> {
  return apiFetch<ApiInvoice>("/accounting/invoices/", {
    method: "POST",
    body: payload,
  });
}

export function updateInvoice(
  id: number,
  payload: Partial<InvoiceWritePayload>,
): Promise<ApiInvoice> {
  return apiFetch<ApiInvoice>(`/accounting/invoices/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteInvoice(id: number): Promise<void> {
  return apiFetch<void>(`/accounting/invoices/${id}/`, {
    method: "DELETE",
  });
}

export async function fetchInvoice(id: number): Promise<ApiInvoice> {
  return apiFetch<ApiInvoice>(`/accounting/invoices/${id}/`);
}