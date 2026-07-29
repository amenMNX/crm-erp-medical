import { apiFetch } from "./api";

export type ApiMessage = {
  id: number;
  sender: number;
  sender_name: string;
  recipient: number;
  recipient_name: string;
  body: string;
  is_read: boolean;
  created_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchMessages(): Promise<ApiMessage[]> {
  const data = await apiFetch<Paginated<ApiMessage>>("/messages/");
  return unwrap(data);
}

export function sendMessage(recipient: number, body: string): Promise<ApiMessage> {
  return apiFetch<ApiMessage>("/messages/", {
    method: "POST",
    body: { recipient, body },
  });
}

export function markMessageRead(id: number): Promise<ApiMessage> {
  return apiFetch<ApiMessage>(`/messages/${id}/`, {
    method: "PATCH",
    body: { is_read: true },
  });
}
