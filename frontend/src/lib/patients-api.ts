import { apiFetch } from "./api";

export type ApiPatient = {
  id: number;
  first_name: string;
  last_name: string;
  cin: string | null;
  phone: string;
  email: string;
  birth_date: string | null;
  address: string;
  medical_record_number: string;
  diagnosis: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchPatients(): Promise<ApiPatient[]> {
  const data = await apiFetch<Paginated<ApiPatient>>("/crm/patients/");
  return unwrap(data);
}

export async function fetchPatient(id: number): Promise<ApiPatient> {
  return apiFetch<ApiPatient>(`/crm/patients/${id}/`);
}

export type PatientWritePayload = {
  first_name: string;
  last_name: string;
  cin?: string | null;
  phone?: string;
  email?: string;
  birth_date?: string | null;
  address?: string;
  medical_record_number: string;
  diagnosis?: string;
  notes?: string;
};

export function createPatient(payload: PatientWritePayload): Promise<ApiPatient> {
  return apiFetch<ApiPatient>("/crm/patients/", {
    method: "POST",
    body: payload,
  });
}

export function updatePatient(
  id: number,
  payload: Partial<PatientWritePayload>,
): Promise<ApiPatient> {
  return apiFetch<ApiPatient>(`/crm/patients/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function deletePatient(id: number): Promise<void> {
  return apiFetch<void>(`/crm/patients/${id}/`, {
    method: "DELETE",
  });
}