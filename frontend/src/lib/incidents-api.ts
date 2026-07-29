import { apiFetch } from "./api";
import type { TicketPriority, TicketStatus } from "./domain";

export type ApiIncident = {
  id: number;
  numero: string;
  titre: string;
  description: string;
  priorite: TicketPriority;
  statut: TicketStatus;
  patient: number | null;
  patient_name: string | null;
  equipment_or_location: string;
  reported_by: number | null;
  reported_by_name: string;
  agents: number[];
  agent_details: { id: number; name: string }[];
  created_at: string;
  updated_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchIncidents(): Promise<ApiIncident[]> {
  const data = await apiFetch<Paginated<ApiIncident>>("/crm/incidents/");
  return unwrap(data);
}

export type IncidentWritePayload = {
  titre: string;
  description: string;
  priorite: TicketPriority;
  statut?: TicketStatus;
  patient?: number | null;
  equipment_or_location?: string;
  agents: number[];
};

export function createIncident(payload: IncidentWritePayload): Promise<ApiIncident> {
  return apiFetch<ApiIncident>("/crm/incidents/", {
    method: "POST",
    body: payload,
  });
}

export function updateIncident(
  id: number,
  payload: Partial<IncidentWritePayload>,
): Promise<ApiIncident> {
  return apiFetch<ApiIncident>(`/crm/incidents/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteIncident(id: number): Promise<void> {
  return apiFetch<void>(`/crm/incidents/${id}/`, {
    method: "DELETE",
  });
}