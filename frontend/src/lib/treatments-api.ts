import { apiFetch } from "./api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TreatmentPlanStatus = "draft" | "active" | "completed" | "cancelled";
export type TreatmentSessionStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "missed";

export interface ApiTreatmentSession {
  id: number;
  patient: number;
  patient_name: string;
  treatment_plan: number;
  treatment_plan_name: string;
  session_number: number;
  scheduled_datetime: string;
  actual_datetime: string | null;
  status: TreatmentSessionStatus;
  machine: number | null;
  machine_name: string | null;
  room: number | null;
  room_name: string | null;
  dose_delivered: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ApiMachine {
  id: number;
  name: string;
  model: string;
  status: "active" | "maintenance" | "decommissioned";
  notes: string;
}

export interface ApiRoom {
  id: number;
  name: string;
  location: string;
  status: "active" | "maintenance" | "closed";
  notes: string;
}

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

// ── Treatment Plans ───────────────────────────────────────────────────────────

export interface ApiTreatmentPlan {
  id: number;
  patient: number;
  patient_name: string;
  name: string;
  diagnosis: string;
  protocol: string;
  total_sessions: number;
  dose_per_session: string;
  total_dose: string;
  start_date: string | null;
  end_date: string | null;
  status: TreatmentPlanStatus;
  notes: string;
  cumulative_dose: number;
  sessions_completed: number;
  dose_percentage: number;
  created_at: string;
  updated_at: string;
}

export async function fetchTreatmentPlans(params?: {
  patient?: number;
  status?: TreatmentPlanStatus | "all";
}): Promise<ApiTreatmentPlan[]> {
  const qs = new URLSearchParams();
  if (params?.patient) qs.set("patient", String(params.patient));
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  const query = qs.toString() ? `?${qs}&page_size=200` : "?page_size=200";
  const data = await apiFetch<Paginated<ApiTreatmentPlan>>(`/crm/treatment-plans/${query}`);
  return unwrap(data);
}

export async function fetchTreatmentPlan(id: number): Promise<ApiTreatmentPlan> {
  return apiFetch<ApiTreatmentPlan>(`/crm/treatment-plans/${id}/`);
}

export type TreatmentPlanWritePayload = {
  patient: number;
  name: string;
  diagnosis?: string;
  protocol?: string;
  total_sessions: number;
  dose_per_session: number;
  total_dose: number;
  start_date?: string | null;
  end_date?: string | null;
  status?: TreatmentPlanStatus;
  notes?: string;
};

export function createTreatmentPlan(
  payload: TreatmentPlanWritePayload,
): Promise<ApiTreatmentPlan> {
  return apiFetch<ApiTreatmentPlan>("/crm/treatment-plans/", {
    method: "POST",
    body: payload,
  });
}

export function updateTreatmentPlan(
  id: number,
  payload: Partial<TreatmentPlanWritePayload>,
): Promise<ApiTreatmentPlan> {
  return apiFetch<ApiTreatmentPlan>(`/crm/treatment-plans/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteTreatmentPlan(id: number): Promise<void> {
  return apiFetch<void>(`/crm/treatment-plans/${id}/`, { method: "DELETE" });
}

// ── Treatment Sessions ────────────────────────────────────────────────────────

export async function fetchTreatmentSessions(params?: {
  patient?: number;
  treatment_plan?: number;
  status?: TreatmentSessionStatus | "all";
}): Promise<ApiTreatmentSession[]> {
  const qs = new URLSearchParams();
  if (params?.patient) qs.set("patient", String(params.patient));
  if (params?.treatment_plan) qs.set("treatment_plan", String(params.treatment_plan));
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  const query = qs.toString() ? `?${qs}&page_size=200` : "?page_size=200";
  const data = await apiFetch<Paginated<ApiTreatmentSession>>(
    `/crm/treatment-sessions/${query}`,
  );
  return unwrap(data);
}

export type TreatmentSessionWritePayload = {
  patient: number;
  treatment_plan: number;
  session_number: number;
  scheduled_datetime: string;
  actual_datetime?: string | null;
  status?: TreatmentSessionStatus;
  machine?: number | null;
  room?: number | null;
  dose_delivered?: number;
  notes?: string;
  force?: boolean;
};

// Conflict detection types (US-TRT-04)
export type SessionConflict = {
  id: number;
  patient_name: string;
  scheduled_datetime: string;
  machine: string;
  room: string;
  conflict_type: "machine" | "room" | "machine_and_room";
};

export type ConflictWarning = {
  warning: "conflict";
  message: string;
  conflicts: SessionConflict[];
  alternative_slots: string[];
};

export type SessionMutationResult = ApiTreatmentSession | ConflictWarning;

export function isConflictWarning(r: SessionMutationResult): r is ConflictWarning {
  return (r as ConflictWarning).warning === "conflict";
}

export function createTreatmentSession(
  payload: TreatmentSessionWritePayload,
): Promise<SessionMutationResult> {
  return apiFetch<SessionMutationResult>("/crm/treatment-sessions/", {
    method: "POST",
    body: payload,
  });
}

export function updateTreatmentSession(
  id: number,
  payload: Partial<TreatmentSessionWritePayload>,
): Promise<SessionMutationResult> {
  return apiFetch<SessionMutationResult>(`/crm/treatment-sessions/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export async function fetchAvailableSlots(machine: number, date: string, count = 5): Promise<string[]> {
  const qs = new URLSearchParams({ machine: String(machine), date, count: String(count) });
  const data = await apiFetch<{ available_slots: string[] }>(
    `/crm/treatment-sessions/available-slots/?${qs}`,
  );
  return data.available_slots ?? [];
}

export function deleteTreatmentSession(id: number): Promise<void> {
  return apiFetch<void>(`/crm/treatment-sessions/${id}/`, { method: "DELETE" });
}

// ── Machines & Rooms ──────────────────────────────────────────────────────────

export async function fetchMachines(): Promise<ApiMachine[]> {
  const data = await apiFetch<Paginated<ApiMachine>>("/crm/machines/?page_size=200");
  return unwrap(data);
}

export async function createMachine(
  payload: Omit<ApiMachine, "id" | "created_at" | "updated_at">
): Promise<ApiMachine> {
  return apiFetch<ApiMachine>("/crm/machines/", {
    method: "POST",
    body: payload,
  });
}

export async function updateMachine(
  id: number,
  payload: Partial<Omit<ApiMachine, "id" | "created_at" | "updated_at">>
): Promise<ApiMachine> {
  return apiFetch<ApiMachine>(`/crm/machines/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteMachine(id: number): Promise<void> {
  await apiFetch<void>(`/crm/machines/${id}/`, {
    method: "DELETE",
  });
}

export async function fetchRooms(): Promise<ApiRoom[]> {
  const data = await apiFetch<Paginated<ApiRoom>>("/crm/rooms/?page_size=200");
  return unwrap(data);
}

export async function createRoom(
  payload: Omit<ApiRoom, "id" | "created_at" | "updated_at">
): Promise<ApiRoom> {
  return apiFetch<ApiRoom>("/crm/rooms/", {
    method: "POST",
    body: payload,
  });
}

export async function updateRoom(
  id: number,
  payload: Partial<Omit<ApiRoom, "id" | "created_at" | "updated_at">>
): Promise<ApiRoom> {
  return apiFetch<ApiRoom>(`/crm/rooms/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteRoom(id: number): Promise<void> {
  await apiFetch<void>(`/crm/rooms/${id}/`, {
    method: "DELETE",
  });
}