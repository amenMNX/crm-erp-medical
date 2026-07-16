type ApiFetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  token?: string | null;
};

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api"
).replace(/\/$/, "");

const AUTH_TOKEN_KEY = "crm-erp-auth-token";

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

function getStoredAuthToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
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
  }

  return "API request failed.";
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
    headers.set("Authorization", `Token ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
    body: isFormData ? requestBody : requestBody === undefined ? undefined : JSON.stringify(requestBody),
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