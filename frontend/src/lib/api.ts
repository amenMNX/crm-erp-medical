// -----------------------------------------------------------------------------
// Cookie-based auth helpers
// -----------------------------------------------------------------------------
// The client does not store access or refresh tokens. The backend issues HttpOnly
// auth cookies and refresh cookies, while the frontend stores only non-sensitive
// user display data in sessionStorage.
// -----------------------------------------------------------------------------

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const USER_KEY = "crm-erp-auth-user";

type ApiFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

export function setStoredUser(user: unknown): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): unknown | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearAuthTokens(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getStoredUser());
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

async function fetchWithCookies<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const route = path.startsWith("/") ? path : `/${path}`;
  const { method = "GET", body, headers = {} } = options;
  const url = `${API_BASE_URL}${route}`;
  const requestHeaders = new Headers(headers);
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  if (body !== undefined && !isFormData) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    credentials: "include",
    body:
      body === undefined
        ? undefined
        : isFormData
        ? body
        : JSON.stringify(body),
  });

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

async function refreshToken(): Promise<void> {
  await fetchWithCookies("/accounts/refresh/", { method: "POST" });
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  try {
    return await fetchWithCookies<T>(path, options);
  } catch (error: unknown) {
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      path !== "/accounts/login/" &&
      path !== "/accounts/refresh/"
    ) {
      try {
        await refreshToken();
        return await fetchWithCookies<T>(path, options);
      } catch {
        window.location.href = "/signin";
        throw error;
      }
    }

    throw error;
  }
}

export async function loginRequest(
  username: string,
  password: string,
): Promise<{
  user: {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    is_staff: boolean;
    profile?: { role?: string };
  };
}> {
  return apiFetch("/accounts/login/", {
    method: "POST",
    body: { username, password },
  });
}

export async function logoutRequest(): Promise<void> {
  await apiFetch("/accounts/logout/", { method: "POST" });
}
