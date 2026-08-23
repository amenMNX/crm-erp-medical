import { apiFetch } from "./api";

export interface MedicalProduct {
  id: number;
  reference: string;
  name: string;
  category: string;
  category_label: string;
  unit: string;
  unit_label: string;
  description: string;
  manufacturer: string;
  is_active: boolean;
  current_stock: number;
  alert?: StockAlert;
  created_at: string;
  updated_at: string;
}

export interface StockAlert {
  id: number;
  product: number;
  min_quantity: number;
  reorder_quantity: number;
  preferred_supplier: string;
  lead_time_days: number;
  is_active: boolean;
  is_triggered: boolean;
}

export interface StockEntry {
  id: number;
  product: number;
  product_name: string;
  product_reference: string;
  product_unit: string;
  lot_number: string;
  received_date: string;
  expiry_date: string | null;
  quantity_initial: number;
  quantity_remaining: number;
  unit_cost: number;
  supplier: string;
  purchase_order: string;
  notes: string;
  is_expired: boolean;
  days_until_expiry: number | null;
  movements: StockMovement[];
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
}

export interface StockMovement {
  id: number;
  entry: number;
  movement_type: string;
  movement_type_label: string;
  quantity: number;
  movement_date: string;
  reason: string;
  reference: string;
  notes: string;
  recorded_by: number | null;
  recorded_by_name: string | null;
  created_at: string;
}

export interface StockDashboardSummary {
  total_active_products: number;
  low_stock_alerts: number;
  expiring_soon_lots: number;
  expired_lots_with_stock: number;
}

// ── Products ────────────────────────────────────────────────────────────────
export const fetchProducts = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return apiFetch<{ results: MedicalProduct[]; count: number }>(`/stocks/products/${qs}`);
};

export const fetchProduct = (id: number) =>
  apiFetch<MedicalProduct>(`/stocks/products/${id}/`);

export const createProduct = (data: Partial<MedicalProduct>) =>
  apiFetch<MedicalProduct>("/stocks/products/", { method: "POST", body: JSON.stringify(data) });

export const updateProduct = (id: number, data: Partial<MedicalProduct>) =>
  apiFetch<MedicalProduct>(`/stocks/products/${id}/`, { method: "PATCH", body: JSON.stringify(data) });

export const deleteProduct = (id: number) =>
  apiFetch<void>(`/stocks/products/${id}/`, { method: "DELETE" });

export const fetchLowStockProducts = () =>
  apiFetch<MedicalProduct[]>("/stocks/products/low-stock/");

export const fetchStockDashboardSummary = () =>
  apiFetch<StockDashboardSummary>("/stocks/products/dashboard-summary/");

// ── Entries ─────────────────────────────────────────────────────────────────
export const fetchEntries = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return apiFetch<{ results: StockEntry[]; count: number }>(`/stocks/entries/${qs}`);
};

export const createEntry = (data: Partial<StockEntry>) =>
  apiFetch<StockEntry>("/stocks/entries/", { method: "POST", body: JSON.stringify(data) });

export const fetchExpiringSoon = () =>
  apiFetch<StockEntry[]>("/stocks/entries/expiring-soon/");

export const fetchExpiredEntries = () =>
  apiFetch<StockEntry[]>("/stocks/entries/expired/");

// ── Movements ────────────────────────────────────────────────────────────────
export const createMovement = (data: Partial<StockMovement>) =>
  apiFetch<StockMovement>("/stocks/movements/", { method: "POST", body: JSON.stringify(data) });

export const fetchMovements = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return apiFetch<{ results: StockMovement[]; count: number }>(`/stocks/movements/${qs}`);
};

// ── Alerts ───────────────────────────────────────────────────────────────────
export const fetchAlerts = () =>
  apiFetch<{ results: StockAlert[]; count: number }>("/stocks/alerts/");

export const fetchTriggeredAlerts = () =>
  apiFetch<StockAlert[]>("/stocks/alerts/triggered/");

export const createAlert = (data: Partial<StockAlert>) =>
  apiFetch<StockAlert>("/stocks/alerts/", { method: "POST", body: JSON.stringify(data) });

export const updateAlert = (id: number, data: Partial<StockAlert>) =>
  apiFetch<StockAlert>(`/stocks/alerts/${id}/`, { method: "PATCH", body: JSON.stringify(data) });
