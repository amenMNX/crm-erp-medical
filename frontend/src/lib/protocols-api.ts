// src/lib/protocols-api.ts
// US-TRT-05 — Protocoles de Traitement : lib API complète
// Étend treatments-api.ts sans le modifier.

import { apiFetch } from "./api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProtocolStatus = "draft" | "pending" | "approved" | "archived";
export type RadiationType  = "photon" | "electron" | "proton" | "neutron" | "brachytherapy";
export type FractionInterval = "daily" | "twice_daily" | "weekly" | "custom";

export const RADIATION_LABELS: Record<RadiationType, string> = {
  photon:        "Photons X",
  electron:      "Électrons",
  proton:        "Protons",
  neutron:       "Neutrons",
  brachytherapy: "Curiethérapie",
};

export const INTERVAL_LABELS: Record<FractionInterval, string> = {
  daily:       "Quotidien (5j/semaine)",
  twice_daily: "2x/jour",
  weekly:      "Hebdomadaire",
  custom:      "Personnalisé",
};

export const STATUS_LABELS: Record<ProtocolStatus, string> = {
  draft:    "Brouillon",
  pending:  "En attente",
  approved: "Approuvé",
  archived: "Archivé",
};

export const STATUS_COLORS: Record<ProtocolStatus, string> = {
  draft:    "bg-gray-100 text-gray-600",
  pending:  "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  archived: "bg-slate-100 text-slate-500",
};

export interface ProtocolChangeLog {
  id: number;
  action: string;
  performed_by_name: string;
  changes: Record<string, { from: string; to: string }>;
  comment: string;
  created_at: string;
}

export interface TreatmentProtocol {
  id: number;
  name: string;
  version: number;
  parent: number | null;
  icd10_code: string;
  icd10_label: string;
  cancer_type: string;
  radiation_type: RadiationType;
  total_dose_gy: string;
  dose_per_fraction_gy: string;
  number_of_fractions: number;
  fraction_interval: FractionInterval;
  total_duration_days: number;
  international_reference: string;
  description: string;
  preparation_instructions: string;
  contraindications: string;
  status: ProtocolStatus;
  created_by: number | null;
  created_by_name: string | null;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  computed_total_dose: string;
  computed_duration_days: number;
  changelog: ProtocolChangeLog[];
  versions_count: number;
}

export interface TreatmentProtocolList {
  id: number;
  name: string;
  version: number;
  icd10_code: string;
  cancer_type: string;
  radiation_type: RadiationType;
  total_dose_gy: string;
  dose_per_fraction_gy: string;
  number_of_fractions: number;
  status: ProtocolStatus;
  approved_at: string | null;
  created_at: string;
}

export interface ProtocolAssignment {
  id: number;
  treatment_plan: number;
  protocol: number;
  protocol_name: string;
  protocol_status: ProtocolStatus;
  assigned_by_name: string | null;
  assigned_at: string;
  prescribed_total_dose_gy: string | null;
  prescribed_dose_per_fraction_gy: string | null;
  prescribed_fractions: number | null;
  notes: string;
}

export interface DoseDeviationResult {
  id: number;
  treatment_session: number;
  session_date: string | null;
  prescribed_dose_gy: string;
  delivered_dose_gy: string;
  deviation_pct: string;
  severity: "warning" | "critical";
  justification: string;
  justified_by_name: string | null;
  justified_at: string | null;
  is_acknowledged: boolean;
  created_at: string;
}

export interface DoseCheckResponse {
  alert: boolean;
  severity?: "warning" | "critical";
  deviation_pct: string;
  message: string;
  requires_justification?: boolean;
  deviation_id?: number;
}

export interface CompareRow {
  field: string;
  label: string;
  values: Record<number, string>;
  has_difference: boolean;
}

export interface CompareResponse {
  protocols: TreatmentProtocolList[];
  comparison: CompareRow[];
}

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export type ProtocolWritePayload = {
  name: string;
  icd10_code?: string;
  icd10_label?: string;
  cancer_type?: string;
  radiation_type: RadiationType;
  total_dose_gy: number;
  dose_per_fraction_gy: number;
  number_of_fractions: number;
  fraction_interval: FractionInterval;
  international_reference?: string;
  description?: string;
  preparation_instructions?: string;
  contraindications?: string;
};

// ─── API calls ────────────────────────────────────────────────────────────────

export async function fetchProtocols(params?: {
  status?: ProtocolStatus | "";
  cancer_type?: string;
  icd10_code?: string;
  search?: string;
  include_archived?: boolean;
}): Promise<TreatmentProtocolList[]> {
  const qs = new URLSearchParams();
  if (params?.status)          qs.set("status", params.status);
  if (params?.cancer_type)     qs.set("cancer_type", params.cancer_type);
  if (params?.icd10_code)      qs.set("icd10_code", params.icd10_code);
  if (params?.search)          qs.set("search", params.search);
  if (params?.include_archived) qs.set("include_archived", "true");
  const data = await apiFetch<Paginated<TreatmentProtocolList>>(
    `/crm/protocols/${qs.toString() ? `?${qs}` : ""}`,
  );
  return unwrap(data);
}

export function fetchProtocol(id: number): Promise<TreatmentProtocol> {
  return apiFetch<TreatmentProtocol>(`/crm/protocols/${id}/`);
}

export function createProtocol(data: ProtocolWritePayload): Promise<TreatmentProtocol> {
  return apiFetch<TreatmentProtocol>("/crm/protocols/", { method: "POST", body: data });
}

export function updateProtocol(id: number, data: Partial<ProtocolWritePayload>): Promise<TreatmentProtocol> {
  return apiFetch<TreatmentProtocol>(`/crm/protocols/${id}/`, { method: "PATCH", body: data });
}

export function archiveProtocol(id: number): Promise<{ detail: string }> {
  return apiFetch(`/crm/protocols/${id}/archive/`, { method: "POST" });
}

export function submitProtocol(id: number): Promise<{ detail: string; status: string }> {
  return apiFetch(`/crm/protocols/${id}/submit/`, { method: "POST" });
}

export function approveProtocol(id: number, comment?: string): Promise<{ detail: string }> {
  return apiFetch(`/crm/protocols/${id}/approve/`, { method: "POST", body: { comment } });
}

export function rejectProtocol(id: number, comment?: string): Promise<{ detail: string }> {
  return apiFetch(`/crm/protocols/${id}/reject/`, { 
    method: "POST", 
    body: { comment: comment || "Rejeté sans commentaire." } 
  });
}

export function duplicateProtocol(id: number): Promise<TreatmentProtocol> {
  return apiFetch<TreatmentProtocol>(`/crm/protocols/${id}/duplicate/`, { method: "POST" });
}

export function compareProtocols(ids: number[]): Promise<CompareResponse> {
  return apiFetch<CompareResponse>("/crm/protocols/compare/", { method: "POST", body: { protocol_ids: ids } });
}

export function exportProtocol(id: number): Promise<{ protocol: TreatmentProtocol; export_date: string; exported_by: string }> {
  return apiFetch(`/crm/protocols/${id}/export/`);
}

export function assignProtocol(planId: number, data: {
  protocol_id: number;
  prescribed_total_dose_gy?: number;
  prescribed_dose_per_fraction_gy?: number;
  prescribed_fractions?: number;
  notes?: string;
}): Promise<{ detail: string; assignment: ProtocolAssignment }> {
  return apiFetch(`/crm/treatment-plans/${planId}/assign-protocol/`, { method: "POST", body: data });
}

export function getProtocolAssignment(planId: number): Promise<ProtocolAssignment> {
  return apiFetch<ProtocolAssignment>(`/crm/treatment-plans/${planId}/assign-protocol/`);
}

export function fetchDoseDeviations(params?: {
  severity?: "warning" | "critical";
  plan_id?: number;
  unacknowledged?: boolean;
}): Promise<DoseDeviationResult[]> {
  const qs = new URLSearchParams();
  if (params?.severity)        qs.set("severity", params.severity);
  if (params?.plan_id)         qs.set("plan_id", String(params.plan_id));
  if (params?.unacknowledged)  qs.set("unacknowledged", "true");
  return apiFetch<Paginated<DoseDeviationResult>>(
    `/crm/dose-deviations/${qs.toString() ? `?${qs}` : ""}`,
  ).then(unwrap);
}

export function checkDoseDeviation(params: {
  session_id: number;
  prescribed_gy: number;
  delivered_gy: number;
}): Promise<DoseCheckResponse> {
  return apiFetch<DoseCheckResponse>("/crm/dose-deviations/check/", { method: "POST", body: params });
}

export function justifyDeviation(id: number, justification: string): Promise<DoseDeviationResult> {
  return apiFetch<DoseDeviationResult>(`/crm/dose-deviations/${id}/justify/`, {
    method: "PATCH",
    body: { justification },
  });
}

// ─── Aliases (expected by src/routes/protocols.tsx) ───────────────────────────
// protocols.tsx imports these names; the implementations above use slightly
// different names.  Re-export under both so either spelling works.

/** Alias for {@link fetchProtocols} */
export const listProtocols = fetchProtocols;

/** Alias for {@link fetchProtocol} */
export const getProtocol = fetchProtocol;

/** Alias for {@link submitProtocol} */
export const submitForApproval = submitProtocol;

/** Alias for {@link duplicateProtocol} */
export function cloneProtocol(id: number): Promise<TreatmentProtocol> {
  return apiFetch<TreatmentProtocol>(`/crm/protocols/${id}/clone/`, { method: "POST" });
}
