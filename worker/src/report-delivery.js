/**
 * Delivery of a full Vector report by email.
 *
 * deliverReport() is the whole pipeline as durable steps:
 *
 *   prepare        load the request, stop if it was sent, suppressed or erased
 *   summarize      plain-English summary (Workers AI, rules as fallback), stored
 *   send report    issue the report link, render, send through Resend
 *   mark failed    only when sending failed for good
 *   notify owner   tell the site owner about the lead, sent or not
 *
 * In production it runs inside the ReportDeliveryWorkflow (src/workflow.js),
 * so each step is retried with backoff and survives the request ending. When
 * the Workflow binding is missing (local tests) or refuses a new instance, the
 * same function runs in ctx.waitUntil with a small retry wrapper, and the
 * cron sweep re-dispatches anything left queued.
 *
 * Every step re-reads its state from D1 and returns only ids and statuses, so
 * no address or report content is kept in Workflow state.
 */
import { auditOut, fullPrescription, parse } from './audit-view.js';
import { nowIso } from './http.js';
import { notify, sendEmail, ResendError } from './notify.js';
import { renderReportEmail } from './report-email.js';
import { summaryFacts, writeSummary } from './report-summary.js';
import { maskEmail, reportToken, sha256Hex, unsubscribeToken } from './secure.js';

export const DEFAULT_SITE_URL = 'https://www.lracdimension.online';
const truthy = (v) => ['1', 'true', 'yes'].includes(String(v || '').toLowerCase());

export function intVar(env, name, fallback, min = 0, max = 1e9) {
  const n = parseInt(env[name], 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

export const siteUrl = (env) => (env.SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '');
export const linkDays = (env) => intVar(env, 'REPORT_LINK_DAYS', 30, 1, 365);

/** One line in the request's audit trail, mirrored to the Worker logs as JSON. */
export async function logEvent(env, requestId, kind, detail = null) {
  const created = nowIso();
  console.log(JSON.stringify({ event: `report.${kind}`, request: requestId, detail }));
  await env.DB.prepare('INSERT INTO report_events (request_id, kind, detail, created_at) VALUES (?, ?, ?, ?)')
    .bind(requestId, kind, detail === null ? null : String(detail).slice(0, 500), created)
    .run();
}

async function setRequest(env, id, fields) {
  const keys = Object.keys(fields);
  await env.DB.prepare(`UPDATE report_requests SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
    .bind(...keys.map((k) => fields[k]), nowIso(), id)
    .run();
}

const loadRequest = (env, id) => env.DB.prepare('SELECT * FROM report_requests WHERE id = ?').bind(id).first();
const loadAudit = (env, id) => env.DB.prepare('SELECT * FROM audits WHERE id = ?').bind(id).first();

const auditView = auditOut;

/* ------------------------------------------------------------------ steps */

async function prepare(env, id) {
  const row = await loadRequest(env, id);
  if (!row) return { done: true, status: 'missing' };
  if (row.anonymized) return { done: true, status: 'erased' };
  if (['sent', 'suppressed', 'bounced'].includes(row.status)) return { done: true, status: row.status };
  const blocked = await env.DB.prepare('SELECT reason FROM email_suppressions WHERE email_hash = ?').bind(row.email_hash).first();
  if (blocked) {
    await setRequest(env, id, { status: 'suppressed', last_error: `address suppressed (${blocked.reason})` });
    await logEvent(env, id, 'suppressed', blocked.reason);
    return { done: true, status: 'suppressed' };
  }
  await setRequest(env, id, { status: 'sending', attempts: row.attempts + 1 });
  await logEvent(env, id, 'processing', `attempt ${row.attempts + 1}`);
  return { done: false };
}

async function summarize(env, id) {
  const row = await loadRequest(env, id);
  if (row.summary) return { source: row.summary_source };
  const audit = await loadAudit(env, row.audit_id);
  const facts = summaryFacts(auditView(audit), parse(audit.issues, []), fullPrescription(audit));
  const { text, source } = await writeSummary(env, facts);
  await setRequest(env, id, { summary: text, summary_source: source });
  await logEvent(env, id, 'summarized', source);
  return { source };
}

/** Issues the report link for a request and returns {token, url}. Safe to call again: same token, first expiry kept. */
export async function issueReportLink(env, row) {
  const token = await reportToken(env, row.id);
  const expires = new Date(Date.now() + linkDays(env) * 86_400_000).toISOString();
  await env.DB.prepare('INSERT OR IGNORE INTO report_tokens (token_hash, request_id, audit_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256Hex(token), row.id, row.audit_id, expires, nowIso())
    .run();
  return { token, url: `${siteUrl(env)}/vector/report/#t=${token}` };
}

async function sendReport(env, id, params) {
  const row = await loadRequest(env, id);
  if (row.status === 'sent') return { status: 'sent' };
  const dryRun = truthy(env.REPORT_EMAIL_DRY_RUN);
  if (!env.RESEND_API_KEY && !dryRun) {
    await setRequest(env, id, { status: 'skipped', last_error: 'Email is not configured (RESEND_API_KEY is not set).' });
    await logEvent(env, id, 'skipped', 'email not configured');
    return { status: 'skipped' };
  }
  const audit = await loadAudit(env, row.audit_id);
  const link = await issueReportLink(env, row);
  const unsub = await unsubscribeToken(env, id);
  const apiBase = (env.API_URL || params.apiOrigin || '').replace(/\/$/, '');
  const replyTo = env.REPORT_REPLY_TO || env.NOTIFY_EMAIL || '';
  const email = renderReportEmail({
    name: row.name,
    audit: auditView(audit),
    results: parse(audit.results, []),
    issues: parse(audit.issues, []),
    prescription: fullPrescription(audit),
    summary: row.summary,
    summarySource: row.summary_source,
    reportUrl: link.url,
    linkDays: linkDays(env),
    unsubscribeUrl: `${siteUrl(env)}/vector/unsubscribe/#t=${unsub}`,
    siteUrl: siteUrl(env),
    canReply: !!replyTo
  });

  let emailId;
  if (dryRun) {
    emailId = `dry-run-${id.slice(0, 8)}`;
    console.log(JSON.stringify({ event: 'report.dry_run', request: id, to: maskEmail(row.email), subject: email.subject, html_bytes: email.html.length, text_bytes: email.text.length, report_url: link.url }));
  } else {
    const headers = {};
    if (apiBase) {
      // RFC 8058 one-click unsubscribe: mail clients POST to this URL.
      headers['List-Unsubscribe'] = `<${apiBase}/api/vector/unsubscribe/${unsub}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
    try {
      const out = await sendEmail(env, {
        to: row.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
        replyTo: replyTo || undefined,
        // Same key for every retry of this attempt, so Resend never sends it twice.
        idempotencyKey: `report-${id}-${row.attempts}`,
        headers,
        tags: [
          { name: 'kind', value: 'vector_report' },
          { name: 'request', value: id }
        ]
      });
      emailId = out.id;
    } catch (err) {
      if (err instanceof ResendError && err.permanent) {
        await logEvent(env, id, 'send_failed', err.message);
        return { status: 'failed', error: err.message };
      }
      await logEvent(env, id, 'send_retry', (err && err.message) || 'error');
      throw err;
    }
  }
  await setRequest(env, id, { status: 'sent', email_id: emailId, sent_at: nowIso(), last_error: null });
  await logEvent(env, id, 'sent', emailId);
  return { status: 'sent' };
}

async function markFailed(env, id, message) {
  await setRequest(env, id, { status: 'failed', last_error: String(message || 'delivery failed').slice(0, 300) });
  await logEvent(env, id, 'failed', message);
  return { status: 'failed' };
}

async function notifyOwner(env, id) {
  const row = await loadRequest(env, id);
  if (!row || row.owner_notified || row.anonymized) return { notified: !!(row && row.owner_notified) };
  const configured = (env.RESEND_API_KEY && env.NOTIFY_EMAIL) || env.NOTIFY_WEBHOOK;
  if (!configured) return { notified: false };
  const auditRow = await loadAudit(env, row.audit_id);
  const audit = auditView(auditRow);
  const issues = parse(auditRow.issues, []);
  let host = audit.url;
  try {
    host = new URL(audit.summary.final_url || audit.url).hostname;
  } catch {}
  const link = await issueReportLink(env, row);
  const delivered = row.status === 'sent';
  const subject = delivered
    ? `[LRACDIMENSION] Report lead: ${host} (${audit.health_score}/100) — ${row.name}`
    : `[LRACDIMENSION] Report NOT delivered (${row.status}): ${host} — ${row.name}`;
  const payload = {
    id,
    name: row.name,
    email: row.email,
    company: row.company,
    website: audit.summary.final_url || audit.url,
    health_score: audit.health_score,
    biggest_problem: row.note,
    delivery: row.status === 'sent' ? `sent ${row.sent_at}` : `${row.status}: ${row.last_error || 'no detail'}`,
    top_issues: issues.slice(0, 5).map((i) => `[${i.severity}] ${i.title}`),
    full_report: link.url,
    summary: row.summary,
    source: row.source,
    requested_at: row.created_at
  };
  if (truthy(env.REPORT_EMAIL_DRY_RUN)) {
    console.log(JSON.stringify({ event: 'report.owner_dry_run', request: id, subject }));
    await setRequest(env, id, { owner_notified: 1 });
    return { notified: true };
  }
  const result = await notify(env, subject, payload);
  if (!Object.values(result).some(Boolean)) throw new Error('owner notification failed on every channel');
  await setRequest(env, id, { owner_notified: 1 });
  await logEvent(env, id, 'owner_notified', Object.keys(result).filter((k) => result[k]).join(','));
  return { notified: true };
}

/* --------------------------------------------------------------- pipeline */

const RETRY = {
  prepare: { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' }, timeout: '30 seconds' },
  summarize: { retries: { limit: 2, delay: '10 seconds', backoff: 'linear' }, timeout: '1 minute' },
  send: { retries: { limit: 5, delay: '30 seconds', backoff: 'exponential' }, timeout: '1 minute' },
  mark: { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' }, timeout: '30 seconds' },
  notify: { retries: { limit: 3, delay: '1 minute', backoff: 'exponential' }, timeout: '1 minute' }
};

/**
 * Runs the pipeline with `step` (a Workflow step, or inlineStep()). Returns
 * {status}. Only the owner notification may fail after the email is out, and
 * it never resends the email.
 */
export async function deliverReport(env, requestId, step, params = {}) {
  const prep = await step.do('prepare', RETRY.prepare, () => prepare(env, requestId));
  if (prep.done) return { status: prep.status };
  await step.do('summarize', RETRY.summarize, () => summarize(env, requestId));
  let sent;
  try {
    sent = await step.do('send report', RETRY.send, () => sendReport(env, requestId, params));
  } catch (err) {
    sent = { status: 'failed', error: `gave up after retries: ${(err && err.message) || 'send failed'}` };
  }
  if (sent.status === 'failed') await step.do('mark failed', RETRY.mark, () => markFailed(env, requestId, sent.error));
  try {
    await step.do('notify owner', RETRY.notify, () => notifyOwner(env, requestId));
  } catch (err) {
    console.error(`report ${requestId}: owner notification failed`, err && err.message);
  }
  return { status: sent.status };
}

/**
 * The Workflow step contract without the Workflow: up to `attempts` tries of
 * each step with a short pause, inside the 30 seconds ctx.waitUntil allows.
 */
export function inlineStep(env) {
  const attempts = intVar(env, 'REPORT_INLINE_ATTEMPTS', 3, 1, 5);
  const pause = intVar(env, 'REPORT_INLINE_RETRY_MS', 1500, 0, 10_000);
  return {
    async do(name, config, fn) {
      if (typeof config === 'function') fn = config;
      const limit = Math.min(attempts, ((config && config.retries && config.retries.limit) ?? 0) + 1);
      let last;
      for (let i = 0; i < limit; i++) {
        try {
          return await fn();
        } catch (err) {
          last = err;
          if (i < limit - 1 && pause) await new Promise((r) => setTimeout(r, pause * (i + 1)));
        }
      }
      throw last;
    }
  };
}

/**
 * Start delivery for a request: a Workflow instance when the binding exists,
 * otherwise (or if the Workflow refuses) inline. Returns 'workflow' or 'inline'.
 */
export async function dispatchDelivery(env, ctx, requestId, { apiOrigin = '', instanceId = requestId } = {}) {
  if (env.REPORT_WORKFLOW && typeof env.REPORT_WORKFLOW.create === 'function') {
    try {
      await env.REPORT_WORKFLOW.create({ id: instanceId, params: { requestId, apiOrigin } });
      await logEvent(env, requestId, 'dispatched', `workflow ${instanceId}`);
      return 'workflow';
    } catch (err) {
      console.error(`report ${requestId}: workflow create failed, delivering inline`, err && err.message);
    }
  }
  await logEvent(env, requestId, 'dispatched', 'inline');
  ctx.waitUntil(
    deliverReport(env, requestId, inlineStep(env), { apiOrigin }).catch((err) =>
      console.error(`report ${requestId}: inline delivery crashed`, (err && err.stack) || err)
    )
  );
  return 'inline';
}

/* ------------------------------------------------------------ maintenance */

const STUCK_MINUTES = 30;
const MAX_RECOVERY_ATTEMPTS = 4;

/**
 * Cron backstop and retention, a handful of queries per run:
 * - re-dispatch at most two requests left queued or sending for 30 minutes
 *   (a Workflow that was never created, or an inline run the platform cut off);
 * - hourly: drop report links expired for 30 days, anonymise requests and
 *   delete their events after REPORT_RETENTION_DAYS (default 365).
 */
export async function reportMaintenance(env, ctx, scheduledTime = Date.now()) {
  const now = new Date(scheduledTime);
  const cutoff = new Date(now.getTime() - STUCK_MINUTES * 60_000).toISOString();
  const { results: stuck } = await env.DB.prepare(
    "SELECT id, attempts FROM report_requests WHERE status IN ('queued', 'sending') AND updated_at < ? AND attempts < ? AND anonymized = 0 ORDER BY updated_at LIMIT 2"
  )
    .bind(cutoff, MAX_RECOVERY_ATTEMPTS)
    .all();
  for (const r of stuck) {
    await setRequest(env, r.id, { status: 'queued' });
    await logEvent(env, r.id, 'recovered', `stuck since before ${cutoff}`);
    await dispatchDelivery(env, ctx, r.id, { instanceId: `${r.id}-c${r.attempts}-${now.getTime().toString(36)}` });
  }
  // Requests that ran out of recovery attempts are failed for good, so the owner can see and retry them.
  await env.DB.prepare(
    "UPDATE report_requests SET status = 'failed', last_error = 'Gave up: still undelivered after repeated recovery.', updated_at = ? WHERE status IN ('queued', 'sending') AND updated_at < ? AND attempts >= ? AND anonymized = 0"
  )
    .bind(now.toISOString(), cutoff, MAX_RECOVERY_ATTEMPTS)
    .run();

  if (now.getUTCMinutes() >= 5) return { recovered: stuck.length };
  const retention = intVar(env, 'REPORT_RETENTION_DAYS', 365, 7, 3650);
  const old = new Date(now.getTime() - retention * 86_400_000).toISOString();
  const expired = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM report_tokens WHERE expires_at < ?').bind(expired),
    env.DB.prepare("UPDATE report_requests SET name = '', email = '', company = NULL, note = NULL, summary = NULL, anonymized = 1 WHERE anonymized = 0 AND created_at < ?").bind(old),
    env.DB.prepare('DELETE FROM report_events WHERE created_at < ?').bind(old)
  ]);
  return { recovered: stuck.length, retention: true };
}
