/**
 * The dashboard's website audit is a Vector examination (src/vector.js), not a
 * scanner of its own: starting one queues it exactly as the public site does,
 * except unlisted, so client and prospect sites never appear on the public
 * "recently examined" list. The dashboard polls GET /v1/admin/audits/{id}
 * until the status is completed or failed.
 */
import { auditOut, fullReport, parse } from '../audit-view.js';
import { hit } from '../ratelimit.js';
import { UnsafeURL } from '../ssrf.js';
import { createAudit, isStale, loadAudit } from '../vector.js';
import { HttpError, Invalid, all, notFound, str } from './util.js';
import { visibilityOf } from './sites.js';

/**
 * Queue an examination. `key` scopes the rate limit (an admin, or a client
 * user). Returns auditOut of the queued audit.
 */
export async function startAudit(env, ctx, rawUrl, { key, limit }) {
  if (!(await hit(env, ctx, 'studio_audits', key, limit))) {
    throw new HttpError(429, 'rate_limited', 'Too many examinations started. Try again later.');
  }
  try {
    return auditOut(await createAudit(env, ctx, rawUrl, { listed: false }));
  } catch (err) {
    if (err instanceof UnsafeURL) throw new Invalid('url', err.message);
    throw err;
  }
}

export async function adminStart({ env, ctx, body, user }) {
  const url = str(body, 'url', { min: 3, max: 2048, required: true });
  return startAudit(env, ctx, url, { key: `user:${user.id}`, limit: env.RATE_LIMIT_STUDIO_AUDITS || '30/hour' });
}

/** The 40 most recent examinations, public and studio, with the studio site they belong to. */
export async function recentAudits({ env }) {
  const rows = await all(
    env,
    `SELECT a.id, a.url, a.status, a.stage, a.health_score, a.scores, a.listed, a.created_at, a.started_at, a.completed_at, w.host,
            (SELECT s.id FROM studio_sites s WHERE s.host = w.host LIMIT 1) AS site_id
       FROM audits a JOIN websites w ON w.id = a.website_id ORDER BY a.created_at DESC LIMIT 40`
  );
  return rows.map((r) => {
    const scores = parse(r.scores, {});
    return {
      id: r.id,
      url: r.url,
      host: r.host,
      // An examination the platform stopped is failed; GET /audits/{id} records that.
      status: isStale(r) ? 'failed' : r.status,
      healthScore: r.health_score ?? null,
      visibility: r.status === 'completed' ? visibilityOf(scores) : null,
      scores,
      source: r.listed ? 'public' : 'studio',
      siteId: r.site_id ?? null,
      createdAt: r.created_at,
      completedAt: r.completed_at ?? null
    };
  });
}

/** One examination: progress while it runs, the full report once completed. */
export async function auditDetail({ env, params }) {
  const row = await loadAudit(env, params.id);
  if (!row) throw notFound('No examination with that id.');
  if (row.status !== 'completed') return { audit: auditOut(row), results: [], issues: [], prescription: [] };
  const r = fullReport(row);
  return { audit: r.audit, results: r.results, issues: r.issues, prescription: r.prescription };
}
