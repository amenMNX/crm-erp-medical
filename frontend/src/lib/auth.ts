import { setStoredUser, getStoredUser, clearAuthTokens } from "./api";

export type AuthUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  role?: string;
  is_super_admin?: boolean;  // S1
};

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  return getStoredUser() as AuthUser | null;
}

export function isAuthenticated(): boolean {
  return Boolean(getAuthUser());
}

export function login(user: AuthUser): void {
  if (typeof window === "undefined") return;
  setStoredUser(user);
}

export function logout(): void {
  if (typeof window === "undefined") return;
  clearAuthTokens();
}
