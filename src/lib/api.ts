import type { ApiResponse } from "@/types";

const TOKEN_KEY = "motolab_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** The wrapper returns { body: <module return> } which OpenWhisk serves as the
 * HTTP body. So browser fetch receives the module dict directly. We normalize
 * both shapes defensively. */
function normalize<T>(raw: unknown): ApiResponse<T> {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if ("success" in obj) return obj as unknown as ApiResponse<T>;
  if ("body" in obj && obj.body && typeof obj.body === "object") {
    return (obj.body as Record<string, unknown>) as unknown as ApiResponse<T>;
  }
  return { success: false, data: null as T, error: "Unexpected response shape" };
}

class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(path, { ...options, headers });
  } catch (e) {
    throw new ApiError(`Network error: ${e instanceof Error ? e.message : "request failed"}`);
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new ApiError(`Invalid response (status ${res.status})`);
  }

  const body = normalize<T>(raw);
  if (!res.ok || !body.success || body.error) {
    throw new ApiError(body.error || `Request failed: ${res.status}`);
  }
  return body.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
