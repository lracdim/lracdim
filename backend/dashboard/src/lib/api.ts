import { session } from './session'

/**
 * The studio API lives in the Cloudflare Worker under /api/studio. In
 * production VITE_API_URL is its full address
 * (https://lracdim-api.lracdim.workers.dev/api/studio); in development the
 * default '/api/studio' goes through Vite's proxy to the local Worker
 * (vite.config.ts), so no CORS setup is needed.
 */
const BASE = (import.meta.env.VITE_API_URL || '/api/studio').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  code?: string
  fields?: Record<string, string>
  constructor(status: number, message: string, code?: string, fields?: Record<string, string>) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}

/** The Worker's error envelope: {error: {code, message, fields?: [{field, message}]}}. */
interface ErrorBody {
  error?: { code?: string; message?: string; fields?: { field: string; message: string }[] }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown; token?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = init.token ?? session.get()?.token
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let body = init.body
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(init.json)
  }
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, body })
  } catch {
    throw new ApiError(0, 'Cannot reach the studio API. Check your connection, or that the Worker is running (npm run dev in worker/).')
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    const err = (data as ErrorBody | null)?.error
    // An expired or revoked session signs the dashboard out (main.tsx then shows the sign-in page).
    if (res.status === 401 && token && !init.token && session.get()?.token === token) session.signOut()
    const fields = err?.fields ? Object.fromEntries(err.fields.map((f) => [f.field, f.message])) : undefined
    throw new ApiError(res.status, err?.message || `Request failed (${res.status})`, err?.code, fields)
  }
  return data as T
}

export const get = <T>(path: string) => api<T>(path)
export const post = <T>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} })
export const patch = <T>(path: string, json: unknown) => api<T>(path, { method: 'PATCH', json })
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' })
