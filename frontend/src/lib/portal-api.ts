// -----------------------------------------------------------------------------
// Public patient-portal API helpers
// -----------------------------------------------------------------------------
// These endpoints are AllowAny on the backend — no authentication is required.
// We use a dedicated portalFetch() instead of apiFetch() so that a 4xx response
// never triggers the 401→refresh→redirect cycle in api.ts.
//
// IMPORTANT: credentials: "include" is kept so Django can read the csrftoken
// cookie it set on the page load. Without it, Django rejects POST requests
// with a CSRF failure before they even reach the view.
// -----------------------------------------------------------------------------

import { ApiError } from "@/lib/api";

function getApiBaseUrl(): string {
  if (typeof window === "undefined") return "/api";
  const { hostname } = window.location;
  if (
    hostname.includes("ngrok-free.app") ||
    hostname.includes("ngrok.io") ||
    (hostname !== "localhost" && hostname !== "127.0.0.1")
  ) {
    return "/api";
  }
  return import.meta.env.VITE_API_BASE_URL ?? "/api";
}

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  for (const cookie of document.cookie.split(";")) {
    const [name, value] = cookie.trim().split("=");
    if (name === "csrftoken") return value;
  }
  return null;
}

function parseErrorMessage(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const p = data as Record<string, unknown>;
    if (typeof p.detail === "string") return p.detail;
    if (typeof p.non_field_errors === "string") return p.non_field_errors;
    if (Array.isArray(p.non_field_errors)) return p.non_field_errors.join(" ");
    for (const [field, value] of Object.entries(p)) {
      if (Array.isArray(value) && typeof value[0] === "string")
        return `${field}: ${value[0]}`;
      if (typeof value === "string") return `${field}: ${value}`;
    }
  }
  return "API request failed.";
}

/**
 * Fetch wrapper for unauthenticated portal endpoints.
 *
 * Differences from apiFetch():
 *  - On any error, throws immediately — no token refresh, no redirect to /signin
 *  - credentials: "include" so Django can validate the CSRF cookie on POST
 */
async function portalFetch<T>(path: string, body: unknown): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;

  const headers = new Headers({ "Content-Type": "application/json" });
  const csrfToken = getCsrfToken();
  if (csrfToken) headers.set("X-CSRFToken", csrfToken);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      credentials: "include", // needed for Django CSRF cookie validation
      body: JSON.stringify(body),
    });
  } catch {
    // Network-level failure (offline, DNS, etc.)
    throw new ApiError(
      "Impossible de contacter le serveur. Vérifiez votre connexion.",
      0,
      null,
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new ApiError(parseErrorMessage(data), response.status, data);
  }

  return data as T;
}

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Public API functions ─────────────────────────────────────────────────────

export function submitPortalTicket(payload: PortalTicketSubmitPayload) {
  return portalFetch<PortalTicketSubmitResponse>(
    "/crm/portal/tickets/submit/",
    payload,
  );
}

export function checkPortalTicketStatus(payload: PortalTicketStatusPayload) {
  return portalFetch<PortalTicketStatusResponse>(
    "/crm/portal/tickets/status/",
    payload,
  );
}

export function submitPortalComplaint(payload: PortalComplaintSubmitPayload) {
  return portalFetch<PortalComplaintSubmitResponse>(
    "/crm/portal/complaints/submit/",
    payload,
  );
}

export function checkPortalComplaintStatus(
  payload: PortalComplaintStatusPayload,
) {
  return portalFetch<PortalComplaintStatusResponse>(
    "/crm/portal/complaints/status/",
    payload,
  );
}