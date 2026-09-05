import { apiFetch } from "./api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiPatient = {
  id: number;
  first_name: string;
  last_name: string;
  cin: string;
  phone: string;
  email: string;
  birth_date: string;
  address: string;
  medical_record_number: string;
  diagnosis: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type PatientWritePayload = {
  first_name: string;
  last_name: string;
  cin?: string;
  phone?: string;
  email?: string;
  birth_date?: string;
  address?: string;
  diagnosis?: string;
  notes?: string;
};

// ─── Pagination unwrap ────────────────────────────────────────────────────────

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Fetch one page of patients (default page_size from backend = 10).
 * Used by patients.index.tsx for the paginated patient list.
 */
export async function fetchPatients(params?: {
  search?: string;
  page?: number;
}): Promise<{ results: ApiPatient[]; count: number }> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.page)   qs.set("page", String(params.page));
  const query = qs.toString() ? `?${qs}` : "";
  const data = await apiFetch<Paginated<ApiPatient>>(`/crm/patients/${query}`);
  if (Array.isArray(data)) {
    return { results: data, count: data.length };
  }
  return data;
}

/**
 * Fetch ALL patients across pages (page_size=1000 shortcut).
 * Used by the dashboard, calendar, invoices, treatments, and cnam pages
 * which need a flat list for dropdowns or "recent patients" widgets.
 * Returns ApiPatient[] directly — no unwrapping needed at call sites.
 */
export async function fetchAllPatients(): Promise<ApiPatient[]> {
  const data = await apiFetch<Paginated<ApiPatient>>("/crm/patients/?page_size=1000");
  return unwrap(data);
}

export function fetchPatient(id: number): Promise<ApiPatient> {
  return apiFetch<ApiPatient>(`/crm/patients/${id}/`);
}

export function createPatient(payload: PatientWritePayload): Promise<ApiPatient> {
  return apiFetch<ApiPatient>("/crm/patients/", { method: "POST", body: payload });
}

export function updatePatient(
  id: number,
  payload: Partial<PatientWritePayload>,
): Promise<ApiPatient> {
  return apiFetch<ApiPatient>(`/crm/patients/${id}/`, { method: "PATCH", body: payload });
}

export function deletePatient(id: number): Promise<void> {
  return apiFetch<void>(`/crm/patients/${id}/`, { method: "DELETE" });
}