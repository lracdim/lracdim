/**
 * Vector: website examinations, ported from api/app/routes/vector.py and
 * services/audit_service.py.
 *
 * POST /api/vector/audits answers 202 at once and runs the examination in
 * the background (ctx.waitUntil); the site polls GET /api/vector/audits/{id}
 * for the stage list, then reads /results. Results, issues and the
 * prescription are stored as JSON on the audit row, which keeps one
 * examination well under the free plan's 50 database queries.
 */
import { auditOut, briefReport, fullReport, parse } from './audit-view.js';
import { FetchError, Budget, fetchPage } from './fetcher.js';
import { error, fieldError, json, newId, nowIso, readJson, requireAdmin, stringField, clientIp } from './http.js';
import { pageContext } from './page.js';
import { hit } from './ratelimit.js';
import { WEIGHTS, buildPrescription, categoryScore, healthScore, rankFindings, severityCounts } from './scoring.js';
import { UnsafeURL, validateResolved } from './ssrf.js';
import { technical } from './analyzers/technical.js';
import { seo } from './analyzers/seo.js';
import { performance } from './analyzers/performance.js';
import { accessibility } from './analyzers/accessibility.js';
import { security } from './analyzers/security.js';
import { links } from './analyzers/links.js';
import { content } from './analyzers/content.js';
import { ai } from './analyzers/ai.js';

export const STAGES = [
  ['connecting', 'Connecting'],
  ['fetching', 'Fetching the page'],
  ['technical', 'Analyzing technical structure'],
  ['seo', 'Analyzing SEO'],
  ['performance', 'Measuring performance and Core Web Vitals'],
  ['accessibility', 'Analyzing accessibility'],
  ['security', 'Reviewing security headers'],
  ['links', 'Checking links'],
  ['content', 'Analyzing content'],
  ['ai', 'Checking AI visibility'],
  ['scoring', 'Calculating scores'],
  ['report', 'Generating prescription']
];

const ANALYZERS = [
  ['technical', technical],
  ['seo', seo],
  ['performance', performance],
  ['accessibility', accessibility],
  ['security', security],
  ['links', (ctx) => links(ctx, { deadline: ctx.deadline })],
  ['content', content],
  ['ai', ai]
];

// A Worker may keep working for 30 seconds after answering. An examination
// still unfinished well after that was stopped by the platform.
const STALE_MS = 90_000;

/** True for a queued or running examination the platform must have stopped. */
export const isStale = (row, now = Date.now()) =>
  (row.status === 'queued' || row.status === 'running') && now - Date.parse(row.started_at || row.created_at) > STALE_MS;

export function stageList(current, failed = null) {
  const idx = STAGES.findIndex(([key]) => key === current);
  return STAGES.map(([key, label], i) => ({
    key,
    label,
    state: failed && key === failed ? 'failed' : i < idx ? 'done' : i === idx ? 'active' : 'pending'
  }));
}

export { auditOut };

async function update(env, id, fields) {
  const keys = Object.keys(fields);
  const values = keys.map((k) => (fields[k] !== null && typeof fields[k] === 'object' ? JSON.stringify(fields[k]) : fields[k]));
  await env.DB.prepare(`UPDATE audits SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...values, id).run();
}

async function getOrCreateWebsite(env, url) {
  const host = new URL(url).hostname.toLowerCase();
  const site = await env.DB.prepare('SELECT id FROM websites WHERE host = ?').bind(host).first();
  if (site) return site.id;
  const id = newId();
  await env.DB.prepare('INSERT INTO websites (id, host, url, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (host) DO NOTHING').bind(id, host, url, nowIso()).run();
  return (await env.DB.prepare('SELECT id FROM websites WHERE host = ?').bind(host).first()).id;
}

/** Run one examination to completion or failure, writing stages as it goes. */
export async function runAudit(env, id, { budget = new Budget(), started = Date.now() } = {}) {
  const row = await env.DB.prepare('SELECT * FROM audits WHERE id = ?').bind(id).first();
  if (!row) return;
  let stage = 'connecting';
  const setStage = (key) => {
    stage = key;
    return update(env, id, { stage: key, stages: stageList(key) });
  };
  await update(env, id, { status: 'running', started_at: nowIso(), stage, stages: stageList(stage) });
  try {
    await setStage('fetching');
    const fetched = await fetchPage(row.url, { budget, timeout: 10000 });
    const ctx = pageContext(fetched);
    ctx.budget = budget;
    ctx.deadline = started + 22_000; // leaves time to score and store within the 30 s window
    const results = [];
    for (const [category, analyzer] of ANALYZERS) {
      await setStage(category);
      try {
        results.push(await analyzer(ctx));
      } catch (err) {
        // One analyzer failing must not kill the examination.
        console.error(`analyzer ${category} failed for ${row.url}`, (err && err.stack) || err);
        results.push({ category, findings: [], metrics: { error: 'analyzer failed' } });
      }
    }
    await setStage('scoring');
    const scores = Object.fromEntries(results.map((r) => [r.category, categoryScore(r.findings)]));
    const health = healthScore(scores);
    await setStage('report');
    const order = Object.keys(WEIGHTS);
    const stored = [...results]
      .sort((a, b) => (order.includes(a.category) ? order.indexOf(a.category) : 99) - (order.includes(b.category) ? order.indexOf(b.category) : 99))
      .map((r) => ({ category: r.category, score: scores[r.category], metrics: r.metrics }));
    const issues = rankFindings(results).map(([category, f]) => ({ category, ...f }));
    const prescription = buildPrescription(results).map(({ position, severity, action, issue_code }) => ({ position, severity, action, issue_code }));
    await update(env, id, {
      status: 'completed',
      scores,
      health_score: health,
      summary: { final_url: fetched.final_url, status: fetched.status, response_ms: fetched.elapsed_ms, counts: severityCounts(results), checked_at: nowIso() },
      stages: stageList('report').map((s) => ({ ...s, state: 'done' })),
      results: stored,
      issues,
      prescription,
      completed_at: nowIso()
    });
  } catch (err) {
    const known = err instanceof FetchError || err instanceof UnsafeURL;
    if (!known) console.error(`audit ${id} crashed`, (err && err.stack) || err);
    await update(env, id, {
      status: 'failed',
      error_message: known ? err.reason || err.message : 'The examination stopped because of an internal error. It has been logged.',
      stages: stageList(stage, stage),
      completed_at: nowIso()
    });
  }
}

/**
 * Validate an address, queue an examination of it and start it in the
 * background. Returns the new audit row as auditOut takes it. Throws UnsafeURL
 * for an address the SSRF policy refuses. Shared by the public route and the
 * studio dashboard (src/studio/audits.js), which passes listed: false so its
 * examinations of client and prospect sites stay off the public recent list.
 */
export async function createAudit(env, ctx, raw, { listed = true } = {}) {
  const budget = new Budget();
  const started = Date.now();
  const { url } = await validateResolved(raw, budget); // the SSRF policy applies before anything is queued
  const websiteId = await getOrCreateWebsite(env, url);
  const id = newId();
  const created = nowIso();
  const stages = JSON.stringify(stageList(null));
  await env.DB.prepare(
    "INSERT INTO audits (id, website_id, url, status, stage, stages, listed, created_at) VALUES (?, ?, ?, 'queued', 'queued', ?, ?, ?)"
  )
    .bind(id, websiteId, url, stages, listed ? 1 : 0, created)
    .run();
  ctx.waitUntil(runAudit(env, id, { budget, started }));
  return { id, website_id: websiteId, url, status: 'queued', stage: 'queued', stages, listed: listed ? 1 : 0, created_at: created };
}

async function start(request, env, ctx) {
  if (!(await hit(env, ctx, 'audits', clientIp(request), env.RATE_LIMIT_AUDITS || '6/hour'))) {
    return error(429, 'rate_limited', 'Too many requests. Try again later.');
  }
  const [body, bad] = await readJson(request);
  if (bad) return bad;
  const [raw, badUrl] = stringField(body, 'url', 3, 2048);
  if (badUrl) return badUrl;
  if (body.listed !== undefined && body.listed !== null && typeof body.listed !== 'boolean') return fieldError('listed', 'Must be true or false.');
  let row;
  try {
    row = await createAudit(env, ctx, raw, { listed: body.listed !== false });
  } catch (err) {
    if (err instanceof UnsafeURL) return error(422, 'invalid_url', err.message);
    throw err;
  }
  return json(auditOut(row), 202);
}

/** The audit row, with an examination the platform stopped marked as failed. */
export async function loadAudit(env, id) {
  return load(env, id);
}

async function load(env, id) {
  const row = await env.DB.prepare('SELECT * FROM audits WHERE id = ?').bind(id).first();
  if (!row) return null;
  if (isStale(row)) {
    const fields = {
      status: 'failed',
      error_message: 'The examination took too long and was stopped. Very large pages can exceed the time this service allows; try again or examine a lighter page.',
      stages: stageList(row.stage, row.stage),
      completed_at: nowIso()
    };
    await update(env, id, fields);
    Object.assign(row, fields, { stages: JSON.stringify(fields.stages) });
  }
  return row;
}

async function getAudit(env, id) {
  const row = await load(env, id);
  if (!row) return error(404, 'not_found', 'No examination with that id.');
  return json(auditOut(row));
}

/**
 * The brief for everyone; the full report only with the admin key. Visitors
 * get the full report by email (reports.js), through a link that carries its
 * own secret, because audit ids are public on the recently examined list.
 */
async function getResults(request, env, id) {
  const row = await load(env, id);
  if (!row) return error(404, 'not_found', 'No examination with that id.');
  if (row.status !== 'completed') return error(409, 'not_ready', `The examination is ${row.status}.`);
  if (request.headers.get('X-Admin-Key')) {
    const denied = await requireAdmin(request, env);
    return denied || json(fullReport(row));
  }
  return json(briefReport(row));
}

async function recent(env) {
  const { results } = await env.DB.prepare(
    "SELECT a.id, a.website_id, w.host, a.health_score, a.completed_at FROM audits a JOIN websites w ON w.id = a.website_id WHERE a.status = 'completed' AND a.listed = 1 ORDER BY a.completed_at DESC LIMIT 60"
  ).all();
  const seen = new Set();
  const out = [];
  for (const a of results) {
    if (seen.has(a.website_id)) continue;
    seen.add(a.website_id);
    out.push({ id: a.id, host: a.host, health_score: a.health_score, completed_at: a.completed_at });
    if (out.length === 10) break;
  }
  return json(out);
}

async function history(env, host) {
  const { results } = await env.DB.prepare(
    "SELECT a.id, a.health_score, a.scores, a.completed_at FROM audits a JOIN websites w ON w.id = a.website_id WHERE w.host = ? AND a.status = 'completed' ORDER BY a.completed_at ASC LIMIT 50"
  )
    .bind(host.toLowerCase())
    .all();
  return json(results.map((r) => ({ id: r.id, health_score: r.health_score, scores: parse(r.scores, {}), completed_at: r.completed_at })));
}

/** Routes under /api/vector/. Returns a Response, or null when nothing matches. */
export async function vectorRoute(request, env, ctx, url) {
  const p = url.pathname;
  const m = request.method;
  if (p === '/api/vector/audits') return m === 'POST' ? start(request, env, ctx) : error(405, 'method_not_allowed', 'Use POST.');
  if (p === '/api/vector/recent' && m === 'GET') return recent(env);
  let match = p.match(/^\/api\/vector\/audits\/([^/]+)\/results$/);
  if (match && m === 'GET') return getResults(request, env, decodeURIComponent(match[1]));
  match = p.match(/^\/api\/vector\/audits\/([^/]+)$/);
  if (match && m === 'GET') return getAudit(env, decodeURIComponent(match[1]));
  match = p.match(/^\/api\/vector\/websites\/([^/]+)\/audits$/);
  if (match && m === 'GET') return history(env, decodeURIComponent(match[1]));
  return null;
}
