/**
 * Typed API client with session cookie handling and error normalization.
 *
 * Shared fetch/error helpers for JSON API requests.
 */

import { assertSessionEpoch, checkProtectedResponse, sessionEpoch } from './session-boundary';

const API_BASE = '/api';

export interface ApiError {
  status: number;
  message: string;
  code?: string;
  fields?: string[];
}

function normalizeError(response: Response, body?: unknown): ApiError {
  const envelope = typeof body === 'object' && body !== null ? body as Record<string, unknown> : null;
  const payload = envelope?.error && typeof envelope.error === 'object' && !Array.isArray(envelope.error)
    ? envelope.error as Record<string, unknown>
    : envelope;
  const message =
    payload && 'message' in payload
      ? String(payload.message)
      : `Erro ${response.status}`;

  const code =
    payload && 'code' in payload
      ? String(payload.code)
      : undefined;

  const fields = payload && Array.isArray(payload.fields) && payload.fields.every((field) => typeof field === 'string')
    ? payload.fields as string[]
    : undefined;
  return { status: response.status, message, code, ...(fields ? { fields } : {}) };
}

/**
 * Typed fetch wrapper.
 * Sends credentials (cookies) with every request.
 * Normalizes non-OK responses into ApiError.
 */
export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const startedAt = sessionEpoch();

  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    // Login/register failures are form errors, not expiry of a protected session.
    // /auth/me is handled by the protected layout; it is also used to verify
    // credentials on the public login/signup pages.
    if (!['/v1/auth/register', '/v1/auth/login', '/v1/auth/logout', '/v1/auth/me'].includes(path)) {
      checkProtectedResponse(response, startedAt);
    }
    assertSessionEpoch(startedAt);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    assertSessionEpoch(startedAt);
    throw normalizeError(response, body);
  }

  assertSessionEpoch(startedAt);

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.json() as T;
  assertSessionEpoch(startedAt);
  return body;
}

/**
 * Convenience helpers for common verbs.
 * Later tasks add endpoint-specific methods.
 */
export const api = {
  get: <T>(path: string) => apiFetch<T>(path),

  post: <T>(path: string, data: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(data) }),

  put: <T>(path: string, data: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(data) }),

  patch: <T>(path: string, data: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
