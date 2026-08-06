import { apiFetch } from "./api";

export type ApiInvoiceLineItem = {
  id: number;
  description: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
  line_subtotal: string;
  line_tax: string;
  line_total: string;
  created_at: string;
};

export type InvoiceLineItemWritePayload = {
  invoice: number;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchInvoiceLineItems(invoiceId: number): Promise<ApiInvoiceLineItem[]> {
  const data = await apiFetch<Paginated<ApiInvoiceLineItem>>(
    `/accounting/invoice-line-items/?invoice=${invoiceId}&page_size=200`,
  );
  return unwrap(data);
}

export async function createInvoiceLineItem(
  payload: InvoiceLineItemWritePayload,
): Promise<ApiInvoiceLineItem> {
  return apiFetch<ApiInvoiceLineItem>(`/accounting/invoice-line-items/`, {
    method: "POST",
    body: payload,
  });
}

export async function updateInvoiceLineItem(
  id: number,
  payload: Partial<InvoiceLineItemWritePayload>,
): Promise<ApiInvoiceLineItem> {
  return apiFetch<ApiInvoiceLineItem>(`/accounting/invoice-line-items/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteInvoiceLineItem(id: number): Promise<void> {
  await apiFetch<void>(`/accounting/invoice-line-items/${id}/`, {
    method: "DELETE",
  });
}
