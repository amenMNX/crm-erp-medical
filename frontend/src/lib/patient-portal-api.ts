import { apiFetch } from "./api";

// ─── Internal fetch wrapper for portal endpoints ──────────────────────────────
// Uses apiFetch (which handles base URL, CSRF, cookies, token refresh)
// instead of raw fetch, so ngrok / proxy / env vars all work automatically.

async function portalFetch<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
  } = {}
): Promise<T> {
  const { method = "GET", body } = options;
  // All portal routes live under /api/crm/portal/...
  return apiFetch<T>(`/crm/portal${path}`, { method, body });
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

// ─── RDV en ligne — Types (US-PAT-05) ────────────────────────────────────────

/** Un médecin retourné par GET /portal/doctors/ */
export interface PortalDoctor {
  id: number;
  first_name: string;
  last_name: string;
  /** Prénom + Nom avec "Dr." préfixé, ex: "Dr. Sami Ben Ali" */
  full_name: string;
  /** Spécialité / département (peut être vide) */
  specialty: string;
  /** false = aucune disponibilité configurée → bouton désactivé dans le wizard */
  has_availability: boolean;
}

/** Un créneau libre retourné par GET /portal/doctors/<id>/slots/ */
export interface PortalSlot {
  /** ISO 8601 avec timezone, ex: "2026-09-01T09:00:00+01:00" */
  datetime: string;
  /** YYYY-MM-DD pour grouper par jour */
  date: string;
  /** HH:MM pour affichage, ex: "09:00" */
  time: string;
  duration_minutes: number;
}

/** Réponse complète de GET /portal/doctors/<id>/slots/ */
export interface PortalSlotsResponse {
  slots: PortalSlot[];
  doctor_id: number;
  doctor_name: string;
  appointment_type: string;
  duration_minutes: number;
}

/** Réponse de POST /portal/appointments/book/ */
export interface PortalBookingResult {
  appointment_id: number;
  appointment_date: string;
  status: string;
  duration_minutes: number;
  confirmation_token: string;
  message: string;
}

/** Les 4 types de RDV acceptés par le backend */
export type AppointmentType = "simple" | "complex" | "followup" | "urgency" | "operation";

/** Labels affichés dans le wizard (clé = valeur envoyée au backend) */
export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  simple:    "Consultation simple (15 min)",
  complex:   "Consultation complexe (30 min)",
  followup:  "Suivi traitement (45 min)",
  urgency:   "Urgence (30 min)",
  operation: "Opération chirurgicale (durée personnalisée)",
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const portalLogin = (
  last_name: string,
  cin: string,
  medical_record_number: string,
  password?: string
) =>
  portalFetch<PortalAuthUser | { detail: string }>("/auth/login/", {
    method: "POST",
    body: { last_name, cin, medical_record_number, ...(password ? { password } : {}) },
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

// ─── RDV en ligne (US-PAT-05) ────────────────────────────────────────────────

/**
 * GET /api/crm/portal/doctors/
 * Liste les médecins acceptant des RDV en ligne.
 * `has_availability: false` → afficher comme "Complet" (non sélectionnable).
 */
export const portalListDoctors = () =>
  portalFetch<PortalDoctor[]>("/doctors/");

/**
 * GET /api/crm/portal/doctors/<doctorId>/slots/?type=<appointmentType>
 * Créneaux libres sur les 14 prochains jours (j+2 à j+16).
 * Les créneaux respectent les disponibilités hebdomadaires du médecin
 * et excluent les créneaux déjà réservés.
 */
export const portalGetDoctorSlots = (
  doctorId: number,
  appointmentType: AppointmentType = "simple"
) =>
  portalFetch<PortalSlotsResponse>(
    `/doctors/${doctorId}/slots/?type=${appointmentType}`
  );

/**
 * POST /api/crm/portal/appointments/book/
 * Prend un rendez-vous. Le backend vérifie que le créneau est toujours libre
 * au moment de la réservation (protection contre les doubles réservations).
 * Retourne 409 si le créneau a été pris entre-temps.
 */
export const portalBookAppointment = (payload: {
  doctor_id: number;
  slot_datetime: string;       // ISO 8601
  appointment_type: AppointmentType;
  reason: string;
  duration_minutes?: number;   // for operation type — custom duration
}) =>
  portalFetch<PortalBookingResult>("/appointments/book/", {
    method: "POST",
    body: payload,
  });

/**
 * POST /api/crm/portal/appointments/<appointmentId>/cancel/
 * Annule un RDV du patient connecté.
 * Seuls les statuts "scheduled" et "confirmed" sont annulables (400 sinon).
 */
export const portalCancelAppointment = (appointmentId: number) =>
  portalFetch<{ detail: string; appointment_id: number }>(
    `/appointments/${appointmentId}/cancel/`,
    { method: "POST" }
  );

// ─── Factures ─────────────────────────────────────────────────────────────────

export interface PortalInvoiceLineItem {
  description: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
  line_total: string;
}

export interface PortalInvoice {
  id: number;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  status: "issued" | "paid" | "cancelled";
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  paid_amount: string;
  balance_due: string;
  days_overdue: number;
  notes: string;
  line_items: PortalInvoiceLineItem[];
}

export const portalInvoices = () =>
  portalFetch<PortalInvoice[]>("/invoices/");

/** Returns the URL for downloading the PDF — open in new tab or anchor download */
export const portalInvoicePdfUrl = (invoiceId: number): string => {
  // Build the full URL using the same base as apiFetch
  const base = (window as unknown as { __API_BASE__?: string }).__API_BASE__
    ?? import.meta.env?.VITE_API_URL
    ?? "/api";
  return `${base}/crm/portal/invoices/${invoiceId}/pdf/`;
};