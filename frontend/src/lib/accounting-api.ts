import { apiFetch } from "./api";

export type EntryStatus = "draft" | "posted" | "cancelled";

export type ApiAccount = {
  id: number; code: string; name: string; parent: number | null; parent_name: string | null;
  account_type: string; account_type_display: string; normal_balance: string;
  is_active: boolean; level: number;
};

export type ApiJournal = {
  id: number; code: string; name: string; journal_type: string;
  journal_type_display: string; is_active: boolean; entry_count: number;
};

export type ApiJournalLine = {
  id: number; entry: number; account: number; account_code: string; account_name: string;
  debit: string; credit: string; description: string;
};

export type ApiJournalEntry = {
  id: number; entry_number: string; journal: number; journal_code: string; journal_name: string;
  entry_date: string; description: string; reference: string;
  total_debit: string; total_credit: string; is_balanced: boolean; line_count: number;
  status: EntryStatus; created_by: number | null; created_by_name: string;
  validated_by: number | null; validated_by_name: string | null;
  posted_at: string | null; created_at: string; lines: ApiJournalLine[];
};

type Paginated<T> = { results: T[]; count: number } | T[];
const unwrap = <T>(d: Paginated<T>): T[] => (Array.isArray(d) ? d : d.results);

export async function fetchAccounts(): Promise<ApiAccount[]> {
  return unwrap(await apiFetch<Paginated<ApiAccount>>("/accounting/chart-of-accounts/"));
}

export async function fetchJournals(): Promise<ApiJournal[]> {
  return unwrap(await apiFetch<Paginated<ApiJournal>>("/accounting/journals/"));
}

export async function fetchJournalEntries(): Promise<ApiJournalEntry[]> {
  return unwrap(await apiFetch<Paginated<ApiJournalEntry>>("/accounting/journal-entries/"));
}

export type EntryLinePayload = { account: number; debit?: number; credit?: number; description?: string };

export type CreateEntryPayload = {
  journal_id: number; entry_date: string; description: string; reference?: string;
  invoice_id?: number | null; payment_id?: number | null; lines: EntryLinePayload[];
};

export function createJournalEntry(payload: CreateEntryPayload): Promise<ApiJournalEntry> {
  return apiFetch<ApiJournalEntry>("/accounting/journal-entries/", { method: "POST", body: payload });
}

export function postEntry(id: number): Promise<ApiJournalEntry> {
  return apiFetch<ApiJournalEntry>(`/accounting/journal-entries/${id}/post-entry/`, { method: "POST" });
}

export function cancelEntry(id: number): Promise<ApiJournalEntry> {
  return apiFetch<ApiJournalEntry>(`/accounting/journal-entries/${id}/cancel/`, { method: "POST" });
}

export async function fetchBalanceSheet(endDate: string) {
  return apiFetch<Array<{ code: string; name: string; account_type: string; balance: number }>>(
    `/accounting/journal-entries/balance-sheet/?end_date=${endDate}`
  );
}

export async function fetchIncomeStatement(startDate: string, endDate: string) {
  return apiFetch<{
    lines: Array<{ code: string; name: string; account_type: string; balance: number }>;
    summary: { total_charges: number; total_produits: number; result: number };
  }>(`/accounting/journal-entries/income-statement/?start_date=${startDate}&end_date=${endDate}`);
}
