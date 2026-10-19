/**
 * Signal: public domain scans and scheduled monitoring, ported from
 * api/app/routes/signal.py, services/monitor_service.py and
 * services/signal_scan.py.
 *
 * Differences forced by the Workers free plan, and why:
 *  - Scheduled checks run from a Cron Trigger every 5 minutes, at most
 *    SWEEP_LIMIT targets per run (each run may make 50 outbound requests and
 *    50 database queries). Operator targets are due every 5 minutes; public
 *    scan targets every hour, capped at PUBLIC_TARGET_CAP, so the daily D1
 *    write quota is never at risk.
 *  - A Worker cannot read a remote TLS certificate. A successful https fetch
 *    proves the certificate is valid (ssl_valid = 1); a TLS failure sets 0.
 *    The expiry date and issuer are not measured and stay null.
 */
import { BudgetExhausted, Budget, FetchError, USER_AGENT, fetchPage } from './fetcher.js';
import { clientIp, error, intParam, json, newId, nowIso, readJson, requireAdmin, stringField } from './http.js';
import { notify } from './notify.js';
import { pageContext } from './page.js';
import { hit } from './ratelimit.js';
import { categoryScore } from './scoring.js';
import { UnsafeURL, validate, validateResolved } from './ssrf.js';
import { technical } from './analyzers/technical.js';
import { seo } from './analyzers/seo.js';
import { performance } from './analyzers/performance.js';
import { content } from './analyzers/content.js';

export const PUBLIC_TARGET_CAP = 100;
export const SWEEP_LIMIT = 8;
const ADMIN_INTERVAL_MS = 5 * 60_000;
const PUBLIC_INTERVAL_MS = 60 * 60_000;
const CHECK_EVENT_RETENTION_MS = 14 * 86_400_000;

const ANALYTICS_SIGNATURES = {
  // The third pattern catches a quoted measurement id in page config, which is
  // how sites that inject gtag from a module (or a framework) carry it.
  'Google Analytics 4': [/googletagmanager\.com\/gtag\/js\?id=G-/, /gtag\('config',\s*'G-/, /["']G-[A-Z0-9]{8,12}["']/],
  'Universal Analytics (retired)': [/google-analytics\.com\/analytics\.js/, /gtag\('config',\s*'UA-/],
  'Google Tag Manager': [/googletagmanager\.com\/gtm\.js/, /GTM-[A-Z0-9]+/],
  'Meta Pixel': [/connect\.facebook\.net\/[a-z_]+\/fbevents\.js/, /fbq\('init'/],
  'Microsoft Clarity': [/clarity\.ms\/tag\//],
  Hotjar: [/static\.hotjar\.com\/c\/hotjar-/],
  Plausible: [/plausible\.io\/js\//],
  Fathom: [/cdn\.usefathom\.com\/script\.js/],
  Matomo: [/matomo\.js/, /_paq\.push/],
  'LinkedIn Insight': [/snap\.licdn\.com\/li\.lms-analytics/],
  'TikTok Pixel': [/analytics\.tiktok\.com\/i18n\/pixel/],
  HubSpot: [/js\.hs-scripts\.com\//],
  'Vercel Analytics': [/\/_vercel\/insights\/script\.js/, /va\.vercel-scripts\.com/],
  'Cloudflare Web Analytics': [/static\.cloudflareinsights\.com\/beacon/]
};

export function detectAnalytics(html) {
  return Object.keys(ANALYTICS_SIGNATURES).filter((name) => ANALYTICS_SIGNATURES[name].some((re) => re.test(html)));
}

export function targetOut(t) {
  return {
    id: t.id,
    name: t.name,
    url: t.url,
    host: t.host,
    source: t.source,
    status: t.status,
    last_status_code: t.last_status_code ?? null,
    last_response_ms: t.last_response_ms ?? null,
    last_checked_at: t.last_checked_at ?? null,
    ssl_valid: t.ssl_valid ?? null,
    ssl_expires_at: t.ssl_expires_at ?? null,
    ssl_issuer: t.ssl_issuer ?? null,
    created_at: t.created_at
  };
}

const eventOut = (e) => ({
  id: e.id,
  target_id: e.target_id,
  kind: e.kind,
  level: e.level,
  message: e.message,
  status_code: e.status_code ?? null,
  response_ms: e.response_ms ?? null,
  created_at: e.created_at
});

const insertEvent = (env, e) =>
  env.DB.prepare('INSERT INTO signal_events (id, target_id, kind, level, message, status_code, response_ms, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
    newId(),
    e.target_id,
    e.kind,
    e.level || 'info',
    String(e.message).slice(0, 255),
    e.status_code ?? null,
    e.response_ms ?? null,
    JSON.stringify(e.data || {}),
    e.created_at || nowIso()
  );

const getTarget = (env, id) => env.DB.prepare('SELECT * FROM monitoring_targets WHERE id = ?').bind(id).first();

/** Cloudflare and similar edges answer automated clients with a challenge page. That is not an outage. */
async function looksLikeBotChallenge(res) {
  const h = {};
  res.headers.forEach((v, k) => {
    h[k.toLowerCase()] = v.toLowerCase();
  });
  if ('cf-mitigated' in h || 'cf-chl-bypass' in h || (h.server || '').startsWith('cloudflare') || (h.server || '').includes('akamai') || 'x-sucuri-id' in h) {
    await res.body?.cancel();
    return true;
  }
  const body = (await res.text()).slice(0, 20000).toLowerCase();
  return ['challenge-platform', 'cf-browser-verification', 'just a moment', 'attention required', 'captcha', 'access denied'].some((m) => body.includes(m));
}

/** One availability check: status, response time, transitions, alerts. Returns the updated target row. */
export async function checkTarget(env, target, { budget } = {}) {
  const started = Date.now();
  let statusCode = null;
  let failure = null;
  let protectedSite = false;
  let tlsFailed = false;
  try {
    validate(target.url);
    budget?.take(3); // a followed redirect chain counts every hop
    const res = await fetch(target.url, { redirect: 'follow', headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(12000) });
    statusCode = res.status;
    if ([403, 429, 503].includes(statusCode)) protectedSite = await looksLikeBotChallenge(res);
    else await res.body?.cancel();
    if (statusCode === 525 || statusCode === 526) tlsFailed = true; // Cloudflare's codes for a failed TLS handshake
  } catch (err) {
    if (err instanceof BudgetExhausted) throw err;
    if (err instanceof UnsafeURL) failure = err.message;
    else if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) failure = 'timeout';
    else if (/certificate|ssl|tls|handshake/i.test(String(err && err.message))) {
      failure = 'SSLError';
      tlsFailed = true;
    } else failure = 'ConnectError';
  }
  const responseMs = Date.now() - started;
  const warnMs = Number(env.SIGNAL_RESPONSE_WARN_MS) || 1500;
  let next;
  if (protectedSite) next = 'protected';
  else if (failure || statusCode === null || statusCode >= 500) next = 'unavailable';
  else if (statusCode >= 400 || responseMs > warnMs) next = 'degraded';
  else next = 'operational';

  const previous = target.status;
  const now = nowIso();
  const statements = [];
  const alerts = [];
  const event = (e) => statements.push(insertEvent(env, { target_id: target.id, created_at: now, ...e }));

  event({ kind: 'check', message: `${next[0].toUpperCase()}${next.slice(1)} · ${statusCode || failure} · ${responseMs} ms`, status_code: statusCode, response_ms: responseMs, data: { error: failure } });
  if (next !== previous && previous !== 'unknown') {
    const level = next === 'unavailable' ? 'critical' : next === 'degraded' ? 'warning' : 'info';
    const kind = next === 'unavailable' ? 'incident' : next === 'degraded' ? 'warning' : next === 'operational' ? 'recovered' : 'status_change';
    const msg = {
      unavailable: 'Website unavailable',
      degraded: 'Website degraded',
      operational: 'Website recovered',
      protected: 'Website answers with a bot challenge; reachable, not readable by the monitor'
    }[next];
    event({ kind, level, message: msg, status_code: statusCode, response_ms: responseMs, data: { from: previous, to: next } });
    if (level !== 'info') alerts.push([`[Signal] ${target.name}: ${msg}`, { target: target.url, from: previous, to: next, status_code: statusCode, response_ms: responseMs, error: failure }]);
  } else if (previous === 'unknown') {
    event({ kind: 'status_change', message: `First check: ${next}`, status_code: statusCode, response_ms: responseMs });
  }

  let sslValid = target.ssl_valid ?? null;
  if (target.url.startsWith('https://')) {
    if (tlsFailed) {
      if (sslValid !== 0) {
        sslValid = 0;
        event({ kind: 'ssl', level: 'critical', message: `SSL check failed: ${failure || `HTTP ${statusCode}`}`, data: { error: failure || `HTTP ${statusCode}` } });
        alerts.push([`[Signal] ${target.name}: SSL check failed`, { target: target.url, error: failure || `HTTP ${statusCode}` }]);
      }
    } else if (statusCode !== null) {
      if (sslValid === null) event({ kind: 'ssl', message: 'SSL valid (expiry date not measured)', data: {} });
      sslValid = 1;
    }
  }

  statements.unshift(
    env.DB.prepare('UPDATE monitoring_targets SET status = ?, last_status_code = ?, last_response_ms = ?, last_checked_at = ?, ssl_valid = ? WHERE id = ?').bind(
      next,
      statusCode,
      responseMs,
      now,
      sslValid,
      target.id
    )
  );
  await env.DB.batch(statements);
  for (const [subject, payload] of alerts) await notify(env, subject, payload);
  return { ...target, status: next, last_status_code: statusCode, last_response_ms: responseMs, last_checked_at: now, ssl_valid: sslValid };
}

async function createTarget(env, name, url, host, source) {
  const row = { id: newId(), name: name.trim().slice(0, 120), url, host, source, status: 'unknown', created_at: nowIso() };
  await env.DB.batch([
    env.DB.prepare("INSERT INTO monitoring_targets (id, name, url, host, enabled, source, status, created_at) VALUES (?, ?, ?, ?, 1, ?, 'unknown', ?)").bind(row.id, row.name, url, host, source, row.created_at),
    insertEvent(env, { target_id: row.id, kind: 'registered', message: source === 'public' ? 'Registered by public scan' : 'Target registered', created_at: row.created_at })
  ]);
  return { ...row, enabled: 1, last_status_code: null, last_response_ms: null, last_checked_at: null, ssl_valid: null, ssl_expires_at: null, ssl_issuer: null };
}

/** Fetch once, run the four document analyzers, detect analytics. */
async function snapshot(env, target, url, budget) {
  const fetched = await fetchPage(url, { budget, timeout: 10000 });
  const ctx = pageContext(fetched);
  ctx.budget = budget;
  // No PageSpeed call here: Signal is a quick snapshot, and Vector carries Core Web Vitals.
  const results = { technical: technical(ctx), seo: await seo(ctx), performance: performance(ctx), content: content(ctx) };
  const scores = Object.fromEntries(Object.entries(results).map(([cat, r]) => [cat, categoryScore(r.findings)]));
  const seoM = results.seo.metrics;
  const techM = results.technical.metrics;
  const perfM = results.performance.metrics;
  const analytics = detectAnalytics(fetched.text);
  const indexable = !((seoM.robots_meta || '').includes('noindex') || (seoM.x_robots_tag || '').includes('noindex') || seoM.robots_txt === 'blocks_all' || (techM.status ?? 200) >= 400);
  const data = {
    scores,
    analytics_score: analytics.length ? Math.min(100, 40 + 30 * Math.min(2, analytics.length)) : 0,
    analytics,
    seo: {
      title: seoM.title,
      title_length: seoM.title_length,
      description_length: seoM.description_length,
      canonical: seoM.canonical,
      indexable,
      robots_txt: seoM.robots_txt,
      sitemap: seoM.sitemap,
      open_graph: seoM.open_graph,
      images_missing_alt: seoM.images_missing_alt
    },
    technical: { status: techM.status, https: techM.https, redirects: techM.redirect_count, viewport: techM.viewport, lang: techM.lang, h1_count: techM.h1_count },
    performance: { response_ms: perfM.response_ms, document_bytes: perfM.document_bytes, scripts: perfM.scripts, images: perfM.images, compressed: !!perfM.content_encoding },
    top_findings: Object.entries(results)
      .flatMap(([cat, r]) => r.findings.map((f) => ({ category: cat, severity: f.severity, title: f.title, recommendation: f.recommendation })))
      .slice(0, 12),
    final_url: fetched.final_url,
    measured_at: nowIso(),
    note: 'SEO, technical, performance, and content scores use Vector\'s analyzers and scoring on a single fetch. Response time varies between fetches, so the performance score can differ from a Vector examination run at another moment; the other scores should match. Analytics score reflects detected tracking tools only; it does not read any analytics account.'
  };
  if (target) {
    await insertEvent(env, {
      target_id: target.id,
      kind: 'snapshot',
      message: `Snapshot: SEO ${scores.seo}, technical ${scores.technical}, ${analytics.length} analytics tool(s)`,
      status_code: fetched.status,
      response_ms: fetched.elapsed_ms,
      data
    }).run();
  }
  return data;
}

async function scan(request, env, ctx) {
  if (!(await hit(env, ctx, 'signal', clientIp(request), env.RATE_LIMIT_SIGNAL || '10/hour'))) {
    return error(429, 'rate_limited', 'Too many requests. Try again later.');
  }
  const [body, bad] = await readJson(request);
  if (bad) return bad;
  const [raw, badUrl] = stringField(body, 'url', 3, 2048);
  if (badUrl) return badUrl;
  const budget = new Budget();
  try {
    const safe = await validateResolved(raw, budget);
    let target = await env.DB.prepare('SELECT * FROM monitoring_targets WHERE host = ?').bind(safe.host).first();
    let persisted = true;
    if (!target) {
      const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM monitoring_targets WHERE source = 'public' AND enabled = 1").first();
      if (n >= PUBLIC_TARGET_CAP) persisted = false; // beyond the cap the scan still runs but nothing is registered
      else target = await createTarget(env, safe.host, safe.url, safe.host, 'public');
    }
    if (target) target = await checkTarget(env, target, { budget });
    const snap = await snapshot(env, target, target ? target.url : safe.url, budget);
    return json({ target: target ? targetOut(target) : null, persisted, snapshot: snap });
  } catch (err) {
    if (err instanceof UnsafeURL) return error(422, 'invalid_url', err.message);
    if (err instanceof FetchError) return error(502, 'fetch_failed', err.reason);
    throw err;
  }
}

async function addTarget(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const [body, bad] = await readJson(request);
  if (bad) return bad;
  const [name, badName] = stringField(body, 'name', 1, 120);
  if (badName) return badName;
  const [raw, badUrl] = stringField(body, 'url', 3, 2048);
  if (badUrl) return badUrl;
  let safe;
  try {
    safe = await validateResolved(raw); // the SSRF policy applies to monitoring too
  } catch (err) {
    if (err instanceof UnsafeURL) return error(422, 'invalid_url', err.message);
    throw err;
  }
  const target = await createTarget(env, name, safe.url, safe.host, 'admin');
  return json(targetOut(await checkTarget(env, target)), 201); // first measurement happens immediately
}

async function runCheck(request, env, id) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const target = await getTarget(env, id);
  if (!target) return error(404, 'not_found', 'No monitoring target with that id.');
  return json(targetOut(await checkTarget(env, target)));
}

async function events(env, url, id) {
  if (!(await getTarget(env, id))) return error(404, 'not_found', 'No monitoring target with that id.');
  const [limit, bad] = intParam(url, 'limit', 200, 1, 1000);
  if (bad) return bad;
  const kind = url.searchParams.get('kind');
  const stmt = kind
    ? env.DB.prepare('SELECT * FROM signal_events WHERE target_id = ? AND kind = ? ORDER BY created_at DESC, rowid DESC LIMIT ?').bind(id, kind, limit)
    : env.DB.prepare('SELECT * FROM signal_events WHERE target_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?').bind(id, limit);
  return json((await stmt.all()).results.map(eventOut));
}

async function latestSnapshot(env, id) {
  if (!(await getTarget(env, id))) return error(404, 'not_found', 'No monitoring target with that id.');
  const snap = await env.DB.prepare("SELECT id, created_at, data FROM signal_events WHERE target_id = ? AND kind = 'snapshot' ORDER BY created_at DESC, rowid DESC LIMIT 1").bind(id).first();
  return json(snap ? { id: snap.id, created_at: snap.created_at, data: JSON.parse(snap.data || '{}') } : { id: null, created_at: null, data: null });
}

/** Cron: check the targets that are due, oldest first, then prune old check events. */
export async function sweep(env, now = Date.now()) {
  const budget = new Budget();
  const { results } = await env.DB.prepare(
    "SELECT * FROM monitoring_targets WHERE enabled = 1 AND (last_checked_at IS NULL OR (source = 'admin' AND last_checked_at < ?) OR (source <> 'admin' AND last_checked_at < ?)) ORDER BY last_checked_at IS NOT NULL, last_checked_at ASC LIMIT ?"
  )
    .bind(new Date(now - ADMIN_INTERVAL_MS + 30_000).toISOString(), new Date(now - PUBLIC_INTERVAL_MS + 30_000).toISOString(), SWEEP_LIMIT)
    .all();
  let checked = 0;
  for (const target of results) {
    try {
      await checkTarget(env, target, { budget });
      checked++;
    } catch (err) {
      if (err instanceof BudgetExhausted) break;
      console.error(`check failed for ${target.url}`, (err && err.stack) || err);
    }
  }
  await env.DB.prepare("DELETE FROM signal_events WHERE id IN (SELECT id FROM signal_events WHERE kind = 'check' AND created_at < ? LIMIT 500)")
    .bind(new Date(now - CHECK_EVENT_RETENTION_MS).toISOString())
    .run();
  return checked;
}

/** Routes under /api/signal/. Returns a Response, or null when nothing matches. */
export async function signalRoute(request, env, ctx, url) {
  const p = url.pathname;
  const m = request.method;
  if (p === '/api/signal/scan') return m === 'POST' ? scan(request, env, ctx) : error(405, 'method_not_allowed', 'Use POST.');
  if (p === '/api/signal/targets' && m === 'POST') return addTarget(request, env);
  if (p === '/api/signal/targets' && m === 'GET') {
    const { results } = await env.DB.prepare("SELECT * FROM monitoring_targets WHERE enabled = 1 AND source = 'admin' ORDER BY created_at ASC").all();
    return json(results.map(targetOut)); // the public board shows operator targets only
  }
  if (p === '/api/signal/lookup' && m === 'GET') {
    const host = (url.searchParams.get('host') || '').trim().toLowerCase();
    const t = await env.DB.prepare('SELECT * FROM monitoring_targets WHERE host = ? AND enabled = 1').bind(host).first();
    return t ? json(targetOut(t)) : error(404, 'not_found', 'That domain has not been scanned yet.');
  }
  if (p === '/api/signal/events' && m === 'GET') {
    const [limit, bad] = intParam(url, 'limit', 50, 1, 200);
    if (bad) return bad;
    const { results } = await env.DB.prepare("SELECT * FROM signal_events WHERE kind NOT IN ('check', 'snapshot') ORDER BY created_at DESC, rowid DESC LIMIT ?").bind(limit).all();
    return json(results.map(eventOut));
  }
  let match = p.match(/^\/api\/signal\/targets\/([^/]+)\/(snapshot|events|check)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (match[2] === 'snapshot' && m === 'GET') return latestSnapshot(env, id);
    if (match[2] === 'events' && m === 'GET') return events(env, url, id);
    if (match[2] === 'check' && m === 'POST') return runCheck(request, env, id);
    return null;
  }
  match = p.match(/^\/api\/signal\/targets\/([^/]+)$/);
  if (match && m === 'GET') {
    const t = await getTarget(env, decodeURIComponent(match[1]));
    return t && t.enabled ? json(targetOut(t)) : error(404, 'not_found', 'No monitoring target with that id.');
  }
  return null;
}
