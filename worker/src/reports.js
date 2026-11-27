/**
 * Gated Vector reports: the HTTP side.
 *
 * Public
 *   POST /api/vector/audits/{id}/report-requests   ask for the full report by email
 *   GET  /api/vector/report-requests/{id}           delivery status of one request
 *   GET  /api/vector/report                         the full report (Authorization: Bearer <link token>)
 *   POST /api/vector/unsubscribe/{token}            stop all email to an address (also RFC 8058 one-click)
 *   POST /api/webhooks/resend                       Resend delivery events (Svix-signed)
 *
 * Admin (X-Admin-Key)
 *   GET  /api/vector/report-requests                latest requests, filter with ?status=
 *   GET  /api/vector/report-requests/{id}           the request with its full audit trail
 *   POST /api/vector/report-requests/{id}/retry     deliver again ({"force": true} for one already sent)
 *   POST /api/vector/report-requests/{id}/revoke    withdraw the report link
 *   POST /api/vector/report-requests/erase          {"email"}: anonymise every request from an address
 *   GET  /api/vector/report-stats                   volumes, the daily cap, suppressions
 */
import { fullReport } from './audit-view.js';
import { clientIp, error, json, newId, nowIso, readJson, requireAdmin } from './http.js';
import { hit } from './ratelimit.js';
import { dispatchDelivery, intVar, logEvent } from './report-delivery.js';
import { emailHash, hmac, ipHash, maskEmail, normalizeEmail, readUnsubscribeToken, sha256Hex, timingSafeEqual } from './secure.js';
import { verifyTurnstile } from './turnstile.js';

/** The consent wording on the form is versioned; the version a requester accepted is stored with the request. */
export const CONSENT_VERSION = '2026-11-27';
const SOURCES = ['vector', 'diagnostic', 'report-link'];
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,63}$/;
const LINKISH = /(?:https?:|www\.|:\/\/|[a-z0-9-]+\.(?:com|net|org|io|ru|xyz|top|info|biz|co)\b|@)/i;
const DOH = 'https://cloudflare-dns.com/dns-query';

const firstName = (name) => {
  const w = String(name || '').trim().split(/\s+/)[0] || '';
  return /^\p{L}[\p{L}\p{M}'’-]{0,39}$/u.test(w) ? w : '';
};

/* --------------------------------------------------------- validation */

/** Returns {data, fields}; `fields` lists every rejected field in form order. */
export function validateRequest(body) {
  const fields = [];
  const data = {};
  const reject = (field, message) => fields.push({ field, message });
  const text = (key, { required = false, min = 0, max }) => {
    const v = body[key];
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
      if (required) reject(key, 'This field is required.');
      return null;
    }
    if (typeof v !== 'string') return reject(key, 'Must be text.'), null;
    const t = v.trim().replace(/\s+/g, ' ');
    if (t.length < min) return reject(key, `Must be at least ${min} characters.`), null;
    if (t.length > max) return reject(key, `Must be at most ${max} characters.`), null;
    return t;
  };

  data.name = text('name', { required: true, min: 2, max: 120 });
  if (data.name && LINKISH.test(data.name)) reject('name', 'Enter your name without links or addresses.');
  const email = normalizeEmail(body.email);
  if (!email) reject('email', 'This field is required.');
  else if (email.length > 254 || !EMAIL.test(email)) reject('email', 'Enter a valid email address.');
  else data.email = email;
  data.company = text('company', { max: 160 });
  data.note = text('note', { max: 1000 });
  if (body.consent !== true) reject('consent', 'Tick the box to agree to receive the report by email.');
  data.source = SOURCES.includes(body.source) ? body.source : 'vector';
  return { data, fields };
}

async function dns(name, type) {
  const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { Accept: 'application/dns-json' },
    signal: AbortSignal.timeout(4000)
  });
  if (!res.ok) throw new Error(`DoH ${res.status}`);
  return res.json();
}

/**
 * Whether a domain can receive mail: an MX record that is not a null MX
 * (RFC 7505), or no MX but an address record (RFC 5321's implicit MX).
 * Resolver trouble answers true: it must never block a real person.
 */
export async function domainAcceptsMail(domain) {
  try {
    const mx = await dns(domain, 'MX');
    if (mx.Status === 3) return false; // NXDOMAIN
    const records = (mx.Answer || []).filter((a) => a.type === 15).map((a) => String(a.data).trim());
    if (records.length) return !records.every((r) => /^0\s+\.?$/.test(r));
    const a = await dns(domain, 'A');
    return (a.Answer || []).some((x) => x.type === 1);
  } catch {
    return true;
  }
}

const count = async (env, sql, ...args) => ((await env.DB.prepare(sql).bind(...args).first()) || {}).n || 0;

/* --------------------------------------------------------- public routes */

async function requestReport(request, env, ctx, auditId) {
  const ip = clientIp(request);
  if (!(await hit(env, ctx, 'reports', ip, env.RATE_LIMIT_REPORTS || '5/hour'))) {
    return error(429, 'rate_limited', 'Too many report requests from this connection. Try again later.');
  }
  const [body, bad] = await readJson(request, 16 * 1024);
  if (bad) return bad;
  if (typeof body.honeypot === 'string' && body.honeypot.trim()) {
    // Bots fill the hidden field. Look accepted; store and send nothing.
    return json({ id: '0'.repeat(32), status: 'queued', email_masked: '' }, 202);
  }
  const { data, fields } = validateRequest(body);
  if (fields.length) return error(422, 'validation', `${fields[0].field}: ${fields[0].message}`, fields);

  const audit = await env.DB.prepare('SELECT id, status FROM audits WHERE id = ?').bind(auditId).first();
  if (!audit) return error(404, 'not_found', 'No examination with that id.');
  if (audit.status !== 'completed') return error(409, 'not_ready', 'The examination has not finished yet.');

  const human = await verifyTurnstile(env, body.turnstile_token, ip);
  if (!human.ok) return error(human.status, human.code, human.message);

  const key = await emailHash(env, data.email);
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const masked = maskEmail(data.email);

  // The same report to the same address within a day: answer with the first request, send nothing new.
  const dup = await env.DB.prepare(
    "SELECT id, status FROM report_requests WHERE audit_id = ? AND email_hash = ? AND created_at > ? AND status IN ('queued', 'sending', 'sent') ORDER BY created_at DESC LIMIT 1"
  )
    .bind(auditId, key, dayAgo)
    .first();
  if (dup) return json({ id: dup.id, status: dup.status, email_masked: masked, duplicate: true }, 200);

  const blocked = await env.DB.prepare('SELECT reason FROM email_suppressions WHERE email_hash = ?').bind(key).first();
  if (blocked) {
    const message =
      blocked.reason === 'bounced'
        ? 'Email to this address bounced before. Check the address, or use a different one.'
        : 'This address has opted out of email from this site. Use a different address, or contact me to opt back in.';
    return error(409, 'suppressed', message, [{ field: 'email', message }]);
  }

  if ((await count(env, 'SELECT COUNT(*) AS n FROM report_requests WHERE email_hash = ? AND created_at > ?', key, dayAgo)) >= intVar(env, 'REPORT_PER_EMAIL_DAILY', 3, 1, 100)) {
    return error(429, 'email_limited', 'This address has received the most reports allowed in a day. Try again tomorrow.');
  }

  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const cap = intVar(env, 'REPORT_DAILY_CAP', 40, 1, 100_000);
  if ((await count(env, 'SELECT COUNT(*) AS n FROM report_requests WHERE created_at >= ?', midnight.toISOString())) >= cap) {
    console.warn(JSON.stringify({ event: 'report.daily_cap_reached', cap }));
    return error(503, 'capacity', "Today's report deliveries are used up. Try again tomorrow, or start a project and I will send it personally.");
  }

  if (!(await domainAcceptsMail(data.email.split('@')[1]))) {
    const message = 'This email domain cannot receive mail. Check the address.';
    return error(422, 'validation', `email: ${message}`, [{ field: 'email', message }]);
  }

  const id = newId();
  const now = nowIso();
  await env.DB.prepare(
    'INSERT INTO report_requests (id, audit_id, name, email, email_hash, company, note, source, consent_version, ip_key, status, created_at, updated_at) ' +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)"
  )
    .bind(id, auditId, data.name, data.email, key, data.company, data.note, data.source, CONSENT_VERSION, await ipHash(env, ip), now, now)
    .run();
  await logEvent(env, id, 'requested', `source=${data.source}; turnstile=${human.skipped ? 'off' : 'passed'}; consent=${CONSENT_VERSION}`);
  await dispatchDelivery(env, ctx, id, { apiOrigin: new URL(request.url).origin });
  return json({ id, status: 'queued', email_masked: masked }, 202);
}

async function requestStatus(request, env, id) {
  const row = await env.DB.prepare('SELECT * FROM report_requests WHERE id = ?').bind(id).first();
  if (!row) return error(404, 'not_found', 'No report request with that id.');
  if (request.headers.get('X-Admin-Key')) {
    const denied = await requireAdmin(request, env);
    if (denied) return denied;
    const { results: events } = await env.DB.prepare('SELECT kind, detail, created_at FROM report_events WHERE request_id = ? ORDER BY id').bind(id).all();
    const { results: links } = await env.DB.prepare('SELECT expires_at, revoked, views, last_viewed_at, created_at FROM report_tokens WHERE request_id = ?').bind(id).all();
    return json({ ...row, owner_notified: !!row.owner_notified, anonymized: !!row.anonymized, events, links });
  }
  return json({ id: row.id, status: row.status, email_masked: maskEmail(row.email), sent_at: row.sent_at ?? null });
}

async function openReport(request, env, ctx) {
  if (!(await hit(env, ctx, 'report_open', clientIp(request), env.RATE_LIMIT_REPORT_OPEN || '120/hour'))) {
    return error(429, 'rate_limited', 'Too many requests. Try again later.');
  }
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,128})$/.exec(request.headers.get('Authorization') || '');
  if (!m) return error(401, 'invalid_link', 'This report link is not valid. Open it from the email again.');
  const hash = await sha256Hex(m[1]);
  const link = await env.DB.prepare(
    'SELECT t.*, r.name, r.anonymized FROM report_tokens t JOIN report_requests r ON r.id = t.request_id WHERE t.token_hash = ?'
  )
    .bind(hash)
    .first();
  if (!link || link.anonymized) return error(404, 'invalid_link', 'This report link is not valid. Check that the whole link was copied from the email.');
  if (link.revoked) return json({ error: { code: 'link_revoked', message: 'This report link has been withdrawn.', audit_id: link.audit_id } }, 410);
  if (Date.parse(link.expires_at) < Date.now()) {
    return json({ error: { code: 'link_expired', message: 'This report link has expired.', audit_id: link.audit_id } }, 410);
  }
  const row = await env.DB.prepare('SELECT * FROM audits WHERE id = ?').bind(link.audit_id).first();
  if (!row || row.status !== 'completed') return error(404, 'not_found', 'The examination behind this link no longer exists.');
  ctx.waitUntil(
    (async () => {
      await env.DB.prepare('UPDATE report_tokens SET views = views + 1, last_viewed_at = ? WHERE token_hash = ?').bind(nowIso(), hash).run();
      if (!link.views) await logEvent(env, link.request_id, 'viewed', 'first view of the online report');
    })().catch((err) => console.warn('report view not recorded', err && err.message))
  );
  return json({ ...fullReport(row), link: { expires_at: link.expires_at }, requester: { first_name: firstName(link.name) } });
}

async function unsubscribe(request, env, ctx, token) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'Use POST. Open the link in the email to confirm.');
  if (!(await hit(env, ctx, 'unsubscribe', clientIp(request), '30/hour'))) return error(429, 'rate_limited', 'Too many requests. Try again later.');
  const id = await readUnsubscribeToken(env, token);
  if (!id) return error(404, 'invalid_link', 'This unsubscribe link is not valid.');
  const row = await env.DB.prepare('SELECT email_hash FROM report_requests WHERE id = ?').bind(id).first();
  if (!row) return error(404, 'invalid_link', 'This unsubscribe link is not valid.');
  const oneClick = (request.headers.get('Content-Type') || '').includes('application/x-www-form-urlencoded');
  await env.DB.prepare("INSERT INTO email_suppressions (email_hash, reason, detail, created_at) VALUES (?, 'unsubscribed', ?, ?) ON CONFLICT (email_hash) DO NOTHING")
    .bind(row.email_hash, oneClick ? 'one-click (List-Unsubscribe-Post)' : 'unsubscribe page', nowIso())
    .run();
  await logEvent(env, id, 'unsubscribed', oneClick ? 'one-click' : 'page');
  return json({ unsubscribed: true });
}

/* ------------------------------------------------------- Resend webhook */

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

/** Svix signature check, as Resend signs its webhooks. Timestamps older than five minutes are refused. */
export async function verifySvix(secret, { id, timestamp, signature }, body, now = Date.now()) {
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  let key;
  try {
    key = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  const expected = b64(await hmac(key, `${id}.${timestamp}.${body}`));
  return signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    return version === 'v1' && timingSafeEqual(sig || '', expected);
  });
}

export async function resendWebhook(request, env) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'Use POST.');
  if (!env.RESEND_WEBHOOK_SECRET) return error(503, 'not_configured', 'Webhook not configured.');
  const raw = await request.text();
  if (raw.length > 256 * 1024) return error(413, 'too_large', 'The request is too large.');
  const h = (name) => request.headers.get(`svix-${name}`) || request.headers.get(`webhook-${name}`);
  const ok = await verifySvix(env.RESEND_WEBHOOK_SECRET, { id: h('id'), timestamp: h('timestamp'), signature: h('signature') }, raw);
  if (!ok) return error(401, 'bad_signature', 'Signature check failed.');
  let evt;
  try {
    evt = JSON.parse(raw);
  } catch {
    return error(422, 'validation', 'The body must be JSON.');
  }
  const type = String(evt.type || '');
  const data = evt.data || {};
  const req = data.email_id ? await env.DB.prepare('SELECT id, email_hash FROM report_requests WHERE email_id = ?').bind(data.email_id).first() : null;
  const to = normalizeEmail(Array.isArray(data.to) ? data.to[0] : data.to);
  const suppress = async (reason, detail) => {
    const key = (req && req.email_hash) || (to ? await emailHash(env, to) : null);
    if (!key) return;
    await env.DB.prepare('INSERT INTO email_suppressions (email_hash, reason, detail, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (email_hash) DO NOTHING')
      .bind(key, reason, String(detail || '').slice(0, 300), nowIso())
      .run();
  };

  if (type === 'email.bounced') {
    const bounce = data.bounce || {};
    const permanent = !bounce.type || /permanent|hard/i.test(bounce.type);
    if (permanent) {
      await suppress('bounced', [bounce.type, bounce.subType, bounce.message].filter(Boolean).join(': '));
      if (req) {
        await env.DB.prepare("UPDATE report_requests SET status = 'bounced', last_error = ?, updated_at = ? WHERE id = ?")
          .bind(`bounced: ${bounce.message || bounce.subType || 'permanent'}`.slice(0, 300), nowIso(), req.id)
          .run();
      }
    }
    if (req) await logEvent(env, req.id, permanent ? 'bounced' : 'soft_bounce', bounce.message || bounce.type || null);
  } else if (type === 'email.complained') {
    await suppress('complained', 'marked as spam');
    if (req) await logEvent(env, req.id, 'complained', 'marked as spam by the recipient');
  } else if (req) {
    const kinds = { 'email.delivered': 'delivered', 'email.delivery_delayed': 'delayed', 'email.opened': 'opened', 'email.clicked': 'clicked', 'email.failed': 'provider_failed' };
    if (kinds[type]) await logEvent(env, req.id, kinds[type], type === 'email.clicked' ? (data.click && data.click.link) || null : null);
  }
  return json({ received: true });
}

/* ---------------------------------------------------------------- admin */

async function adminList(request, env, url) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const status = url.searchParams.get('status');
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
  const where = status ? 'WHERE r.status = ?' : '';
  const stmt = env.DB.prepare(
    'SELECT r.id, r.created_at, r.updated_at, r.sent_at, r.status, r.attempts, r.name, r.email, r.company, r.note, r.source, ' +
      'r.summary_source, r.last_error, r.owner_notified, r.anonymized, r.audit_id, a.url, a.health_score ' +
      `FROM report_requests r JOIN audits a ON a.id = r.audit_id ${where} ORDER BY r.created_at DESC LIMIT ?`
  );
  const { results } = await (status ? stmt.bind(status, limit) : stmt.bind(limit)).all();
  return json(results.map((r) => ({ ...r, owner_notified: !!r.owner_notified, anonymized: !!r.anonymized })));
}

async function adminRetry(request, env, ctx, id) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  let body = {};
  try {
    body = JSON.parse((await request.text()) || '{}') || {};
  } catch {
    body = {};
  }
  const row = await env.DB.prepare('SELECT id, status, attempts, anonymized FROM report_requests WHERE id = ?').bind(id).first();
  if (!row) return error(404, 'not_found', 'No report request with that id.');
  if (row.anonymized) return error(409, 'erased', 'This request was anonymised; there is no address to send to.');
  if (row.status === 'sent' && !(body && body.force === true)) return error(409, 'already_sent', 'Already sent. Pass {"force": true} to send it again.');
  await env.DB.prepare("UPDATE report_requests SET status = 'queued', last_error = NULL, updated_at = ? WHERE id = ?").bind(nowIso(), id).run();
  await logEvent(env, id, 'retried', row.status === 'sent' ? 'forced resend' : `was ${row.status}`);
  const how = await dispatchDelivery(env, ctx, id, { apiOrigin: new URL(request.url).origin, instanceId: `${id}-r${row.attempts}-${Date.now().toString(36)}` });
  return json({ id, status: 'queued', dispatched: how }, 202);
}

async function adminRevoke(request, env, id) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const res = await env.DB.prepare('UPDATE report_tokens SET revoked = 1 WHERE request_id = ?').bind(id).run();
  if (!res.meta.changes) return error(404, 'not_found', 'No report link for that request.');
  await logEvent(env, id, 'revoked', 'report link withdrawn by the operator');
  return json({ id, revoked: true });
}

async function adminErase(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const [body, bad] = await readJson(request);
  if (bad) return bad;
  const email = normalizeEmail(body.email);
  if (!EMAIL.test(email)) return error(422, 'validation', 'email: Enter a valid email address.', [{ field: 'email', message: 'Enter a valid email address.' }]);
  const key = await emailHash(env, email);
  const now = nowIso();
  const [, erased] = await env.DB.batch([
    env.DB.prepare('UPDATE report_tokens SET revoked = 1 WHERE request_id IN (SELECT id FROM report_requests WHERE email_hash = ?)').bind(key),
    env.DB.prepare("UPDATE report_requests SET name = '', email = '', company = NULL, note = NULL, summary = NULL, anonymized = 1, updated_at = ? WHERE email_hash = ? AND anonymized = 0").bind(now, key),
    ...(body.suppress === false
      ? []
      : [env.DB.prepare("INSERT INTO email_suppressions (email_hash, reason, detail, created_at) VALUES (?, 'manual', 'erasure request', ?) ON CONFLICT (email_hash) DO NOTHING").bind(key, now)])
  ]);
  console.log(JSON.stringify({ event: 'report.erased', requests: erased.meta.changes }));
  return json({ erased: erased.meta.changes, suppressed: body.suppress !== false });
}

async function adminStats(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const byStatus = async (since) => {
    const { results } = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM report_requests WHERE created_at >= ? GROUP BY status').bind(since).all();
    return Object.fromEntries(results.map((r) => [r.status, r.n]));
  };
  const today = await byStatus(midnight.toISOString());
  const cap = intVar(env, 'REPORT_DAILY_CAP', 40, 1, 100_000);
  const used = Object.values(today).reduce((a, b) => a + b, 0);
  const { results: supp } = await env.DB.prepare('SELECT reason, COUNT(*) AS n FROM email_suppressions GROUP BY reason').all();
  return json({
    today,
    last_7_days: await byStatus(week),
    daily_cap: cap,
    remaining_today: Math.max(0, cap - used),
    suppressions: Object.fromEntries(supp.map((r) => [r.reason, r.n])),
    turnstile: env.TURNSTILE_SECRET ? 'on' : 'off',
    workflow: env.REPORT_WORKFLOW ? 'bound' : 'inline',
    ai_summary: env.AI && !['0', 'false', 'off', 'no'].includes(String(env.REPORT_AI || '').toLowerCase()) ? 'on' : 'off'
  });
}

/* ---------------------------------------------------------------- route */

/** Routes for gated reports under /api/vector/. Returns a Response, or null when nothing matches. */
export async function reportsRoute(request, env, ctx, url) {
  const p = url.pathname;
  const m = request.method;
  let match = p.match(/^\/api\/vector\/audits\/([^/]+)\/report-requests$/);
  if (match) return m === 'POST' ? requestReport(request, env, ctx, decodeURIComponent(match[1])) : error(405, 'method_not_allowed', 'Use POST.');
  if (p === '/api/vector/report') return m === 'GET' ? openReport(request, env, ctx) : error(405, 'method_not_allowed', 'Use GET.');
  match = p.match(/^\/api\/vector\/unsubscribe\/([^/]+)$/);
  if (match) return unsubscribe(request, env, ctx, decodeURIComponent(match[1]));
  if (p === '/api/vector/report-requests' && m === 'GET') return adminList(request, env, url);
  if (p === '/api/vector/report-requests/erase' && m === 'POST') return adminErase(request, env);
  if (p === '/api/vector/report-stats' && m === 'GET') return adminStats(request, env);
  match = p.match(/^\/api\/vector\/report-requests\/([0-9a-f]{32})(?:\/(retry|revoke))?$/);
  if (match) {
    const [, id, action] = match;
    if (!action && m === 'GET') return requestStatus(request, env, id);
    if (action === 'retry' && m === 'POST') return adminRetry(request, env, ctx, id);
    if (action === 'revoke' && m === 'POST') return adminRevoke(request, env, id);
    return error(405, 'method_not_allowed', 'Method not allowed.');
  }
  if (p.startsWith('/api/vector/report-requests/')) return error(404, 'not_found', 'No report request with that id.');
  return null;
}
