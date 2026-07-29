import { apiFetch } from "./api";

export type PaymentMethod = "cash" | "card" | "bank_transfer" | "check";

export type ApiPayment = {
  id: number;
  invoice: number;
  invoice_number: string;
  payment_number: string;
  payment_date: string;
  amount: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  created_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export type PaymentWritePayload = {
  invoice: number;
  payment_number: string;
  payment_date: string;
  amount: string;
  method?: PaymentMethod;
  reference?: string;
  notes?: string;
};

export function createPayment(payload: PaymentWritePayload): Promise<ApiPayment> {
  return apiFetch<ApiPayment>("/accounting/payments/", {
    method: "POST",
    body: payload,
  });
}

export function deletePayment(id: number): Promise<void> {
  return apiFetch<void>(`/accounting/payments/${id}/`, {
    method: "DELETE",
  });
}

export async function fetchPayments(invoiceId?: number): Promise<ApiPayment[]> {
  const query = invoiceId ? `?invoice=${invoiceId}` : "";
  const data = await apiFetch<Paginated<ApiPayment>>(`/accounting/payments/${query}`);
  return unwrap(data);
}