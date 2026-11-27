/**
 * Client websites: monitoring through Signal, scores through Vector.
 *
 * Where each number comes from:
 *  - status, last response, ssl_valid: the site's Signal target
 *    (monitoring_targets), checked every 5 minutes by the cron.
 *  - uptime %, average response, incidents: studio_uptime_days, rolled up
 *    hourly from Signal's check and incident events (rollupUptime below).
 *    Uptime counts a check as down only when Signal found the site
 *    unavailable; degraded (slow, 4xx) and bot-challenged sites count as up.
 *  - health and the eight category scores: the latest completed Vector audit
 *    whose website host is the site's host. "Visibility" is the mean of
 *    Vector's SEO and AI-visibility category scores.
 *  - SSL and domain expiry dates are not measured (a Worker cannot read a
 *    remote certificate or WHOIS) and are always null.
 *
 * Every view here costs a fixed number of queries however many sites there
 * are, which keeps requests far inside the free plan's 50 per invocation.
 */
import { checkTarget, createTarget } from '../signal.js';
import { auditOut, fullReport, parse } from '../audit-view.js';
import { isStale, loadAudit } from '../vector.js';
import { DAY_MS, addDays, all, avg, first, round1, stmt, today } from './util.js';

export const CATEGORIES = ['technical', 'seo', 'performance', 'accessibility', 'security', 'links', 'content', 'ai'];
export const UPTIME_WINDOW_DAYS = 30;

/** Mean of Vector's SEO and AI-visibility scores: how findable the site is by search engines and AI assistants. */
export function visibilityOf(scores) {
  const v = [scores?.seo, scores?.ai].filter((x) => typeof x === 'number');
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

const pct = (checks, down) => (checks ? Math.round(((checks - down) / checks) * 100_000) / 1000 : null);

/**
 * Site rows for a WHERE clause on studio_sites `s` (e.g. "s.client_id = ?").
 * Three queries: sites with their target, uptime aggregates, latest audits.
 */
export async function siteSummaries(env, where = '1 = 1', ...args) {
  const sites = await all(
    env,
    `SELECT s.*, c.company, t.status AS mon_status, t.last_checked_at, t.last_response_ms, t.last_status_code, t.ssl_valid, t.enabled AS mon_enabled
       FROM studio_sites s JOIN studio_clients c ON c.id = s.client_id LEFT JOIN monitoring_targets t ON t.id = s.target_id
      WHERE ${where} ORDER BY c.company, s.created_at`,
    ...args
  );
  if (!sites.length) return [];
  const t = today();
  const [uptime, audits] = await Promise.all([
    all(
      env,
      `SELECT u.target_id, SUM(u.checks) AS checks, SUM(u.down) AS down,
              SUM(CASE WHEN u.day >= ? THEN u.response_ms_total ELSE 0 END) AS rt, SUM(CASE WHEN u.day >= ? THEN u.response_samples ELSE 0 END) AS rs,
              SUM(CASE WHEN u.day >= ? THEN u.incidents ELSE 0 END) AS incidents7
         FROM studio_uptime_days u WHERE u.day >= ? AND u.target_id IN (SELECT s.target_id FROM studio_sites s WHERE ${where}) GROUP BY u.target_id`,
      addDays(t, -6),
      addDays(t, -6),
      addDays(t, -6),
      addDays(t, -(UPTIME_WINDOW_DAYS - 1)),
      ...args
    ),
    latestAudits(env, where, false, ...args)
  ]);
  const up = new Map(uptime.map((u) => [u.target_id, u]));
  const au = new Map(audits.map((a) => [a.host, a]));
  return sites.map((s) => siteOut(s, up.get(s.target_id), au.get(s.host)));
}

/** The latest completed Vector audit per site host (optionally with its issues). */
export function latestAudits(env, where, withIssues, ...args) {
  return all(
    env,
    `SELECT w.host, a.id, a.health_score, a.scores, a.completed_at, json_array_length(COALESCE(a.issues, '[]')) AS issue_count${withIssues ? ', a.issues' : ''}
       FROM audits a JOIN websites w ON w.id = a.website_id
      WHERE a.status = 'completed' AND w.host IN (SELECT s.host FROM studio_sites s WHERE ${where})
        AND a.completed_at = (SELECT MAX(a2.completed_at) FROM audits a2 WHERE a2.website_id = a.website_id AND a2.status = 'completed')`,
    ...args
  );
}

export function siteOut(s, uptime, audit) {
  const scores = audit ? parse(audit.scores, {}) : null;
  return {
    id: s.id,
    clientId: s.client_id,
    company: s.company ?? null,
    name: s.name,
    url: s.url,
    host: s.host,
    platform: s.platform,
    hosting: s.hosting,
    notes: s.notes,
    createdAt: s.created_at,
    monitoring: {
      targetId: s.target_id ?? null,
      status: s.target_id && s.mon_enabled !== 0 ? s.mon_status || 'unknown' : 'not_monitored',
      lastCheckedAt: s.last_checked_at ?? null,
      lastResponseMs: s.last_response_ms ?? null,
      lastStatusCode: s.last_status_code ?? null
    },
    uptime30: uptime ? pct(uptime.checks, uptime.down) : null,
    avgResponseMs: uptime && uptime.rs ? Math.round(uptime.rt / uptime.rs) : null,
    incidents7d: uptime ? uptime.incidents7 || 0 : 0,
    sslValid: s.ssl_valid === null || s.ssl_valid === undefined ? null : Boolean(s.ssl_valid),
    sslDaysLeft: null, // not measured: a Worker cannot read the remote certificate
    domainDaysLeft: null, // not measured: no WHOIS from a Worker
    health: audit ? audit.health_score : null,
    visibility: audit ? visibilityOf(scores) : null,
    scores,
    lastAuditId: audit ? audit.id : null,
    lastAuditAt: audit ? audit.completed_at : null,
    openIssues: audit ? audit.issue_count || 0 : 0
  };
}

/* ------------------------------------------------------------ monitoring */

/**
 * The Signal target for a new site. An existing target for the host is
 * reused; one registered by a public scan becomes a studio target (checked
 * every 5 minutes, off the public feed); an operator target stays as it is.
 * A new target is named after the host, not the site, so nothing about the
 * client is stored on Signal's side. Its first check runs in the background.
 */
export async function ensureTarget(env, ctx, url, host) {
  const existing = await first(env, "SELECT * FROM monitoring_targets WHERE host = ? ORDER BY (source = 'admin') DESC, enabled DESC, created_at ASC LIMIT 1", host);
  if (existing) {
    if (existing.source !== 'admin' && (existing.source !== 'studio' || !existing.enabled)) {
      await env.DB.prepare("UPDATE monitoring_targets SET source = 'studio', enabled = 1 WHERE id = ?").bind(existing.id).run();
    }
    return existing.id;
  }
  const target = await createTarget(env, host, url, host, 'studio');
  ctx.waitUntil(checkTarget(env, target).catch((err) => console.error(`first check failed for ${url}`, (err && err.stack) || err)));
  return target.id;
}

/** Stop checking a target no remaining studio site uses (operator and public targets are left alone). */
export function releaseTargetStmt(env, targetId, siteId) {
  return stmt(
    env,
    "UPDATE monitoring_targets SET enabled = 0 WHERE id = ? AND source = 'studio' AND NOT EXISTS (SELECT 1 FROM studio_sites WHERE target_id = ? AND id <> ?)",
    targetId,
    targetId,
    siteId
  );
}

/**
 * Cron: fold Signal's check and incident events into studio_uptime_days for
 * studio sites' targets. Runs hourly over the current day (and the previous
 * one just after midnight); once a day over the 14 days Signal keeps, which
 * also backfills a newly deployed database. Reads only studio targets' events,
 * through the (target_id, created_at) index.
 */
export async function rollupUptime(env, now = Date.now(), { days } = {}) {
  const hour = new Date(now).getUTCHours();
  const span = days ?? (hour === 3 ? 14 : 1);
  const since = `${today(now - 70 * 60_000 - (span - 1) * DAY_MS)}T00:00:00.000Z`;
  await env.DB.prepare(
    `INSERT INTO studio_uptime_days (target_id, day, checks, down, response_ms_total, response_samples, incidents, updated_at)
     SELECT e.target_id, substr(e.created_at, 1, 10),
            SUM(CASE WHEN e.kind = 'check' THEN 1 ELSE 0 END),
            SUM(CASE WHEN e.kind = 'check' AND e.message LIKE 'Unavailable%' THEN 1 ELSE 0 END),
            SUM(CASE WHEN e.kind = 'check' AND e.response_ms IS NOT NULL THEN e.response_ms ELSE 0 END),
            SUM(CASE WHEN e.kind = 'check' AND e.response_ms IS NOT NULL THEN 1 ELSE 0 END),
            SUM(CASE WHEN e.kind = 'incident' THEN 1 ELSE 0 END),
            ?
       FROM signal_events e
      WHERE e.target_id IN (SELECT DISTINCT target_id FROM studio_sites WHERE target_id IS NOT NULL)
        AND e.created_at >= ? AND e.kind IN ('check', 'incident')
      GROUP BY e.target_id, substr(e.created_at, 1, 10)
     ON CONFLICT (target_id, day) DO UPDATE SET checks = excluded.checks, down = excluded.down, response_ms_total = excluded.response_ms_total,
        response_samples = excluded.response_samples, incidents = excluded.incidents, updated_at = excluded.updated_at`
  )
    .bind(new Date(now).toISOString(), since)
    .run();
}

/* ------------------------------------------------------------ one site in full */

/**
 * Incidents from Signal's transition events: each 'incident' (the site
 * became unavailable) ends at the next transition to another state.
 */
function incidentsFrom(events) {
  const out = [];
  const asc = [...events].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  for (let i = 0; i < asc.length; i++) {
    if (asc[i].kind !== 'incident') continue;
    const end = asc.slice(i + 1).find((e) => e.kind !== 'incident' && e.kind !== 'ssl');
    out.push({
      start: asc[i].created_at,
      end: end ? end.created_at : null,
      minutes: end ? Math.max(1, Math.round((Date.parse(end.created_at) - Date.parse(asc[i].created_at)) / 60_000)) : null,
      cause: asc[i].status_code ? `HTTP ${asc[i].status_code}` : 'No response',
      ongoing: !end
    });
  }
  return out.reverse();
}

const brokenLinks = (results) => {
  const links = results.find((r) => r.category === 'links');
  return links && Array.isArray(links.metrics?.broken) ? links.metrics.broken.length : null;
};

/** Everything the site page shows. `site` is a siteSummaries row. */
export async function siteReport(env, site) {
  const t = today();
  const targetId = site.monitoring.targetId;
  const [days, events, audits] = await Promise.all([
    targetId ? all(env, 'SELECT * FROM studio_uptime_days WHERE target_id = ? AND day >= ? ORDER BY day ASC', targetId, addDays(t, -89)) : [],
    targetId
      ? all(env, "SELECT kind, level, message, status_code, response_ms, created_at FROM signal_events WHERE target_id = ? AND kind IN ('incident', 'recovered', 'warning', 'status_change', 'ssl') ORDER BY created_at DESC LIMIT 200", targetId)
      : [],
    all(
      env,
      'SELECT a.* FROM audits a JOIN websites w ON w.id = a.website_id WHERE w.host = ? ORDER BY a.created_at DESC LIMIT 20',
      site.host
    )
  ]);
  const windowStats = (n) => {
    const from = addDays(t, -(n - 1));
    const rows = days.filter((d) => d.day >= from);
    const checks = rows.reduce((a, d) => a + d.checks, 0);
    return pct(checks, rows.reduce((a, d) => a + d.down, 0));
  };
  const completed = audits.filter((a) => a.status === 'completed').sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1));
  const latest = completed[0] || null;
  let pending = audits.find((a) => a.status === 'queued' || a.status === 'running') || null;
  if (pending && isStale(pending)) pending = await loadAudit(env, pending.id); // marks it failed
  if (pending && pending.status !== 'queued' && pending.status !== 'running') pending = null;
  const lastFailed = audits.find((a) => a.status === 'failed');
  const report = latest ? fullReport(latest) : null;
  return {
    site,
    audit: report ? { ...report.audit, results: report.results, issues: report.issues, prescription: report.prescription } : null,
    pendingAudit: pending ? auditOut(pending) : null,
    lastFailedAudit: lastFailed && (!latest || lastFailed.created_at > latest.created_at) ? auditOut(lastFailed) : null,
    history: completed
      .slice(0, 12)
      .reverse()
      .map((a) => ({ id: a.id, date: a.completed_at, health: a.health_score, visibility: visibilityOf(parse(a.scores, {})), scores: parse(a.scores, {}) })),
    brokenLinks: report ? brokenLinks(report.results) : null,
    uptime: {
      days: days.map((d) => ({
        date: d.day,
        uptimePct: pct(d.checks, d.down),
        checks: d.checks,
        avgResponseMs: d.response_samples ? Math.round(d.response_ms_total / d.response_samples) : null,
        incidents: d.incidents
      })),
      pct7: windowStats(7),
      pct30: windowStats(30),
      pct90: windowStats(90),
      checks30: days.filter((d) => d.day >= addDays(t, -29)).reduce((a, d) => a + d.checks, 0),
      incidents: incidentsFrom(events).slice(0, 20),
      downtimeMinutes30: round1(
        incidentsFrom(events)
          .filter((i) => i.start >= `${addDays(t, -29)}T`)
          .reduce((a, i) => a + (i.minutes || 0), 0)
      )
    },
    ssl: {
      valid: site.sslValid,
      expiresAt: null,
      note: 'Signal confirms the certificate is valid on every https check. The expiry date is not measured.'
    }
  };
}

export const avgOf = (values) => {
  const v = values.filter((x) => typeof x === 'number');
  const a = avg(v);
  return a === null ? null : Math.round(a);
};
