import { apiFetch } from "./api";

export type OutgoingPaymentCategory =
  | "salary_advance"
  | "supplier"
  | "other";

export type OutgoingPaymentMethod =
  | "cash"
  | "bank_transfer"
  | "check";

export interface ApiOutgoingPayment {
  id: number;
  reference: string;
  category: OutgoingPaymentCategory;
  category_display: string;
  amount: string;
  payment_date: string;
  method: OutgoingPaymentMethod;
  method_display: string;
  description: string;
  source_object_id: number | null;
  created_at: string;
  updated_at: string;
}

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchOutgoingPayments(): Promise<ApiOutgoingPayment[]> {
  const data = await apiFetch<Paginated<ApiOutgoingPayment>>(
    "/accounting/outgoing-payments/?page_size=200"
  );
  return unwrap(data);
}