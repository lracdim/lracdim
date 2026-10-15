/**
 * Thin fetch wrapper for the Litestar API at /api.
 *
 * While MOCK is true nothing in src/api/resources/* calls request(); each
 * resource function returns seed data from src/api/mock instead. The wrapper
 * exists now so switching a resource over is a one-line change.
 */

import type { ApiError } from '~/lib/types';

export const API_BASE: string =
  import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

/**
 * Default true: the dashboard ships on local mock data.
 * Set VITE_USE_MOCK=false (see .env.example) once the API is reachable.
 */
export const MOCK: boolean = import.meta.env.VITE_USE_MOCK !== 'false';

/** Simulated network latency for mock resources, in milliseconds. */
export const MOCK_LATENCY_MS = 260;

export function delay<T>(value: T, ms: number = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiError).code === 'string' &&
    typeof (value as ApiError).message === 'string'
  );
}

export function apiError(code: string, message: string): ApiError {
  return { code, message };
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  query?: Record<string, string | number | undefined>;
}

/**
 * Performs a request and normalises every failure to { code, message }.
 * Always throws an ApiError, never a bare Error or a Response.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, query } = options;

  const url = new URL(path.replace(/^\//, ''), `${API_BASE.replace(/\/$/, '')}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal,
      // TODO(api): the session cookie is httpOnly, so credentials must be sent.
      credentials: 'include',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw apiError(
      'network_unreachable',
      cause instanceof Error && cause.name === 'AbortError'
        ? 'The request was cancelled.'
        : `Could not reach the API at ${API_BASE}.`,
    );
  }

  if (!response.ok) {
    throw apiError(...(await errorFromResponse(response)));
  }

  if (response.status === 204) return undefined as T;

  try {
    return (await response.json()) as T;
  } catch {
    throw apiError('malformed_response', 'The API returned a response that was not JSON.');
  }
}

async function errorFromResponse(response: Response): Promise<[string, string]> {
  const fallback: Record<number, [string, string]> = {
    400: ['bad_request', 'The request was rejected as invalid.'],
    401: ['unauthenticated', 'Your session has expired. Sign in again.'],
    403: ['forbidden', 'You do not have access to this record.'],
    404: ['not_found', 'That record no longer exists.'],
    409: ['conflict', 'This record changed since it was loaded.'],
    422: ['validation_failed', 'Some fields need correcting.'],
  };

  try {
    const payload = (await response.json()) as { code?: string; message?: string; detail?: string };
    const code = payload.code ?? fallback[response.status]?.[0] ?? 'request_failed';
    const message =
      payload.message ??
      payload.detail ??
      fallback[response.status]?.[1] ??
      `The API responded with status ${response.status}.`;
    return [code, message];
  } catch {
    return fallback[response.status] ?? ['request_failed', `The API responded with status ${response.status}.`];
  }
}
