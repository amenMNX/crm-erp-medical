import { apiFetch } from "./api";

export type LeaveStatus = "En attente" | "Acceptée" | "Refusée";

export type ApiLeaveRequest = {
  id: number;
  employee: number;
  employee_name: string;
  date_debut: string;
  date_fin: string;
  motif: string;
  statut: LeaveStatus;
  notes: string;
  duration_days: number;
  employee_leave_credit_days: string;
  employee_leave_days_remaining: number;
  approved_by: number | null;
  approved_by_name: string | null;
  created_at: string;
  updated_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchLeaveRequests(): Promise<ApiLeaveRequest[]> {
  const data = await apiFetch<Paginated<ApiLeaveRequest>>("/hr/leave-requests/");
  return unwrap(data);
}

export type LeaveRequestWritePayload = {
  employee: number;
  date_debut: string;
  date_fin: string;
  motif?: string;
  statut?: LeaveStatus;
  notes?: string;
};

export function createLeaveRequest(
  payload: LeaveRequestWritePayload,
): Promise<ApiLeaveRequest> {
  return apiFetch<ApiLeaveRequest>("/hr/leave-requests/", {
    method: "POST",
    body: payload,
  });
}

export function updateLeaveRequest(
  id: number,
  payload: Partial<LeaveRequestWritePayload>,
): Promise<ApiLeaveRequest> {
  return apiFetch<ApiLeaveRequest>(`/hr/leave-requests/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function approveLeaveRequest(id: number): Promise<ApiLeaveRequest> {
  return apiFetch<ApiLeaveRequest>(`/hr/leave-requests/${id}/approve/`, {
    method: "POST",
  });
}

export function rejectLeaveRequest(id: number): Promise<ApiLeaveRequest> {
  return apiFetch<ApiLeaveRequest>(`/hr/leave-requests/${id}/reject/`, {
    method: "POST",
  });
}
