import { apiFetch } from "./api";

export type ApiCurrentUser = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_active: boolean;
  profile?: {
    role: string;
    phone: string;
    department: string;
  };
};

export function fetchCurrentUser(): Promise<ApiCurrentUser> {
  return apiFetch<ApiCurrentUser>("/accounts/me/");
}

export type CurrentUserWritePayload = {
  first_name?: string;
  last_name?: string;
  email?: string;
  profile?: Partial<{ phone: string; department: string }>;
};

export function updateCurrentUser(payload: CurrentUserWritePayload): Promise<ApiCurrentUser> {
  return apiFetch<ApiCurrentUser>("/accounts/me/", {
    method: "PATCH",
    body: payload,
  });
}
