/**
 * Typed API client with session cookie handling and error normalization.
 *
 * Shared fetch/error helpers — later tasks add endpoint methods here.
 * Never modify the helpers below when extending.
 */

const API_BASE = '/api';

export interface ApiError {
  status: number;
  message: string;
  code?: string;
}

function normalizeError(response: Response, body?: unknown): ApiError {
  const message =
    typeof body === 'object' && body !== null && 'message' in body
      ? String((body as Record<string, unknown>).message)
      : `Erro ${response.status}`;

  const code =
    typeof body === 'object' && body !== null && 'code' in body
      ? String((body as Record<string, unknown>).code)
      : undefined;

  return { status: response.status, message, code };
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

  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    throw normalizeError(response, body);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
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
