// ─────────────────────────────────────────────────────────────────────────────
// Token storage strategy (Sprint 0 security fix)
// ─────────────────────────────────────────────────────────────────────────────
// BEFORE: Both access and refresh tokens stored in localStorage.
//         Any XSS payload can read document.cookie-equivalent data from
//         localStorage and exfiltrate both tokens — permanent account takeover
//         until the refresh token expires (1 day). Unacceptable for medical data.
//
// AFTER:
//   Access token  → sessionStorage  (tab-scoped, cleared on tab close, still
//                                    readable by JS but not persisted to disk)
//   Refresh token → in-memory only  (a module-level variable, wiped on page
//                                    refresh — user re-authenticates per session)
//   User info     → sessionStorage  (non-sensitive display data only: name, role)
//
// Trade-off: users must log in again after a full page refresh.
// This is acceptable for a medical back-office app where sessions are short
// and shared machines are common. It is the correct trade-off.
// ─────────────────────────────────────────────────────────────────────────────

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  token?: string | null;
};

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api"
).replace(/\/$/, "");

const ACCESS_TOKEN_KEY = "crm-erp-auth-access-token";
const USER_KEY = "crm-erp-auth-user";

// Refresh token lives ONLY in memory — never written to any Web Storage.
// It is lost on page refresh (intentional: forces re-login per session).
let _refreshTokenMemory: string | null = null;

export function setAuthTokens(access: string, refresh: string): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, access);
  _refreshTokenMemory = refresh;
}

export function clearAuthTokens(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  _refreshTokenMemory = null;
}

export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

function getMemoryRefreshToken(): string | null {
  return _refreshTokenMemory;
}

export function setStoredUser(user: unknown): void {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): unknown | null {
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function isAuthenticated(): boolean {
  return !!getStoredAuthToken();
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function parseErrorMessage(data: unknown) {
  if (typeof data === "string") return data;

  if (data && typeof data === "object") {
    const payload = data as Record<string, unknown>;

    if (typeof payload.detail === "string") return payload.detail;
    if (typeof payload.non_field_errors === "string") return payload.non_field_errors;
    if (Array.isArray(payload.non_field_errors)) {
      return payload.non_field_errors.join(" ");
    }

    // DRF field-level validation errors look like { field: ["message"] }
    for (const [field, value] of Object.entries(payload)) {
      if (Array.isArray(value) && typeof value[0] === "string") {
        return `${field}: ${value[0]}`;
      }
      if (typeof value === "string") {
        return `${field}: ${value}`;
      }
    }
  }

  return "API request failed.";
}

// Deduplicated silent refresh — in-flight promise shared across concurrent callers.
let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getMemoryRefreshToken();
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${API_BASE_URL}/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: refreshToken }),
      });

      if (!res.ok) {
        // Refresh token expired or revoked — wipe everything and force re-login.
        clearAuthTokens();
        return null;
      }

      const data = await res.json();
      const newAccess: string = data.access;
      sessionStorage.setItem(ACCESS_TOKEN_KEY, newAccess);

      // SimpleJWT with ROTATE_REFRESH_TOKENS=True returns a new refresh token.
      // Store it back in memory (never in storage).
      if (data.refresh) {
        _refreshTokenMemory = data.refresh;
      }

      return newAccess;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const {
    body: requestBody,
    headers: customHeaders,
    token = getStoredAuthToken(),
    ...init
  } = options;

  const headers = new Headers(customHeaders);
  const isFormData = typeof FormData !== "undefined" && requestBody instanceof FormData;

  if (requestBody !== undefined && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const body = isFormData
    ? requestBody
    : requestBody === undefined
    ? undefined
    : JSON.stringify(requestBody);

  const response = await fetch(url, { ...init, headers, body });

  // On 401 (expired access token), attempt a silent refresh and retry once.
  if (response.status === 401 && token) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      const retryHeaders = new Headers(customHeaders);
      if (requestBody !== undefined && !isFormData) {
        retryHeaders.set("Content-Type", "application/json");
      }
      retryHeaders.set("Authorization", `Bearer ${newToken}`);

      const retryResponse = await fetch(url, {
        ...init,
        headers: retryHeaders,
        body: isFormData
          ? requestBody
          : requestBody === undefined
          ? undefined
          : JSON.stringify(requestBody),
      });

      if (retryResponse.status === 204) return undefined as T;
      const retryText = await retryResponse.text();
      const retryData = retryText ? JSON.parse(retryText) : null;
      if (!retryResponse.ok) {
        throw new ApiError(parseErrorMessage(retryData), retryResponse.status, retryData);
      }
      return retryData as T;
    } else {
      // No valid refresh token — force re-login.
      window.location.href = "/signin";
      throw new ApiError("Session expired. Please sign in again.", 401, null);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(parseErrorMessage(data), response.status, data);
  }

  return data as T;
}