import { apiFetch } from "./api";

export type ShiftStatus = "planned" | "confirmed" | "cancelled";

export type ApiShift = {
  id: number;
  employee: number;
  employee_name: string;
  title: string;
  start_datetime: string;
  end_datetime: string;
  location: string;
  status: ShiftStatus;
  notes: string;
  created_at: string;
  updated_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchShifts(): Promise<ApiShift[]> {
  const data = await apiFetch<Paginated<ApiShift>>("/hr/shifts/");
  return unwrap(data);
}

export type ShiftWritePayload = {
  employee: number;
  title: string;
  start_datetime: string;
  end_datetime: string;
  location?: string;
  status?: ShiftStatus;
  notes?: string;
};

export function createShift(payload: ShiftWritePayload): Promise<ApiShift> {
  return apiFetch<ApiShift>("/hr/shifts/", {
    method: "POST",
    body: payload,
  });
}

export function updateShift(id: number, payload: Partial<ShiftWritePayload>): Promise<ApiShift> {
  return apiFetch<ApiShift>(`/hr/shifts/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteShift(id: number): Promise<void> {
  return apiFetch<void>(`/hr/shifts/${id}/`, {
    method: "DELETE",
  });
}