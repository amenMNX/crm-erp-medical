import { apiFetch } from "./api";

export type DocRequestStatus = "En attente" | "En cours" | "Prêt" | "Refusé";

export type DocRequestType =
  | "attestation_travail"
  | "certificat_salaire"
  | "bulletin_paie"
  | "solde_tout_compte"
  | "attestation_conge"
  | "autre";

export const DOC_TYPE_LABELS: Record<DocRequestType, string> = {
  attestation_travail: "Attestation de travail",
  certificat_salaire:  "Certificat de salaire",
  bulletin_paie:       "Copie bulletin de paie",
  solde_tout_compte:   "Solde de tout compte",
  attestation_conge:   "Attestation de congé",
  autre:               "Autre",
};

export type ApiDocumentRequest = {
  id: number;
  employee: number;
  employee_name: string;
  document_type: DocRequestType;
  document_type_display: string;
  motif: string;
  statut: DocRequestStatus;
  notes_rh: string;
  handled_by: number | null;
  handled_by_name: string | null;
  created_at: string;
  updated_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];
const unwrap = <T>(d: Paginated<T>): T[] => (Array.isArray(d) ? d : d.results);

export async function fetchDocumentRequests(): Promise<ApiDocumentRequest[]> {
  return unwrap(await apiFetch<Paginated<ApiDocumentRequest>>("/hr/document-requests/"));
}

export type DocRequestPayload = {
  employee: number;
  document_type: DocRequestType;
  motif?: string;
};

export function createDocumentRequest(payload: DocRequestPayload): Promise<ApiDocumentRequest> {
  return apiFetch<ApiDocumentRequest>("/hr/document-requests/", { method: "POST", body: payload });
}

export function updateDocumentRequest(id: number, payload: { statut?: DocRequestStatus; notes_rh?: string }): Promise<ApiDocumentRequest> {
  return apiFetch<ApiDocumentRequest>(`/hr/document-requests/${id}/`, { method: "PATCH", body: payload });
}

export function markDocumentReady(id: number): Promise<ApiDocumentRequest> {
  return apiFetch<ApiDocumentRequest>(`/hr/document-requests/${id}/mark-ready/`, { method: "POST" });
}

export function markDocumentRefused(id: number): Promise<ApiDocumentRequest> {
  return apiFetch<ApiDocumentRequest>(`/hr/document-requests/${id}/mark-refused/`, { method: "POST" });
}
