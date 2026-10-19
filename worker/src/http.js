/**
 * Response helpers and CORS. Errors use the same envelope as the Python API,
 * {error: {code, message, fields?}}, because the site's api.js reads it.
 */

export const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS }
  });
}

export function error(status, code, message, fields) {
  const body = { code, message };
  if (fields && fields.length) body.fields = fields;
  return json({ error: body }, status);
}

export const allowedOrigins = (env) =>
  (env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);

/** The request's Origin when it is on the allow-list, otherwise null. */
export function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  return origin && allowedOrigins(env).includes(origin) ? origin : null;
}

export function preflight(request, env) {
  const origin = allowedOrigin(request, env);
  if (!origin) return error(400, 'cors', 'Disallowed CORS origin');
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin'
    }
  });
}

/** Copy of `response` carrying CORS headers for an allowed origin. */
export function withCors(response, origin) {
  const out = new Response(response.body, response);
  out.headers.append('Vary', 'Origin');
  if (origin) out.headers.set('Access-Control-Allow-Origin', origin);
  return out;
}

export const newId = () => crypto.randomUUID().replace(/-/g, '');
export const nowIso = () => new Date().toISOString();
export const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'unknown';

export const fieldError = (field, message) => error(422, 'validation', `${field}: ${message}`, [{ field, message }]);

/** Parse a JSON object body. Returns [body, null] or [null, errorResponse]. */
export async function readJson(request, maxBytes = 64 * 1024) {
  const raw = await request.text();
  if (raw.length > maxBytes) return [null, error(413, 'too_large', 'The request is too large.')];
  let body = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return [null, error(422, 'validation', 'The request body must be a JSON object.')];
  }
  return [body, null];
}

/** A required string field with length bounds. Returns [value, null] or [null, errorResponse]. */
export function stringField(body, field, min, max) {
  const v = body[field];
  if (typeof v !== 'string' || !v.trim()) return [null, fieldError(field, 'This field is required.')];
  if (v.length < min) return [null, fieldError(field, `Must be at least ${min} characters.`)];
  if (v.length > max) return [null, fieldError(field, `Must be at most ${max} characters.`)];
  return [v, null];
}

/** Integer query parameter within bounds. Returns [value, null] or [null, errorResponse]. */
export function intParam(url, name, fallback, min, max) {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') return [fallback, null];
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return [null, fieldError(name, `Must be a whole number from ${min} to ${max}.`)];
  return [n, null];
}

/** The admin key guard. Returns null when allowed, otherwise the 401 response. */
export async function requireAdmin(request, env) {
  const key = request.headers.get('X-Admin-Key') || '';
  if (!env.ADMIN_KEY || !(await safeEqual(key, env.ADMIN_KEY))) return error(401, 'unauthorized', 'An admin key is required.');
  return null;
}

/** Constant-time comparison of two secrets (compares their digests). */
export async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b))
  ]);
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}
