import { apiFetch } from "./api";

export type SalaryAdvanceStatus = "En attente" | "Approuvée" | "Refusée" | "Remboursée";

export type ApiSalaryAdvance = {
  id: number;
  employee: number;
  employee_name: string;
  amount: string;
  request_date: string;
  reason: string;
  statut: SalaryAdvanceStatus;
  repayment_date: string | null;
  amount_repaid: string;
  notes: string;
  approved_by: number | null;
  approved_by_name: string | null;
  created_at: string;
  updated_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchSalaryAdvances(): Promise<ApiSalaryAdvance[]> {
  const data = await apiFetch<Paginated<ApiSalaryAdvance>>("/hr/salary-advances/");
  return unwrap(data);
}

export type SalaryAdvanceWritePayload = {
  employee: number;
  amount: string;
  request_date: string;
  reason?: string;
  notes?: string;
};

export function createSalaryAdvance(
  payload: SalaryAdvanceWritePayload,
): Promise<ApiSalaryAdvance> {
  return apiFetch<ApiSalaryAdvance>("/hr/salary-advances/", {
    method: "POST",
    body: payload,
  });
}

export function updateSalaryAdvance(
  id: number,
  payload: Partial<SalaryAdvanceWritePayload>,
): Promise<ApiSalaryAdvance> {
  return apiFetch<ApiSalaryAdvance>(`/hr/salary-advances/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function approveSalaryAdvance(id: number): Promise<ApiSalaryAdvance> {
  return apiFetch<ApiSalaryAdvance>(`/hr/salary-advances/${id}/approve/`, {
    method: "POST",
  });
}

export function rejectSalaryAdvance(id: number): Promise<ApiSalaryAdvance> {
  return apiFetch<ApiSalaryAdvance>(`/hr/salary-advances/${id}/reject/`, {
    method: "POST",
  });
}

export function markSalaryAdvanceRepaid(
  id: number,
  repaymentDate?: string,
): Promise<ApiSalaryAdvance> {
  return apiFetch<ApiSalaryAdvance>(`/hr/salary-advances/${id}/mark_repaid/`, {
    method: "POST",
    body: repaymentDate ? { repayment_date: repaymentDate } : undefined,
  });
}