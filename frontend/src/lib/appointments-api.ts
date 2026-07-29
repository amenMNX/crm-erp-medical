import { apiFetch } from "./api";

export type AppointmentStatus = "scheduled" | "confirmed" | "cancelled" | "done";

export type ApiAppointment = {
  id: number;
  patient: number;
  patient_name: string;
  title: string;
  appointment_date: string; // ISO datetime
  status: AppointmentStatus;
  reason: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchAppointments(): Promise<ApiAppointment[]> {
  const data = await apiFetch<Paginated<ApiAppointment>>("/crm/appointments/");
  return unwrap(data);
}

export type AppointmentWritePayload = {
  patient: number;
  title: string;
  appointment_date: string;
  status?: AppointmentStatus;
  reason?: string;
  notes?: string;
};

export function createAppointment(payload: AppointmentWritePayload): Promise<ApiAppointment> {
  return apiFetch<ApiAppointment>("/crm/appointments/", {
    method: "POST",
    body: payload,
  });
}

export function updateAppointment(
  id: number,
  payload: Partial<AppointmentWritePayload>,
): Promise<ApiAppointment> {
  return apiFetch<ApiAppointment>(`/crm/appointments/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteAppointment(id: number): Promise<void> {
  return apiFetch<void>(`/crm/appointments/${id}/`, { method: "DELETE" });
}
