import { apiFetch } from "./api";

export type ApiAbsence = {
  id: number;
  employee: number;
  employee_name: string;
  date: string;
  motif: string;
  created_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchAbsences(): Promise<ApiAbsence[]> {
  const data = await apiFetch<Paginated<ApiAbsence>>("/hr/absences/");
  return unwrap(data);
}

export type AbsenceWritePayload = {
  employee: number;
  date: string;
  motif?: string;
};

export function createAbsence(payload: AbsenceWritePayload): Promise<ApiAbsence> {
  return apiFetch<ApiAbsence>("/hr/absences/", {
    method: "POST",
    body: payload,
  });
}

export function deleteAbsence(id: number): Promise<void> {
  return apiFetch<void>(`/hr/absences/${id}/`, {
    method: "DELETE",
  });
}