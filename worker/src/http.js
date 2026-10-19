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
