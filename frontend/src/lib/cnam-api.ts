import { apiFetch } from "./api";

export type CNAMStatus = "En attente" | "Approuvée" | "Rejetée" | "Remboursée";

export type ApiCNAMClaim = {
  id: number;
  patient: number;
  patient_name: string;
  invoice: number;
  invoice_number: string;
  cnam_number: string;
  status: CNAMStatus;
  amount_claimed: string;
  amount_reimbursed: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchCNAMClaims(): Promise<ApiCNAMClaim[]> {
  const data = await apiFetch<Paginated<ApiCNAMClaim>>("/accounting/cnam-claims/");
  return unwrap(data);
}

export async function fetchCNAMClaim(id: number): Promise<ApiCNAMClaim> {
  return apiFetch<ApiCNAMClaim>(`/accounting/cnam-claims/${id}/`);
}

export type CNAMClaimWritePayload = {
  patient: number;
  invoice: number;
  cnam_number: string;
  status?: CNAMStatus;
  amount_claimed?: string;
  amount_reimbursed?: string;
  notes?: string;
};

export function createCNAMClaim(payload: CNAMClaimWritePayload): Promise<ApiCNAMClaim> {
  return apiFetch<ApiCNAMClaim>("/accounting/cnam-claims/", {
    method: "POST",
    body: payload,
  });
}

export function updateCNAMClaim(
  id: number,
  payload: Partial<CNAMClaimWritePayload>,
): Promise<ApiCNAMClaim> {
  return apiFetch<ApiCNAMClaim>(`/accounting/cnam-claims/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteCNAMClaim(id: number): Promise<void> {
  return apiFetch<void>(`/accounting/cnam-claims/${id}/`, {
    method: "DELETE",
  });
}
