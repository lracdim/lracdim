/**
 * Hashing and signing for the report pipeline. Everything is WebCrypto, so it
 * runs the same in the Worker and under node:test.
 *
 * - Email addresses are compared by a salted SHA-256 (`emailHash`), so rate
 *   limits and suppressions survive the retention sweep that removes the
 *   address itself.
 * - Report links and unsubscribe links are HMACs of the request id under the
 *   signing key. They are never stored; the report link's SHA-256 is, which is
 *   enough to look it up, expire it and revoke it.
 */

const enc = new TextEncoder();

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', typeof secret === 'string' ? enc.encode(secret) : secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function hmac(secret, message) {
  return crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(message));
}

/** Constant-time comparison of two strings of any length. */
export function timingSafeEqual(a, b) {
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * The key that signs report and unsubscribe links. REPORT_SIGNING_KEY when it
 * is set; otherwise RATE_LIMIT_SALT, which is already a long random secret in
 * production. Every use is domain-separated by a label, so sharing it with the
 * rate limiter does not let one stand in for the other.
 */
export function signingKey(env) {
  return env.REPORT_SIGNING_KEY || env.RATE_LIMIT_SALT || '';
}

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export async function emailHash(env, email) {
  return (await sha256Hex(`email:v1:${env.RATE_LIMIT_SALT || ''}:${normalizeEmail(email)}`)).slice(0, 40);
}

export async function ipHash(env, ip) {
  return (await sha256Hex(`${env.RATE_LIMIT_SALT || ''}:${ip}`)).slice(0, 32);
}

/** The secret in a report link. 43 characters, URL-safe. */
export async function reportToken(env, requestId) {
  return b64url(await hmac(signingKey(env), `report-link:v1:${requestId}`));
}

/** "<requestId>.<signature>" for the unsubscribe link and the one-click header. */
export async function unsubscribeToken(env, requestId) {
  return `${requestId}.${b64url(await hmac(signingKey(env), `unsubscribe:v1:${requestId}`)).slice(0, 32)}`;
}

/** The request id inside a valid unsubscribe token, or null. */
export async function readUnsubscribeToken(env, token) {
  const m = /^([0-9a-f]{32})\.([A-Za-z0-9_-]{32})$/.exec(String(token || ''));
  if (!m || !signingKey(env)) return null;
  const expected = await unsubscribeToken(env, m[1]);
  return timingSafeEqual(expected, token) ? m[1] : null;
}

/** "j***@example.com": enough to recognise an address, not enough to harvest it. */
export function maskEmail(email) {
  const [local, domain] = normalizeEmail(email).split('@');
  if (!domain) return '';
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(1, Math.min(3, local.length - 1)))}@${domain}`;
}
