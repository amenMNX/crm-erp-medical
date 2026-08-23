import { apiFetch } from "./api";

export type ApiUser = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser: boolean;
  is_active: boolean;
  date_joined: string;
  profile?: {
    role: string;
    phone: string;
    department: string;
  };
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function fetchUsers(): Promise<ApiUser[]> {
  const data = await apiFetch<Paginated<ApiUser>>("/accounts/users/");
  return unwrap(data);
}

export function updateUserRole(id: number, role: string): Promise<ApiUser> {
  return apiFetch<ApiUser>(`/accounts/users/${id}/`, {
    method: "PATCH",
    body: { profile: { role } },
  });
}
