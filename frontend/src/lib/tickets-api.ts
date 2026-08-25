import { apiFetch } from "./api";
import type { TicketPriority, TicketStatus } from "./domain";

// ── Types ────────────────────────────────────────────────────────────────────

export type SlaStatus = "ok" | "warning" | "breached" | "resolved";

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
  // SLA fields (added in Sprint 2)
  sla_deadline: string | null;
  sla_breached: boolean;
  sla_status: SlaStatus;
  sla_remaining_minutes: number | null;
  resolved_at: string | null;
  // S2: Archive fields
  is_archived: boolean;
  archived_at: string | null;
  archived_by: number | null;
  created_at: string;
  updated_at: string;
};

export type ApiSlaSummary = {
  open: number;
  breached: number;
  warning: number;
  by_priority: Partial<Record<TicketPriority, number>>;
  breach_rate_30d: number;
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

// ── Ticket CRUD ──────────────────────────────────────────────────────────────

export async function fetchTickets(params?: {
  statut?: TicketStatus;
  priorite?: TicketPriority;
  sla_breached?: boolean;
  search?: string;
  ordering?: string;
}): Promise<ApiTicket[]> {
  const qs = new URLSearchParams();
  if (params?.statut)       qs.set("statut", params.statut);
  if (params?.priorite)     qs.set("priorite", params.priorite);
  if (params?.sla_breached !== undefined) qs.set("sla_breached", String(params.sla_breached));
  if (params?.search)       qs.set("search", params.search);
  if (params?.ordering)     qs.set("ordering", params.ordering);
  const query = qs.toString() ? `?${qs}` : "";
  const data = await apiFetch<Paginated<ApiTicket>>(`/crm/tickets/${query}`);
  return unwrap(data);
}

export async function fetchSlaSummary(): Promise<ApiSlaSummary> {
  return apiFetch<ApiSlaSummary>("/crm/tickets/sla-summary/");
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

// ── Supporting data ──────────────────────────────────────────────────────────

export async function fetchPatients(): Promise<ApiPatient[]> {
  const data = await apiFetch<Paginated<ApiPatient>>("/crm/patients/");
  return unwrap(data);
}

export async function fetchAgents(): Promise<ApiAgent[]> {
  const data = await apiFetch<Paginated<{ id: number; username: string; first_name: string; last_name: string }>>("/accounts/users/");
  const users = unwrap(data);
  return users.map((u) => ({
    id: u.id,
    name: `${u.first_name} ${u.last_name}`.trim() || u.username,
  }));
}

// ── Comments ─────────────────────────────────────────────────────────────────

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
    `/crm/tickets/${ticketId}/comments/`,
  );
  return unwrap(data) as ApiTicketComment[];
}

export function createTicketComment(
  ticketId: number,
  payload: TicketCommentPayload,
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

// ── SLA helpers (used by both the board and the dashboard) ───────────────────

/** Format minutes remaining as a readable string. */
export function formatSlaRemaining(minutes: number | null): string {
  if (minutes === null) return "";
  if (minutes < 0) {
    const abs = Math.abs(minutes);
    if (abs < 60) return `${abs}m overdue`;
    if (abs < 1440) return `${Math.floor(abs / 60)}h overdue`;
    return `${Math.floor(abs / 1440)}d overdue`;
  }
  if (minutes < 60) return `${minutes}m left`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h left`;
  return `${Math.floor(minutes / 1440)}d left`;
}
// ── S2: Archive ───────────────────────────────────────────────────────────────

export function archiveTicket(id: number): Promise<{ status: string; ticket: string }> {
  return apiFetch(`/crm/tickets/${id}/archive/`, { method: "POST" });
}

export function unarchiveTicket(id: number): Promise<{ status: string; ticket: string }> {
  return apiFetch(`/crm/tickets/${id}/unarchive/`, { method: "POST" });
}
