import { apiFetch } from "./api";
import type { ComplaintStatus } from "./domain";

export type ApiComplaint = {
  id: number;
  description: string;
  statut: ComplaintStatus;
  client: number;
  client_name: string;
  created_at: string;
  resolved_at: string | null;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchComplaints(): Promise<ApiComplaint[]> {
  const data = await apiFetch<Paginated<ApiComplaint>>("/crm/complaints/");
  return unwrap(data);
}

export type ComplaintWritePayload = {
  description: string;
  statut?: ComplaintStatus;
  client: number;
};

export function createComplaint(payload: ComplaintWritePayload): Promise<ApiComplaint> {
  return apiFetch<ApiComplaint>("/crm/complaints/", {
    method: "POST",
    body: payload,
  });
}

export function updateComplaint(
  id: number,
  payload: Partial<ComplaintWritePayload>,
): Promise<ApiComplaint> {
  return apiFetch<ApiComplaint>(`/crm/complaints/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}