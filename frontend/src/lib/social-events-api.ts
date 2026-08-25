import { apiFetch } from "./api";

export type EventStatus = "planned" | "ongoing" | "completed" | "cancelled";
export type EventType = "team_building" | "anniversary" | "marriage" | "birth" | "circumcision" | "bac_success" | "promotion" | "retirement" | "holiday" | "other";

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  team_building: "Team Building", anniversary: "Anniversaire", marriage: "Mariage",
  birth: "Naissance", circumcision: "Circoncision", bac_success: "Réussite Bac",
  promotion: "Promotion", retirement: "Départ à la retraite", holiday: "Fête", other: "Autre",
};

export type ApiSocialEvent = {
  id: number; title: string; event_type: EventType; event_type_display: string;
  description: string; event_date: string; start_time: string | null; end_time: string | null;
  location: string; participants: number[]; participants_list: string[];
  participant_count: number; max_participants: number; is_full: boolean;
  organized_by: number | null; organized_by_name: string; budget: string;
  status: EventStatus; status_display: string; created_at: string;
};

export type ApiRecognition = {
  id: number; employee: number; employee_name: string;
  awarded_by: number | null; awarded_by_name: string;
  recognition_type: string; recognition_type_display: string;
  title: string; description: string; awarded_at: string;
};

export type ApiBirthday = {
  id: number; employee: number; employee_name: string;
  birth_date: string; next_birthday: string; age: number; notify_team: boolean;
};

type Paginated<T> = { results: T[]; count: number } | T[];
const unwrap = <T>(d: Paginated<T>): T[] => (Array.isArray(d) ? d : d.results);

export async function fetchSocialEvents(): Promise<ApiSocialEvent[]> {
  return unwrap(await apiFetch<Paginated<ApiSocialEvent>>("/hr/social-events/"));
}

export type SocialEventPayload = {
  title: string; event_type: EventType; description?: string; event_date: string;
  start_time?: string; end_time?: string; location?: string;
  budget?: number; max_participants?: number; status?: EventStatus;
};

export function createSocialEvent(payload: SocialEventPayload): Promise<ApiSocialEvent> {
  return apiFetch<ApiSocialEvent>("/hr/social-events/", { method: "POST", body: payload });
}

export function registerForEvent(id: number): Promise<ApiSocialEvent> {
  return apiFetch<ApiSocialEvent>(`/hr/social-events/${id}/register/`, { method: "POST" });
}

export function unregisterFromEvent(id: number): Promise<ApiSocialEvent> {
  return apiFetch<ApiSocialEvent>(`/hr/social-events/${id}/unregister/`, { method: "POST" });
}

export async function fetchUpcomingBirthdays(): Promise<ApiBirthday[]> {
  return unwrap(await apiFetch<Paginated<ApiBirthday>>("/hr/birthdays/upcoming/"));
}

export async function fetchTodayBirthdays(): Promise<ApiBirthday[]> {
  return unwrap(await apiFetch<Paginated<ApiBirthday>>("/hr/birthdays/today/"));
}

export async function fetchRecognitions(): Promise<ApiRecognition[]> {
  return unwrap(await apiFetch<Paginated<ApiRecognition>>("/hr/recognitions/"));
}

export type RecognitionPayload = { employee: number; recognition_type: string; title: string; description: string };

export function createRecognition(payload: RecognitionPayload): Promise<ApiRecognition> {
  return apiFetch<ApiRecognition>("/hr/recognitions/", { method: "POST", body: payload });
}
