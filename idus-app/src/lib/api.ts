// src/lib/api.ts
//
// The only place fetch() is called. Everything else imports from here.
//
// Error contract:
//   Any failure — network, HTTP, envelope — throws ApiError.
//   Screens catch ApiError and render based on .code.

import { getToken } from "./auth";

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status = 0, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL;

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (!API_URL) {
    throw new ApiError("CONFIG_ERROR", "EXPO_PUBLIC_API_URL is not set");
  }

  const { method = "GET", body, signal } = opts;

  let token: string;
  try {
    token = await getToken();
  } catch (err) {
    throw new ApiError(
      "AUTH_ERROR",
      err instanceof Error ? err.message : "Failed to obtain token"
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    throw new ApiError(
      "NETWORK_ERROR",
      err instanceof Error ? err.message : "Network request failed"
    );
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  let json: unknown;
  const text = await res.text();
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError(
        "INVALID_RESPONSE",
        `Server returned non-JSON (${res.status})`,
        res.status
      );
    }
  }

  if (!res.ok) {
    const envelope = json as
      | { error?: string; message?: string; details?: unknown }
      | undefined;
    throw new ApiError(
      envelope?.error ?? "HTTP_ERROR",
      envelope?.message ?? `Request failed with status ${res.status}`,
      res.status,
      envelope?.details
    );
  }

  return json as T;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "GET" }),

  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "POST", body }),

  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "PATCH", body }),

  delete: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "DELETE" }),
};