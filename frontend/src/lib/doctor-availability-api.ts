/**
 * src/lib/doctor-availability-api.ts
 *
 * Wraps the two backend endpoints for DoctorAvailability:
 *   GET  /api/crm/doctors/<doctor_id>/availability/
 *   POST /api/crm/doctors/<doctor_id>/availability/
 *   PUT  /api/crm/doctors/availability/<pk>/
 *   DELETE /api/crm/doctors/availability/<pk>/
 *
 * These endpoints are staff-only (token / session auth — standard apiFetch).
 */

import { apiFetch } from "./api";
import { fetchUsers, type ApiUser } from "./users-api";

// ─── Types ────────────────────────────────────────────────────────────────────

/** 0 = Lundi … 5 = Samedi  (identique à Python weekday(), pas de Dimanche) */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5;

export const DAY_LABELS: Record<DayOfWeek, string> = {
  0: "Lundi",
  1: "Mardi",
  2: "Mercredi",
  3: "Jeudi",
  4: "Vendredi",
  5: "Samedi",
};

export const DAY_SHORT: Record<DayOfWeek, string> = {
  0: "Lun",
  1: "Mar",
  2: "Mer",
  3: "Jeu",
  4: "Ven",
  5: "Sam",
};

/** One availability block as returned by the backend */
export interface ApiAvailability {
  id: number;
  doctor: number;        // doctor user id
  day_of_week: DayOfWeek;
  start_time: string;   // "HH:MM:SS"
  end_time: string;     // "HH:MM:SS"
  is_active: boolean;
  room: number | null;
  room_name: string | null;
}

/** Payload to create a new availability block */
export interface AvailabilityWritePayload {
  doctor: number;
  day_of_week: DayOfWeek;
  start_time: string;   // "HH:MM" — backend accepts without seconds
  end_time: string;
  is_active?: boolean;
  room?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** "08:00:00" → "08:00" */
export function fmtTime(t: string): string {
  return t.slice(0, 5);
}

/** "08:00" → "8h00", "13:30" → "13h30" */
export function displayTime(t: string): string {
  const [h, m] = fmtTime(t).split(":");
  return m === "00" ? `${parseInt(h)}h` : `${parseInt(h)}h${m}`;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * List all availability blocks for one doctor.
 * GET /api/crm/doctors/<doctor_id>/availability/
 */
export function fetchDoctorAvailability(doctorId: number): Promise<ApiAvailability[]> {
  return apiFetch<ApiAvailability[]>(`/crm/doctors/${doctorId}/availability/`);
}

/**
 * Add a new availability block.
 * POST /api/crm/doctors/<doctor_id>/availability/
 */
export function addAvailabilityBlock(
  doctorId: number,
  payload: Omit<AvailabilityWritePayload, "doctor">,
): Promise<ApiAvailability> {
  return apiFetch<ApiAvailability>(`/crm/doctors/${doctorId}/availability/`, {
    method: "POST",
    body: { ...payload, doctor: doctorId },
  });
}

/**
 * Update an existing block (partial patch — e.g. toggle is_active).
 * PUT /api/crm/doctors/availability/<pk>/
 */
export function updateAvailabilityBlock(
  pk: number,
  payload: Partial<AvailabilityWritePayload>,
): Promise<ApiAvailability> {
  return apiFetch<ApiAvailability>(`/crm/doctors/availability/${pk}/`, {
    method: "PUT",
    body: payload,
  });
}

/**
 * Delete an availability block permanently.
 * DELETE /api/crm/doctors/availability/<pk>/
 */
export function deleteAvailabilityBlock(pk: number): Promise<void> {
  return apiFetch<void>(`/crm/doctors/availability/${pk}/`, {
    method: "DELETE",
  });
}

/**
 * Convenience: fetch the list of users with role="doctor".
 * Reuses the existing /accounts/users/ endpoint and filters client-side.
 */
export async function fetchDoctors(): Promise<ApiUser[]> {
  const users = await fetchUsers();
  return users.filter((u) => u.profile?.role === "doctor" && u.is_active);
}

// ─── Rooms ────────────────────────────────────────────────────────────────────

export interface ApiRoom {
  id: number;
  name: string;
  usage: "medicalized" | "patient_appointment" | "operation_room" | "stock";
  specialty: string;
  location: string;
  status: "active" | "maintenance" | "closed";
  bookings_allowed: boolean;
}

/**
 * Fetch rooms usable for doctor availability slots:
 *   patient_appointment + medicalized + operation_room (active only).
 * GET /api/crm/rooms/
 */
export async function fetchAppointmentRooms(): Promise<ApiRoom[]> {
  const data = await apiFetch<{ results: ApiRoom[] } | ApiRoom[]>("/crm/rooms/");
  const all: ApiRoom[] = Array.isArray(data) ? data : data.results;
  return all.filter(
    (r) =>
      r.status === "active" &&
      (r.usage === "patient_appointment" ||
        r.usage === "medicalized" ||
        r.usage === "operation_room")
  );
}