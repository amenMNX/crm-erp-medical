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
  is_active?: boolean;
  notes?: string;
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