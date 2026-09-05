import { apiFetch } from "./api";

export type AppointmentStatus = "scheduled" | "confirmed" | "cancelled" | "done" | "no_show";

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
  // Enriched from AppointmentExtension (present when select_related is used)
  doctor_name:      string | null;
  doctor_id:        number | null;
  appointment_type: string;
  duration_minutes: number;
  room_name:        string | null;
};

type PaginatedResponse<T> = {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
};
type ApiResponse<T> = PaginatedResponse<T> | T[];

export async function fetchAppointments(): Promise<ApiAppointment[]> {
  const data = await apiFetch<ApiResponse<ApiAppointment>>("/crm/appointments/");
  if (Array.isArray(data)) return data;
  return data.results;
}

/**
 * Convert an absolute `next` URL returned by DRF into a path that apiFetch understands.
 *
 * DRF returns next as an absolute URL, e.g.:
 *   "http://localhost:8000/api/crm/appointments/?page=2"
 *
 * apiFetch expects a path starting after /api, e.g.:
 *   "/crm/appointments/?page=2"
 *
 * So we strip the origin AND the /api prefix.
 */
function nextToPath(next: string): string {
  // Remove the origin (http://host:port)
  let path = next.replace(/^https?:\/\/[^/]+/, "");
  // Remove the /api prefix that apiFetch will re-add
  if (path.startsWith("/api/")) {
    path = path.slice(4); // "/api/crm/..." → "/crm/..."
  }
  return path;
}

/**
 * Fetch ALL appointments by walking every page.
 *
 * Uses page_size=200 to minimise round-trips.  Results are cached by React
 * Query for 5 minutes (set staleTime on the calling useQuery), so this
 * waterfall only runs on the first load and after explicit invalidation.
 */
export async function fetchAllAppointments(): Promise<ApiAppointment[]> {
  const all: ApiAppointment[] = [];

  let nextPath: string | null = "/crm/appointments/?page_size=200";

  while (nextPath !== null) {
    // eslint-disable-next-line no-await-in-loop
    const data = await apiFetch<ApiResponse<ApiAppointment>>(nextPath);

    if (Array.isArray(data)) {
      all.push(...data);
      break;
    }

    all.push(...data.results);
    nextPath = data.next ? nextToPath(data.next) : null;
  }

  return all;
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