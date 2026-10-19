/**
 * Notification channels, ported from the Python API's services/notify.py.
 * Each channel is optional and configured by environment; `notify` fans out
 * to whichever are configured and never throws.
 */

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';
export const DEFAULT_FROM = 'LRACDIMENSION <onboarding@resend.dev>';
const TIMEOUT_MS = 10000;

// Labels for the readable email body. Anything else in a payload is listed under its own key.
const LABELS = {
  name: 'Name',
  email: 'Email',
  company: 'Company',
  website: 'Website',
  project_type: 'Project type',
  budget_range: 'Budget',
  timeline: 'Timeline',
  problem: 'The problem',
  current_system: 'Current system',
  desired_outcome: 'Desired outcome',
  classification: 'Triage (internal)',
  id: 'Submission id'
};

const isEmpty = (v) =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) ||
  (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);

/** Plain-text body a person can read in an inbox. */
export function readable(payload) {
  const keys = [...Object.keys(LABELS).filter((k) => k in payload), ...Object.keys(payload).filter((k) => !(k in LABELS))];
  const lines = [];
  for (const key of keys) {
    let value = payload[key];
    if (isEmpty(value)) continue;
    if (Array.isArray(value)) value = value.join(', ');
    else if (typeof value === 'object') {
      value = Object.entries(value).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(', ');
    }
    const label = LABELS[key] || key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
    const text = String(value);
    lines.push(text.includes('\n') || text.length > 70 ? `${label}:\n${text}\n` : `${label}: ${text}`);
  }
  return lines.join('\n');
}

const truthy = (v) => ['1', 'true', 'yes'].includes(String(v || '').toLowerCase());
const sender = (env) => env.RESEND_FROM || DEFAULT_FROM;

/**
 * Send one plain-text email through Resend. Returns false when Resend is not
 * configured; throws on an HTTP error. The key travels only in the
 * Authorization header and is never logged.
 */
export async function sendResend(env, to, subject, text, { replyTo, idempotencyKey } = {}) {
  if (!(env.RESEND_API_KEY && to)) return false;
  const body = { from: sender(env), to: [to], subject: subject.slice(0, 200), text };
  if (replyTo) body.reply_to = replyTo;
  const headers = { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' };
  // Resend drops a second request with the same key, so a retry never sends twice.
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey.slice(0, 256);
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (res.status >= 400) {
    let reason = '';
    try {
      reason = (await res.json()).message || '';
    } catch {
      reason = '';
    }
    throw new Error(`Resend returned ${res.status}: ${reason}`.slice(0, 300));
  }
  return true;
}

async function webhook(env, subject, payload) {
  if (!env.NOTIFY_WEBHOOK) return false;
  // Google Apps Script answers a POST with a redirect after running doPost;
  // the redirect is not followed because the work is already done.
  const res = await fetch(env.NOTIFY_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, ...payload }),
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (res.status >= 400) throw new Error(`webhook returned ${res.status}`);
  return true;
}

async function resend(env, subject, payload) {
  const submitter = typeof payload.email === 'string' ? payload.email : undefined;
  return sendResend(env, env.NOTIFY_EMAIL, subject, readable(payload), {
    replyTo: submitter, // answering the alert answers the visitor
    idempotencyKey: payload.id ? `notify-${payload.id}` : undefined
  });
}

/** Returns which channels delivered. Failures are logged, not thrown. */
export async function notify(env, subject, payload) {
  const channels = { webhook, resend };
  const names = Object.keys(channels);
  const results = await Promise.allSettled(names.map((n) => channels[n](env, subject, payload)));
  const delivered = {};
  results.forEach((r, i) => {
    delivered[names[i]] = r.status === 'fulfilled' && r.value === true;
    if (r.status === 'rejected') console.warn(`${names[i]} notification failed: ${r.reason && r.reason.message}`);
  });
  return delivered;
}

/**
 * Optional confirmation email to the person who sent the intake form
 * (RESEND_AUTOREPLY). Needs a verified sending domain. Never throws.
 */
export async function acknowledge(env, to, name, projectType, submissionId) {
  if (!(truthy(env.RESEND_AUTOREPLY) && env.RESEND_API_KEY && to)) return false;
  if (/@resend\.dev>?$/.test(sender(env))) {
    console.warn('autoreply skipped: verify a sending domain in Resend and set RESEND_FROM first');
    return false;
  }
  const first = (name || '').split(/\s+/)[0] || 'there';
  const text =
    `Hi ${first},\n\n` +
    `Thanks — your ${String(projectType).toLowerCase()} inquiry reached me. I read every one myself, and you will get ` +
    'a written reply within one business day with a straight answer on whether it is a fit.\n\n' +
    'If anything changes in the meantime, just reply to this email.\n\n' +
    'John Carl Dimatulac\nLRACDIMENSION';
  try {
    return await sendResend(env, to, 'Your project inquiry is in — LRACDIMENSION', text, {
      replyTo: env.NOTIFY_EMAIL || undefined,
      idempotencyKey: `ack-${submissionId}`
    });
  } catch (err) {
    console.warn(`autoreply failed: ${err.message}`);
    return false;
  }
}
