import { apiFetch } from "./api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PayrollStatus = "draft" | "generated" | "approved" | "paid" | "cancelled";
export type PaymentMethod = "bank_transfer" | "check" | "cash";

export interface ApiPayrollComponent {
  id: number;
  name: string;
  type: "earning" | "deduction";
  amount: string;
  description: string;
  source: string;
  source_id: number | null;
  created_at: string;
}

export interface ApiPayroll {
  id: number;
  payroll_batch: number;
  employee: number;
  employee_name: string;
  month: string;
  base_salary: string;
  transport_allowance: string;
  meal_allowance: string;
  bonus: string;
  absence_deduction: string;
  advance_deduction: string;
  tax_deduction: string;
  social_security: string;
  other_deduction: string;
  overtime: string;
  commission: string;
  other_earnings: string;
  gross_salary: string;
  total_deductions: string;
  net_salary: string;
  status: PayrollStatus;
  payment_date: string | null;
  payment_method: PaymentMethod | "";
  notes: string;
  components: ApiPayrollComponent[];
  created_at: string;
  updated_at: string;
}

export interface ApiPayrollBatch {
  id: number;
  month: string;
  status: PayrollStatus;
  total_net_salary: string;
  total_deductions: string;
  total_earnings: string;
  employee_count: number;
  notes: string;
  generated_by: number | null;
  generated_by_name: string | null;
  approved_by: number | null;
  approved_by_name: string | null;
  generated_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  payrolls: ApiPayroll[];
  created_at: string;
  updated_at: string;
}

export interface ApiEmployeeSalary {
  id: number;
  employee: number;
  employee_name: string;
  base_salary: string;
  bank_account: string;
  bank_name: string;
  tax_id: string;
  social_security_number: string;
  transport_allowance: string;
  meal_allowance: string;
  bonus_percentage: string;
  total_monthly_compensation: string;
  effective_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

// ── Payroll Batches ───────────────────────────────────────────────────────────

export async function fetchPayrollBatches(): Promise<ApiPayrollBatch[]> {
  const data = await apiFetch<Paginated<ApiPayrollBatch>>(
    "/payroll/payroll-batches/?page_size=50"
  );
  return unwrap(data);
}

export async function fetchPayrollBatch(id: number): Promise<ApiPayrollBatch> {
  return apiFetch<ApiPayrollBatch>(`/payroll/payroll-batches/${id}/`);
}

export async function generatePayroll(month: string): Promise<ApiPayrollBatch> {
  return apiFetch<ApiPayrollBatch>("/payroll/generate-payroll/generate/", {
    method: "POST",
    body: { month },
  });
}

export async function approvePayrollBatch(id: number): Promise<ApiPayrollBatch> {
  return apiFetch<ApiPayrollBatch>(`/payroll/payroll-batches/${id}/approve/`, {
    method: "POST",
  });
}

export async function markPayrollBatchPaid(id: number): Promise<ApiPayrollBatch> {
  return apiFetch<ApiPayrollBatch>(`/payroll/payroll-batches/${id}/mark_paid/`, {
    method: "POST",
  });
}

// ── Employee Salaries ─────────────────────────────────────────────────────────

export async function fetchEmployeeSalaries(): Promise<ApiEmployeeSalary[]> {
  const data = await apiFetch<Paginated<ApiEmployeeSalary>>(
    "/payroll/employee-salaries/?page_size=200"
  );
  return unwrap(data);
}

export async function createEmployeeSalary(
  payload: Omit<ApiEmployeeSalary, "id" | "employee_name" | "total_monthly_compensation" | "effective_date" | "created_at" | "updated_at">
): Promise<ApiEmployeeSalary> {
  return apiFetch<ApiEmployeeSalary>("/payroll/employee-salaries/", {
    method: "POST",
    body: payload,
  });
}

export async function updateEmployeeSalary(
  id: number,
  payload: Partial<Omit<ApiEmployeeSalary, "id" | "employee_name" | "total_monthly_compensation" | "effective_date" | "created_at" | "updated_at">>
): Promise<ApiEmployeeSalary> {
  return apiFetch<ApiEmployeeSalary>(`/payroll/employee-salaries/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}
