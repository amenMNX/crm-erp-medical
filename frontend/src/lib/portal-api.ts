import { apiFetch } from "@/lib/api";

export type PortalPriority = "Faible" | "Moyenne" | "Élevée" | "Critique";

export type PortalTicketSubmitPayload = {
  medical_record_number: string;
  last_name: string;
  titre: string;
  description: string;
  priorite?: PortalPriority;
};

export type PortalTicketSubmitResponse = {
  numero: string;
  message: string;
};

export type PortalTicketStatusPayload = {
  numero: string;
  medical_record_number: string;
};

export type PortalTicketStatusResponse = {
  numero: string;
  titre: string;
  statut: string;
  priorite: string;
  created_at: string;
  updated_at: string;
};

export type PortalComplaintSubmitPayload = {
  medical_record_number: string;
  last_name: string;
  description: string;
};

export type PortalComplaintSubmitResponse = {
  numero: string;
  message: string;
};

export type PortalComplaintStatusPayload = {
  numero: string;
  medical_record_number: string;
};

export type PortalComplaintStatusResponse = {
  numero: string;
  description: string;
  statut: string;
  created_at: string;
  resolved_at: string | null;
};

export function submitPortalComplaint(payload: PortalComplaintSubmitPayload) {
  return apiFetch<PortalComplaintSubmitResponse>("/crm/portal/complaints/submit/", {
    method: "POST",
    body: payload,
    token: null,
  });
}

export function checkPortalComplaintStatus(payload: PortalComplaintStatusPayload) {
  return apiFetch<PortalComplaintStatusResponse>("/crm/portal/complaints/status/", {
    method: "POST",
    body: payload,
    token: null,
  });
}

// These endpoints are unauthenticated (AllowAny on the backend) — pass
// token: null explicitly so apiFetch never attaches a stale Authorization
// header if this page is ever loaded in a browser that also has a staff
// session stored.
export function submitPortalTicket(payload: PortalTicketSubmitPayload) {
  return apiFetch<PortalTicketSubmitResponse>("/crm/portal/tickets/submit/", {
    method: "POST",
    body: payload,
    token: null,
  });
}

export function checkPortalTicketStatus(payload: PortalTicketStatusPayload) {
  return apiFetch<PortalTicketStatusResponse>("/crm/portal/tickets/status/", {
    method: "POST",
    body: payload,
    token: null,
  });
}
