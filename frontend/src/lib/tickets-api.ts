import { apiFetch } from "./api";
import type { TicketPriority, TicketStatus } from "./domain";

// Shape returned by the DRF ViewSets — see backend/apps/crm/serializers.py
export type ApiTicket = {
  id: number;
  numero: string;
  titre: string;
  description: string;
  priorite: TicketPriority;
  statut: TicketStatus;
  client: number;
  client_name: string;
  agents: number[];
  agent_details: { id: number; name: string }[];
  created_at: string;
  updated_at: string;
};

export type ApiPatient = {
  id: number;
  first_name: string;
  last_name: string;
};

export type ApiAgent = {
  id: number;
  name: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchTickets(): Promise<ApiTicket[]> {
  const data = await apiFetch<Paginated<ApiTicket>>("/crm/tickets/");
  return unwrap(data);
}

export type TicketWritePayload = {
  titre: string;
  description: string;
  priorite: TicketPriority;
  statut?: TicketStatus;
  client: number;
  agents: number[];
};

export function createTicket(payload: TicketWritePayload): Promise<ApiTicket> {
  return apiFetch<ApiTicket>("/crm/tickets/", { method: "POST", body: payload });
}

export function updateTicket(
  id: number,
  payload: Partial<TicketWritePayload>,
): Promise<ApiTicket> {
  return apiFetch<ApiTicket>(`/crm/tickets/${id}/`, { method: "PATCH", body: payload });
}

export function deleteTicket(id: number): Promise<void> {
  return apiFetch<void>(`/crm/tickets/${id}/`, { method: "DELETE" });
}

export async function fetchPatients(): Promise<ApiPatient[]> {
  const data = await apiFetch<Paginated<ApiPatient>>("/crm/patients/");
  return unwrap(data);
}

export async function fetchAgents(): Promise<ApiAgent[]> {
  const data = await apiFetch<Paginated<ApiAgent>>("/accounts/users/");
  const users = unwrap(data) as unknown as { id: number; username: string; first_name: string; last_name: string }[];
  return users.map((u) => ({
    id: u.id,
    name: `${u.first_name} ${u.last_name}`.trim() || u.username,
  }));
}

// ─── Ticket Comments / Interventions ────────────────────────────────────────

export type ApiTicketComment = {
  id: number;
  ticket: number;
  author: number | null;
  author_name: string;
  body: string;
  is_intervention: boolean;
  created_at: string;
  updated_at: string;
};

export type TicketCommentPayload = {
  body: string;
  is_intervention?: boolean;
};

export async function fetchTicketComments(ticketId: number): Promise<ApiTicketComment[]> {
  const data = await apiFetch<Paginated<ApiTicketComment>>(
    `/crm/tickets/${ticketId}/comments/`
  );
  return unwrap(data) as ApiTicketComment[];
}

export function createTicketComment(
  ticketId: number,
  payload: TicketCommentPayload
): Promise<ApiTicketComment> {
  return apiFetch<ApiTicketComment>(`/crm/tickets/${ticketId}/comments/`, {
    method: "POST",
    body: payload,
  });
}

export function deleteTicketComment(ticketId: number, commentId: number): Promise<void> {
  return apiFetch<void>(`/crm/tickets/${ticketId}/comments/${commentId}/`, {
    method: "DELETE",
  });
}