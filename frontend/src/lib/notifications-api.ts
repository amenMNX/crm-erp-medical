import { apiFetch } from "./api";

export type NotificationLevel = "info" | "success" | "warning" | "error";

export type ApiNotification = {
  id: number;
  title: string;
  body: string;
  level: NotificationLevel;
  is_read: boolean;
  created_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchNotifications(): Promise<ApiNotification[]> {
  const data = await apiFetch<Paginated<ApiNotification>>("/notifications/");
  return unwrap(data);
}

export function markNotificationRead(id: number): Promise<ApiNotification> {
  return apiFetch<ApiNotification>(`/notifications/${id}/`, {
    method: "PATCH",
    body: { is_read: true },
  });
}

export function markAllNotificationsRead(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/notifications/mark-all-read/", { method: "POST" });
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const data = await apiFetch<{ count: number }>("/notifications/unread-count/");
  return data.count;
}
