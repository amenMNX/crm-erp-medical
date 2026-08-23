import { apiFetch } from "./api";

export type ContractType = "cdi" | "cdd" | "intern" | "consultant";

export type ApiEmployee = {
  id: number;
  user: number | null;
  username: string | null;
  employee_number: string;
  first_name: string;
  last_name: string;
  date_naissance: string | null;
  job_title: string;
  department: string;
  phone: string;
  email: string;
  hire_date: string | null;
  contract_type: ContractType;
  leave_credit_days: string;
  leave_days_used: number;
  leave_days_remaining: number;
  salary: {
    base_salary: string;
    bank_account: string;
    bank_name: string;
    transport_allowance: string;
    meal_allowance: string;
    bonus_percentage: string;
    total_monthly_compensation: string;
  };
  role: number | null;
  role_name: string | null;
  role_id: number | null;
  role_is_built_in: boolean | null;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchEmployees(): Promise<ApiEmployee[]> {
  const data = await apiFetch<Paginated<ApiEmployee>>("/hr/employees/");
  return unwrap(data);
}

export type EmployeeWritePayload = {
  user?: number | null;
  /**
   * Initial login password for the employee's user account.
   * SUPERADMINS ONLY — the backend silently ignores this field for all
   * other roles; a random secure password is generated instead.
   * If omitted entirely, a random password is always auto-generated.
   */
  password?: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  date_naissance?: string | null;
  job_title: string;
  department?: string;
  phone?: string;
  email?: string;
  hire_date?: string | null;
  contract_type?: ContractType;
  leave_credit_days?: string;
  base_salary?: string;
  bank_account?: string;
  bank_name?: string;
  transport_allowance?: string;
  meal_allowance?: string;
  bonus_percentage?: string;
  is_active?: boolean;
  notes?: string;
  role?: number | null;
};

export function createEmployee(payload: EmployeeWritePayload): Promise<ApiEmployee> {
  return apiFetch<ApiEmployee>("/hr/employees/", {
    method: "POST",
    body: payload,
  });
}

export function updateEmployee(
  id: number,
  payload: Partial<EmployeeWritePayload>,
): Promise<ApiEmployee> {
  return apiFetch<ApiEmployee>(`/hr/employees/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteEmployee(id: number): Promise<void> {
  return apiFetch<void>(`/hr/employees/${id}/`, {
    method: "DELETE",
  });
}

/**
 * Reset an employee's login password.
 * SUPERADMINS ONLY — the backend returns 403 for everyone else.
 */
export function setEmployeePassword(
  id: number,
  password: string,
): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>(`/hr/employees/${id}/set-password/`, {
    method: "POST",
    body: { password },
  });
}

/**
 * Manually link (or auto-create) a Django User for an existing employee.
 * Pass `userId` to link an existing account, or omit it to auto-create.
 * SUPERADMINS ONLY — the backend returns 403 for everyone else.
 */
export function linkEmployeeUser(
  id: number,
  userId?: number,
): Promise<{ detail: string; user_id: number; username: string }> {
  return apiFetch(`/hr/employees/${id}/link-user/`, {
    method: "POST",
    body: userId != null ? { user_id: userId } : {},
  });
}