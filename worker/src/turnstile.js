/**
 * Cloudflare Turnstile, checked server-side. The widget on the page only
 * produces a token; without this Siteverify call it protects nothing.
 *
 * TURNSTILE_SECRET (a Worker secret) switches the check on. With
 * TURNSTILE_REQUIRED=true a missing secret is a configuration error and
 * report requests are refused, so production cannot silently run unprotected.
 */

export const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_ACTION = 'report_request';

const truthy = (v) => ['1', 'true', 'yes'].includes(String(v || '').toLowerCase());

/** Hostnames the widget may be solved on: the hosts of CORS_ORIGINS. */
function allowedHosts(env) {
  return (env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => {
      try {
        return new URL(o.trim()).hostname;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Returns {ok: true} or {ok: false, code, message, status}. `ok` with
 * `skipped: true` means Turnstile is not configured and not required.
 */
export async function verifyTurnstile(env, token, ip, idempotencyKey) {
  if (!env.TURNSTILE_SECRET) {
    if (truthy(env.TURNSTILE_REQUIRED)) {
      console.error('turnstile: TURNSTILE_REQUIRED is set but TURNSTILE_SECRET is not');
      return { ok: false, status: 503, code: 'not_configured', message: 'Report requests are temporarily unavailable.' };
    }
    return { ok: true, skipped: true };
  }
  if (typeof token !== 'string' || !token || token.length > 2048) {
    return { ok: false, status: 422, code: 'challenge_required', message: 'Complete the security check, then send the form again.' };
  }
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip && ip !== 'unknown') form.append('remoteip', ip);
  if (idempotencyKey) form.append('idempotency_key', idempotencyKey);
  let data;
  try {
    const res = await fetch(SITEVERIFY, { method: 'POST', body: form, signal: AbortSignal.timeout(8000) });
    data = await res.json();
  } catch (err) {
    // Fail closed: an unverifiable request could be a bot.
    console.error('turnstile: siteverify unreachable', err && err.message);
    return { ok: false, status: 503, code: 'challenge_unavailable', message: 'The security check could not be verified. Try again in a minute.' };
  }
  if (!data || data.success !== true) {
    return { ok: false, status: 403, code: 'challenge_failed', message: 'The security check failed or expired. Complete it again, then resend the form.', detail: (data && data['error-codes']) || [] };
  }
  const hosts = allowedHosts(env);
  if (data.hostname && hosts.length && !hosts.includes(data.hostname)) {
    console.warn(`turnstile: token solved on unexpected host ${data.hostname}`);
    return { ok: false, status: 403, code: 'challenge_failed', message: 'The security check failed. Reload the page and try again.' };
  }
  if (data.action && data.action !== TURNSTILE_ACTION) {
    return { ok: false, status: 403, code: 'challenge_failed', message: 'The security check failed. Reload the page and try again.' };
  }
  return { ok: true };
}
