// Sprint 0 security fix: all token storage migrated from localStorage to
// sessionStorage (access token + user info) and in-memory (refresh token).
// See api.ts for the full rationale.
// auth.ts delegates to the api.ts helpers so token storage logic lives
// in exactly one place.

import {
  setAuthTokens,
  clearAuthTokens,
  getStoredAuthToken,
  setStoredUser,
  getStoredUser,
} from "./api";

export type AuthUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  role?: string;
};

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  return getStoredUser() as AuthUser | null;
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return getStoredAuthToken();
}

export function isAuthenticated(): boolean {
  return Boolean(getAuthUser() && getAuthToken());
}

export function login(user: AuthUser, accessToken: string, refreshToken: string): void {
  if (typeof window === "undefined") return;
  setAuthTokens(accessToken, refreshToken);
  setStoredUser(user);
}

export function logout(): void {
  if (typeof window === "undefined") return;
  clearAuthTokens();
}