import { apiFetch } from "./api";
 
// ─── Types ────────────────────────────────────────────────────────────────────
 
export type AppointmentType = "simple" | "complex" | "followup" | "urgency";
export type AppointmentPriority = 1 | 2 | 3;
 
export interface SlotSuggestion {
  type: "closest" | "best_match" | "flexible";
  datetime: string;       // ISO
  duration_minutes: number;
  score: number;          // 0–10
  score_label: string;    // "⭐ 8.5/10"
}
 
export interface SmartSuggestResponse {
  suggestions: SlotSuggestion[];
  count: number;
}
 
export interface SmartBookResponse {
  appointment_id: number;
  appointment_date: string;
  status: string;
  duration_minutes: number;
  confirmation_token: string;
  confirmation_deadline: string | null;
  message: string;
}
 
export interface DoctorAvailability {
  id: number;
  doctor: number;
  doctor_name: string;
  day_of_week: number;   // 0=Lundi…5=Samedi
  start_time: string;    // "08:00:00"
  end_time: string;
  is_active: boolean;
}
 
export interface PatientPreferences {
  id: number;
  patient: number;
  preferred_time_slot: "morning" | "afternoon" | "any";
  preferred_days: number[];
  preferred_doctor: number | null;
}
 
export interface WaitingListEntry {
  id: number;
  patient: number;
  patient_name: string;
  doctor: number | null;
  appointment_type: string;
  priority: number;
  earliest_date: string | null;
  latest_date: string | null;
  proposed_slot: string | null;
  proposal_expires: string | null;
  proposal_accepted: boolean | null;
  is_active: boolean;
  created_at: string;
}
 
export interface AppointmentExtension {
  id: number;
  appointment: number;
  doctor: number | null;
  doctor_name: string | null;
  room: number | null;
  room_name: string | null;
  machine: number | null;
  machine_name: string | null;
  appointment_type: AppointmentType;
  duration_minutes: number;
  priority: AppointmentPriority;
  relevance_score: number | null;
  confirmation_deadline: string | null;
  confirmed_at: string | null;
}
 
// ─── API calls ────────────────────────────────────────────────────────────────
 
export function smartSuggest(params: {
  patient_id: number;
  doctor_id: number;
  appointment_type?: AppointmentType;
  priority?: AppointmentPriority;
  target_date?: string;
}): Promise<SmartSuggestResponse> {
  return apiFetch<SmartSuggestResponse>("/crm/appointments/smart-suggest/", {
    method: "POST",
    body: params,
  });
}
 
export function smartBook(params: {
  patient_id: number;
  doctor_id: number;
  slot_datetime: string;
  appointment_type?: AppointmentType;
  priority?: AppointmentPriority;
  room_id?: number;
  machine_id?: number;
  reason?: string;
}): Promise<SmartBookResponse> {
  return apiFetch<SmartBookResponse>("/crm/appointments/smart-book/", {
    method: "POST",
    body: params,
  });
}
 
export function cancelAppointment(id: number): Promise<{
  detail: string;
  waiting_list_notified: number;
  notified_patients: string[];
}> {
  return apiFetch(`/crm/appointments/${id}/cancel/`, { method: "POST" });
}
 
export function getAppointmentExtension(id: number): Promise<AppointmentExtension> {
  return apiFetch<AppointmentExtension>(`/crm/appointments/${id}/extension/`);
}
 
export function getDoctorAvailability(doctorId: number): Promise<DoctorAvailability[]> {
  return apiFetch<DoctorAvailability[]>(`/crm/doctors/${doctorId}/availability/`);
}
 
export function addDoctorAvailability(
  doctorId: number,
  data: Omit<DoctorAvailability, "id" | "doctor" | "doctor_name">
): Promise<DoctorAvailability> {
  return apiFetch<DoctorAvailability>(`/crm/doctors/${doctorId}/availability/`, {
    method: "POST",
    body: data,
  });
}
 
export function updateDoctorAvailability(
  pk: number,
  data: Partial<Omit<DoctorAvailability, "id" | "doctor_name">>
): Promise<DoctorAvailability> {
  return apiFetch<DoctorAvailability>(`/crm/doctors/availability/${pk}/`, {
    method: "PATCH",
    body: data,
  });
}
 
export function deleteDoctorAvailability(pk: number): Promise<void> {
  return apiFetch<void>(`/crm/doctors/availability/${pk}/`, { method: "DELETE" });
}
 
export function getPatientPreferences(patientId: number): Promise<PatientPreferences> {
  return apiFetch<PatientPreferences>(`/crm/patients/${patientId}/scheduling-preferences/`);
}
 
export function savePatientPreferences(
  patientId: number,
  data: Partial<PatientPreferences>
): Promise<PatientPreferences> {
  return apiFetch<PatientPreferences>(`/crm/patients/${patientId}/scheduling-preferences/`, {
    method: "PUT",
    body: { ...data, patient: patientId },
  });
}
 
export function getWaitingList(): Promise<WaitingListEntry[]> {
  return apiFetch<WaitingListEntry[]>("/crm/waiting-list/");
}
 
export function addToWaitingList(data: {
  patient: number;
  doctor?: number;
  appointment_type?: string;
  priority?: number;
}): Promise<WaitingListEntry> {
  return apiFetch<WaitingListEntry>("/crm/waiting-list/", { method: "POST", body: data });
}
 
// ─── Helpers ─────────────────────────────────────────────────────────────────
 
export const DAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
 
export const TYPE_LABELS: Record<AppointmentType, string> = {
  simple:   "Consultation simple (15 min)",
  complex:  "Consultation complexe (30 min)",
  followup: "Suivi de traitement (45 min)",
  urgency:  "Urgence",
};
 
export const PRIORITY_LABELS: Record<number, string> = {
  1: "🔴 Urgence (P1)",
  2: "🟡 Suivi (P2)",
  3: "🟢 Annuel (P3)",
};
