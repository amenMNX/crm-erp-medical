import { apiFetch } from "./api";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "login_failed"
  | "logout";

export type ApiAuditLogEntry = {
  id: number;
  model_name: string | null;
  object_id: string | null;
  object_repr: string;
  action: AuditAction;
  action_display: string;
  actor: number | null;
  actor_username: string | null;
  changes: Record<string, unknown>;
  created_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchAuditLog(): Promise<ApiAuditLogEntry[]> {
  const data = await apiFetch<Paginated<ApiAuditLogEntry>>("/audit/log/");
  return unwrap(data);
}
