export type AuthUser = {
  name: string;
  email: string;
};

const AUTH_USER_KEY = "crm-erp-auth-user";
const AUTH_TOKEN_KEY = "crm-erp-auth-token";

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function isAuthenticated() {
  return Boolean(getAuthUser() && getAuthToken());
}

export function login(user: AuthUser, token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function logout() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_USER_KEY);
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}