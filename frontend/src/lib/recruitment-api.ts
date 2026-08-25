import { apiFetch } from "./api";

export type JobStatus = "draft" | "published" | "closed" | "cancelled";
export type AppStatus = "pending" | "reviewing" | "interview" | "offer" | "accepted" | "rejected" | "withdrawn";

export type ApiJobPost = {
  id: number; title: string; department: string;
  contract_type: string; contract_type_display: string;
  experience_level: string; experience_level_display: string;
  location: string; description: string; requirements: string;
  benefits: string; responsibilities: string;
  posted_at: string | null; closing_date: string | null; start_date: string | null;
  status: JobStatus; status_display: string; is_internal: boolean;
  application_count: number; created_by: number | null; created_by_name: string;
  created_at: string; updated_at: string;
};

export type ApiApplication = {
  id: number; job_post: number; job_title: string;
  candidate: number | null; candidate_name: string | null;
  referred_by: number | null; referred_by_name: string | null;
  status: AppStatus; status_display: string; source: string; source_display: string;
  first_name: string; last_name: string; email: string; phone: string;
  cover_letter_text: string; rating: string | null; interview_notes: string; feedback: string;
  applied_at: string; interview_date: string | null; created_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];
const unwrap = <T>(d: Paginated<T>): T[] => (Array.isArray(d) ? d : d.results);

export async function fetchJobPosts(): Promise<ApiJobPost[]> {
  return unwrap(await apiFetch<Paginated<ApiJobPost>>("/hr/job-posts/"));
}

export type JobPostPayload = {
  title: string; department?: string; contract_type: string; experience_level: string;
  location?: string; description: string; requirements: string;
  benefits?: string; responsibilities?: string;
  closing_date?: string; start_date?: string; is_internal?: boolean;
};

export function createJobPost(payload: JobPostPayload): Promise<ApiJobPost> {
  return apiFetch<ApiJobPost>("/hr/job-posts/", { method: "POST", body: payload });
}

export function publishJobPost(id: number): Promise<ApiJobPost> {
  return apiFetch<ApiJobPost>(`/hr/job-posts/${id}/publish/`, { method: "POST" });
}

export async function fetchApplications(): Promise<ApiApplication[]> {
  return unwrap(await apiFetch<Paginated<ApiApplication>>("/hr/applications/"));
}

export type ApplicationPayload = {
  job_post: number; first_name: string; last_name: string;
  email: string; phone?: string; cover_letter_text?: string;
};

export function createApplication(payload: ApplicationPayload): Promise<ApiApplication> {
  return apiFetch<ApiApplication>("/hr/applications/", { method: "POST", body: payload });
}

export function advanceToInterview(id: number, interview_date?: string): Promise<ApiApplication> {
  return apiFetch<ApiApplication>(`/hr/applications/${id}/advance-to-interview/`, { method: "POST", body: { interview_date } });
}

export function sendOffer(id: number): Promise<ApiApplication> {
  return apiFetch<ApiApplication>(`/hr/applications/${id}/send-offer/`, { method: "POST" });
}

export function acceptApplication(id: number): Promise<ApiApplication> {
  return apiFetch<ApiApplication>(`/hr/applications/${id}/accept/`, { method: "POST" });
}

export function rejectApplication(id: number, reason?: string): Promise<ApiApplication> {
  return apiFetch<ApiApplication>(`/hr/applications/${id}/reject/`, { method: "POST", body: { reason } });
}
