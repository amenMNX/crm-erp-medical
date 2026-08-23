const PORTAL_BASE = "/api/crm/portal";

async function portalFetch<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
  } = {}
): Promise<T> {
  const { method = "GET", body } = options;
  const res = await fetch(`${PORTAL_BASE}${path}`, {
    method,
    credentials: "include", // cookie HttpOnly session
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg =
      data?.detail ||
      data?.non_field_errors?.[0] ||
      Object.values(data ?? {})?.[0] ||
      "Erreur serveur.";
    throw new Error(String(msg));
  }
  return data as T;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PortalPatient {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  date_of_birth: string;
  medical_record_number: string;
}

export interface PortalAccount {
  email: string;
  notify_email: boolean;
  notify_sms: boolean;
  last_login: string | null;
  is_active: boolean;
}

export interface PortalAppointment {
  id: number;
  date: string;
  status: "scheduled" | "confirmed" | "cancelled" | "done";
  type: string;
  duration_minutes: number;
  doctor_name: string | null;
  room_name: string | null;
  notes: string;
}

export interface PortalSession {
  id: number;
  session_number: number;
  scheduled_date: string;
  status: string;
  dose_delivered_gy: number | null;
  machine_name: string | null;
  notes: string;
}

export interface PortalTreatmentPlan {
  id: number;
  diagnosis: string;
  status: string;
  total_dose_gy: number;
  number_of_fractions: number;
  start_date: string | null;
  end_date: string | null;
  sessions: PortalSession[];
  progress_pct: number;
}

export interface PortalMessage {
  id: number;
  direction: "patient_to_staff" | "staff_to_patient";
  subject: string;
  content: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  sender_name: string;
}

export interface PortalRating {
  id: number;
  score: number;
  comment: string;
  treatment_session: number | null;
  created_at: string;
}

export interface PatientDocument {
  id: number;
  document_type: "compte_rendu" | "ordonnance" | "imagerie" | "protocole" | "facture" | "autre";
  title: string;
  file_path: string;
  file_size_kb: number;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface PortalDashboard {
  patient: PortalPatient;
  upcoming_appointments: PortalAppointment[];
  active_treatment: PortalTreatmentPlan | null;
  unread_messages: number;
  unpaid_invoices_count: number;
  unpaid_invoices_total: string;
}

export interface PortalAuthUser {
  patient_id: number;
  patient_name: string;
  mrn: string;
  email: string;
  authenticated?: boolean;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const portalLogin = (last_name: string, cin: string, medical_record_number: string) =>
  portalFetch<PortalAuthUser>("/auth/login/", {
    method: "POST",
    body: { last_name, cin, medical_record_number },
  });

export const portalLogout = () =>
  portalFetch<{ detail: string }>("/auth/logout/", { method: "POST" });

export const portalMe = () =>
  portalFetch<PortalAuthUser & { authenticated: boolean }>("/auth/me/");

export const portalChangePassword = (
  current_password: string,
  new_password: string,
  confirm_password: string
) =>
  portalFetch<{ detail: string }>("/auth/change-password/", {
    method: "POST",
    body: { current_password, new_password, confirm_password },
  });

export const portalResetPasswordRequest = (email: string) =>
  portalFetch<{ detail: string }>("/auth/reset-password/", { method: "POST", body: { email } });

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const portalDashboard = () =>
  portalFetch<PortalDashboard>("/dashboard/");

// ─── Historique Médical ───────────────────────────────────────────────────────

export const portalMedicalHistory = (filter: "6m" | "1y" | "all" = "all") =>
  portalFetch<PortalTreatmentPlan[]>(`/medical-history/?filter=${filter}`);

export const portalAppointments = (filter: "6m" | "1y" | "all" = "all", upcoming = false) =>
  portalFetch<PortalAppointment[]>(`/appointments/?filter=${filter}&upcoming=${upcoming}`);

// ─── Documents ────────────────────────────────────────────────────────────────

export const portalDocuments = (type?: string) =>
  portalFetch<PatientDocument[]>(`/documents/${type ? `?type=${type}` : ""}`);

// ─── Messages ─────────────────────────────────────────────────────────────────

export const portalMessages = () =>
  portalFetch<PortalMessage[]>("/messages/");

export const portalSendMessage = (subject: string, content: string) =>
  portalFetch<PortalMessage>("/messages/", { method: "POST", body: { subject, content } });

export const portalUnreadCount = () =>
  portalFetch<{ unread: number }>("/messages/unread-count/");

// ─── Notation ─────────────────────────────────────────────────────────────────

export const portalSubmitRating = (score: number, comment: string, treatment_session?: number) =>
  portalFetch<PortalRating>("/rating/", {
    method: "POST",
    body: { score, comment, treatment_session },
  });

export const portalGetRatings = () =>
  portalFetch<PortalRating[]>("/rating/");

// ─── Profil ───────────────────────────────────────────────────────────────────

export const portalGetProfile = () =>
  portalFetch<{ patient: PortalPatient; account: PortalAccount }>("/profile/");

export const portalUpdateProfile = (
  patient: Partial<PortalPatient>,
  account: Partial<PortalAccount>
) =>
  portalFetch<{ patient: PortalPatient; account: PortalAccount }>("/profile/", {
    method: "PATCH",
    body: { patient, account },
  });
