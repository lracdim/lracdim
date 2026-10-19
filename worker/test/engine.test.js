/**
 * Vector, Signal, Forge and the outbound-URL policy, against a fake website
 * served by the recorded fetch in helpers.js.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setup } from './helpers.js';
import { Budget, BudgetExhausted, FetchError, fetchPage } from '../src/fetcher.js';
import { Page } from '../src/page.js';
import { UnsafeURL, normalize, validate, validateResolved } from '../src/ssrf.js';
import { parseSitemap } from '../src/forge.js';
import { sweep, SWEEP_LIMIT } from '../src/signal.js';
import { STAGES } from '../src/vector.js';

let h;
beforeEach(() => {
  h = setup();
});
afterEach(() => h.restore());

const SITE = 'https://example.com';
const PAGE = `<!DOCTYPE html><html lang="en"><head><title>Example Studio: websites that work</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="A small studio that builds fast websites and the systems behind them for growing businesses.">
<link rel="canonical" href="https://example.com/">
<meta property="og:title" content="Example"><meta property="og:description" content="Example studio">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Example"}</script>
<script src="https://www.googletagmanager.com/gtag/js?id=G-ABCDEFGH12" async></script>
</head><body><header><nav><a href="/about">About</a> <a href="/missing">Missing</a> <a href="https://twitter.com/example">Twitter</a></nav></header>
<main><h1>Websites that work</h1><p>${'Clear words for real readers. '.repeat(70)}</p><img src="/a.png" alt="A chart" width="10" height="10"></main>
<footer>Example</footer></body></html>`;

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Encoding': 'br',
  'Cache-Control': 'max-age=60',
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy': "default-src 'self'; frame-ancestors 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

/** The fake site: page, robots, sitemap, no llms.txt, one broken link, one bot-blocked link. */
function fakeSite(url, init = {}) {
  const u = new URL(url);
  const head = init.method === 'HEAD';
  if (u.hostname === 'twitter.com') return new Response(null, { status: 403 });
  if (u.hostname !== 'example.com') return new Response('{}', { status: 200 });
  switch (u.pathname) {
    case '/':
      return new Response(head ? null : PAGE, { status: 200, headers: HTML_HEADERS });
    case '/robots.txt':
      return new Response('User-agent: *\nAllow: /\nUser-agent: GPTBot\nDisallow: /\nSitemap: https://example.com/sitemap.xml\n', { headers: { 'Content-Type': 'text/plain' } });
    case '/sitemap.xml':
      return new Response('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/</loc><lastmod>2026-10-01</lastmod></url></urlset>', { headers: { 'Content-Type': 'application/xml' } });
    case '/about':
      return new Response(null, { status: 200 });
    default:
      return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/html' } });
  }
}

// ---------------------------------------------------------------- URL policy

test('normalize and validate apply the Python SSRF rules', () => {
  assert.equal(normalize('example.com'), 'https://example.com/');
  assert.equal(normalize('HTTP://Example.COM/a#frag'), 'http://example.com/a');
  for (const [raw, message] of [
    ['', /Enter a website address/],
    ['ftp://example.com', /Only http and https/],
    ['javascript:alert(1)', /Only http and https/],
    ['https://user:pw@example.com', /embedded credentials/],
    ['http://localhost:8000', /Internal and local/],
    ['https://printer.local', /Internal and local/],
    ['http://127.0.0.1', /Private and reserved/],
    ['http://10.1.2.3', /Private and reserved/],
    ['http://169.254.169.254/latest', /Private and reserved/],
    ['http://[::1]/', /Private and reserved/],
    ['http://[::ffff:127.0.0.1]/', /Private and reserved/],
    ['http://[fd00::1]/', /Private and reserved/],
    ['https://intranet', /full domain name/]
  ]) {
    assert.throws(() => validate(raw), (err) => err instanceof UnsafeURL && message.test(err.message), raw);
  }
  assert.equal(validate('http://93.184.215.14/').host, '93.184.215.14');
});

test('a name that resolves to a private address, or does not resolve, is rejected', async () => {
  h.restore();
  const answers = { 'internal.example': '10.0.0.5', 'nowhere.example': null, 'public.example': '93.184.215.14' };
  globalThis.fetch = async (url) => {
    const q = new URL(url).searchParams;
    const ip = answers[q.get('name')];
    const Answer = q.get('type') === 'A' && ip ? [{ type: 1, data: ip }] : [];
    return new Response(JSON.stringify({ Status: 0, Answer }));
  };
  await assert.rejects(validateResolved('internal.example'), /resolves to a private network/);
  await assert.rejects(validateResolved('nowhere.example'), /could not be resolved/);
  assert.equal((await validateResolved('public.example')).url, 'https://public.example/');
});

// ------------------------------------------------------------------- fetcher

test('redirects are followed hop by hop and every hop is re-validated', async () => {
  h.respond = (url) => {
    if (url === 'http://example.com/') return new Response(null, { status: 301, headers: { Location: 'https://example.com/' } });
    if (url === 'https://example.com/') return new Response(null, { status: 302, headers: { Location: 'http://192.168.1.1/admin' } });
    return new Response('ok');
  };
  await assert.rejects(fetchPage('http://example.com/'), (err) => err instanceof FetchError && /redirect pointed at an address that cannot be examined/.test(err.reason));
  assert.ok(h.calls.every((c) => c.redirect === 'manual'));
  assert.ok(!h.calls.some((c) => c.url.includes('192.168')));
});

test('bodies over the size limit are truncated, and the request budget is enforced', async () => {
  h.respond = () => new Response('x'.repeat(5000), { headers: { 'Content-Type': 'text/html' } });
  const r = await fetchPage('https://example.com/', { maxBytes: 1000 });
  assert.equal(r.body.byteLength, 1000);
  assert.equal(r.truncated, true);
  const budget = new Budget(1);
  await fetchPage('https://example.com/', { budget });
  await assert.rejects(fetchPage('https://example.com/', { budget }), BudgetExhausted);
});

// ---------------------------------------------------------------- page index

test('page text follows BeautifulSoup rules', () => {
  const page = new Page(
    '<html><head><title> Tom &amp; Jerry </title><style>p{}</style></head><body>' +
      '<p>One <b>two</b>three</p><script>var x = 1</script><noscript><p>hidden</p></noscript>' +
      '<label>Name <input id="n"></label><input id="e"><a href="/x"><img src="i.png" alt=""></a><button><span> </span></button></body></html>'
  );
  assert.equal(page.title, 'Tom & Jerry');
  assert.equal(page.visibleText(), 'One two three Name');
  const [p, hidden] = page.all('p');
  assert.equal(Page.spaced(p), 'One two three');
  assert.equal(Page.stripped(p), 'Onetwothree');
  assert.equal(hidden.skipped, true);
  const [inLabel, outside] = page.all('input');
  assert.equal(inLabel.inLabel, true);
  assert.equal(outside.inLabel, false);
  assert.equal(page.first('a').hasAltImg, true);
  assert.equal(Page.stripped(page.first('button')), '');
});

// -------------------------------------------------------------------- Vector

test('a Vector examination runs in the background and produces the full report', async () => {
  h.respond = fakeSite;
  const res = await h.call('/api/vector/audits', { method: 'POST', body: { url: 'example.com' } });
  assert.equal(res.status, 202);
  const queued = await res.json();
  assert.equal(queued.status, 'queued');
  assert.equal(queued.url, 'https://example.com/');
  assert.equal(queued.stages.length, STAGES.length);

  const audit = await (await h.call(`/api/vector/audits/${queued.id}`)).json();
  assert.equal(audit.status, 'completed', audit.error_message);
  assert.ok(audit.stages.every((s) => s.state === 'done'));
  assert.deepEqual(Object.keys(audit.scores).sort(), ['accessibility', 'ai', 'content', 'links', 'performance', 'security', 'seo', 'technical']);
  assert.equal(typeof audit.health_score, 'number');
  assert.equal(audit.summary.status, 200);

  const report = await (await h.call(`/api/vector/audits/${queued.id}/results`)).json();
  assert.deepEqual(report.results.map((r) => r.category), ['technical', 'seo', 'performance', 'accessibility', 'security', 'links', 'content', 'ai']);
  const metrics = Object.fromEntries(report.results.map((r) => [r.category, r.metrics]));
  assert.equal(metrics.seo.robots_txt, 'present');
  assert.equal(metrics.seo.sitemap, 'present');
  assert.deepEqual(metrics.links.broken, ['https://example.com/missing']);
  assert.deepEqual(metrics.links.unverifiable, ['https://twitter.com/example']);
  assert.deepEqual(metrics.ai.structured_data_types, ['Organization']);
  assert.deepEqual(metrics.ai.training_crawlers_blocked, ['GPTBot (OpenAI training)']);
  assert.equal(metrics.ai.llms_txt, 'missing');
  assert.equal(metrics.performance.vitals, null);
  assert.ok(report.issues.some((i) => i.code === 'broken_links' && i.severity === 'high'));
  assert.deepEqual(report.prescription[0], { position: 1, severity: report.issues[0].severity, action: report.issues[0].recommendation, issue_code: report.issues[0].code });
  assert.match(report.methodology, /^Scoring methodology/);
  // robots.txt is read once and shared by the SEO and AI analyzers.
  assert.equal(h.outbound().filter((c) => c.url === 'https://example.com/robots.txt').length, 1);

  const recent = await (await h.call('/api/vector/recent')).json();
  assert.deepEqual(recent.map((r) => r.host), ['example.com']);
  const history = await (await h.call('/api/vector/websites/example.com/audits')).json();
  assert.equal(history.length, 1);
  assert.equal(history[0].health_score, audit.health_score);
});

test('results are not ready until the examination completes, and unknown ids are a 404', async () => {
  h.env.DB.raw
    .prepare("INSERT INTO websites (id, host, url, created_at) VALUES ('w1', 'example.com', 'https://example.com/', ?)")
    .run(new Date().toISOString());
  h.env.DB.raw
    .prepare("INSERT INTO audits (id, website_id, url, status, stage, stages, created_at, started_at) VALUES ('a1', 'w1', 'https://example.com/', 'running', 'links', '[]', ?, ?)")
    .run(new Date().toISOString(), new Date().toISOString());
  const notReady = await h.call('/api/vector/audits/a1/results');
  assert.equal(notReady.status, 409);
  assert.equal((await notReady.json()).error.message, 'The examination is running.');
  assert.equal((await h.call('/api/vector/audits/nope')).status, 404);
});

test('an examination stopped by the platform is reported as failed instead of polling forever', async () => {
  const old = new Date(Date.now() - 5 * 60_000).toISOString();
  h.env.DB.raw.prepare("INSERT INTO websites (id, host, url, created_at) VALUES ('w1', 'example.com', 'https://example.com/', ?)").run(old);
  h.env.DB.raw
    .prepare("INSERT INTO audits (id, website_id, url, status, stage, stages, created_at, started_at) VALUES ('a1', 'w1', 'https://example.com/', 'running', 'links', '[]', ?, ?)")
    .run(old, old);
  const audit = await (await h.call('/api/vector/audits/a1')).json();
  assert.equal(audit.status, 'failed');
  assert.match(audit.error_message, /took too long/);
  assert.equal(audit.stages.find((s) => s.key === 'links').state, 'failed');
});

test('a site that cannot be reached fails the examination with a readable reason', async () => {
  h.respond = () => {
    throw new TypeError('fetch failed');
  };
  const queued = await (await h.call('/api/vector/audits', { method: 'POST', body: { url: 'example.com' } })).json();
  const audit = await (await h.call(`/api/vector/audits/${queued.id}`)).json();
  assert.equal(audit.status, 'failed');
  assert.equal(audit.error_message, 'The server could not be reached.');
  assert.equal(audit.stages.find((s) => s.key === 'fetching').state, 'failed');
});

test('unsafe or invalid addresses are refused before anything is queued; the seventh examination in an hour is limited', async () => {
  const unsafe = await h.call('/api/vector/audits', { method: 'POST', body: { url: 'http://127.0.0.1' } });
  assert.equal(unsafe.status, 422);
  assert.equal((await unsafe.json()).error.code, 'invalid_url');
  const short = await h.call('/api/vector/audits', { method: 'POST', body: { url: 'ab' } });
  assert.equal((await short.json()).error.fields[0].field, 'url');
  assert.equal(h.rows('audits').length, 0);
  h.respond = fakeSite;
  for (let i = 0; i < 4; i++) assert.equal((await h.call('/api/vector/audits', { method: 'POST', body: { url: 'example.com' } })).status, 202);
  assert.equal((await h.call('/api/vector/audits', { method: 'POST', body: { url: 'example.com' } })).status, 429);
});

test('an examination opted out of the public list stays off it', async () => {
  h.respond = fakeSite;
  await h.call('/api/vector/audits', { method: 'POST', body: { url: 'example.com', listed: false } });
  assert.deepEqual(await (await h.call('/api/vector/recent')).json(), []);
});

// -------------------------------------------------------------------- Signal

test('a public Signal scan registers the domain, checks it, and stores a snapshot', async () => {
  h.respond = fakeSite;
  const res = await h.call('/api/signal/scan', { method: 'POST', body: { url: 'example.com' } });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.persisted, true);
  assert.equal(out.target.source, 'public');
  assert.equal(out.target.status, 'operational');
  assert.equal(out.target.ssl_valid, 1);
  assert.equal(out.target.ssl_expires_at, null);
  assert.deepEqual(out.snapshot.analytics, ['Google Analytics 4']);
  assert.equal(out.snapshot.seo.indexable, true);
  assert.deepEqual(Object.keys(out.snapshot.scores), ['technical', 'seo', 'performance', 'content']);
  const kinds = h.rows('signal_events').map((e) => e.kind).sort();
  assert.deepEqual(kinds, ['check', 'registered', 'snapshot', 'ssl', 'status_change']);
  const snap = await (await h.call(`/api/signal/targets/${out.target.id}/snapshot`)).json();
  assert.deepEqual(snap.data.analytics, ['Google Analytics 4']);
  const lookup = await (await h.call('/api/signal/lookup?host=example.com')).json();
  assert.equal(lookup.id, out.target.id);
  // The public board lists operator targets only.
  assert.deepEqual(await (await h.call('/api/signal/targets')).json(), []);
});

test('status transitions record incidents and recoveries and alert the owner', async () => {
  h.env.NOTIFY_WEBHOOK = 'https://hooks.example/signal';
  h.respond = fakeSite;
  assert.equal((await h.call('/api/signal/targets', { method: 'POST', body: { name: 'Example', url: 'example.com' } })).status, 401);
  const added = await h.call('/api/signal/targets', { method: 'POST', headers: { 'X-Admin-Key': 'admin-secret' }, body: { name: 'Example', url: 'example.com' } });
  assert.equal(added.status, 201);
  const target = await added.json();
  assert.equal(target.status, 'operational');

  h.respond = (url) => {
    if (url.startsWith('https://hooks.example/')) return new Response('ok');
    throw new TypeError('fetch failed');
  };
  const down = await (await h.call(`/api/signal/targets/${target.id}/check`, { method: 'POST', headers: { 'X-Admin-Key': 'admin-secret' } })).json();
  assert.equal(down.status, 'unavailable');
  const alert = h.outbound().find((c) => c.url === 'https://hooks.example/signal');
  assert.equal(alert.body.subject, '[Signal] Example: Website unavailable');
  assert.equal(alert.body.to, 'unavailable');

  h.respond = fakeSite;
  const up = await (await h.call(`/api/signal/targets/${target.id}/check`, { method: 'POST', headers: { 'X-Admin-Key': 'admin-secret' } })).json();
  assert.equal(up.status, 'operational');
  const incidents = await (await h.call('/api/signal/events?limit=40')).json();
  assert.deepEqual(incidents.map((e) => e.kind).slice(0, 2), ['recovered', 'incident']);
  assert.ok(incidents.every((e) => e.kind !== 'check' && e.kind !== 'snapshot'));
  const checks = await (await h.call(`/api/signal/targets/${target.id}/events?kind=check&limit=120`)).json();
  assert.equal(checks.length, 3);
  assert.equal((await h.call(`/api/signal/targets/${target.id}/events?limit=0`)).status, 422);
  assert.deepEqual((await (await h.call('/api/signal/targets')).json()).map((t) => t.id), [target.id]);
});

test('a bot challenge is reported as protected, not as an outage', async () => {
  h.respond = (url) =>
    new URL(url).pathname === '/'
      ? new Response('<title>Just a moment...</title>', { status: 403, headers: { 'cf-mitigated': 'challenge', 'Content-Type': 'text/html' } })
      : fakeSite(url);
  const out = await (await h.call('/api/signal/scan', { method: 'POST', body: { url: 'example.com' } })).json();
  assert.equal(out.target.status, 'protected');
});

test('the scheduled sweep checks due targets, oldest first, within its per-run limit, and prunes old checks', async () => {
  h.respond = fakeSite;
  const now = Date.now();
  const iso = (ms) => new Date(now - ms).toISOString();
  const insert = h.env.DB.raw.prepare("INSERT INTO monitoring_targets (id, name, url, host, enabled, source, status, last_checked_at, created_at) VALUES (?, ?, 'https://example.com/', 'example.com', 1, ?, 'operational', ?, ?)");
  for (let i = 0; i < SWEEP_LIMIT + 2; i++) insert.run(`due${i}`, `Due ${i}`, 'admin', iso(10 * 60_000 + i * 1000), iso(86_400_000));
  insert.run('fresh', 'Fresh', 'admin', iso(60_000), iso(86_400_000));
  insert.run('public-recent', 'Public', 'public', iso(20 * 60_000), iso(86_400_000));
  h.env.DB.raw.prepare("INSERT INTO signal_events (id, target_id, kind, level, message, data, created_at) VALUES ('old', 'fresh', 'check', 'info', 'old', '{}', ?)").run(iso(20 * 86_400_000));

  assert.equal(await sweep(h.env, now), SWEEP_LIMIT);
  const checked = new Set(h.rows('signal_events').filter((e) => e.kind === 'check').map((e) => e.target_id));
  // The two most recently checked "due" targets wait for the next run; fresh and recent public ones are not due.
  assert.deepEqual([...checked].sort(), Array.from({ length: SWEEP_LIMIT }, (_, i) => `due${i + 2}`).sort());
  assert.ok(!h.rows('signal_events').some((e) => e.id === 'old'));
});

// --------------------------------------------------------------------- Forge

test('the robots validator lists groups, sitemaps and problems', async () => {
  h.respond = (url) =>
    url.endsWith('/robots.txt') ? new Response('User-agent: *\nDisallow: /\nAllow: private\nnonsense line\nSitemap: /sitemap.xml\nFoo: bar\n') : new Response('', { status: 404 });
  const res = await h.call('/api/forge/robots-validator/run', { method: 'POST', body: { url: 'https://example.com/some/page' } });
  assert.equal(res.status, 200);
  const { tool, run_id, result } = await res.json();
  assert.equal(tool, 'robots-validator');
  assert.match(run_id, /^[0-9a-f]{32}$/);
  assert.equal(result.url, 'https://example.com/robots.txt');
  assert.equal(result.blocks_all, true);
  assert.deepEqual(result.groups, [{ agents: ['*'], rules: [{ type: 'disallow', value: '/' }, { type: 'allow', value: 'private' }] }]);
  assert.deepEqual(result.problems, [
    'Line 3: allow path should start with / (got private).',
    'Line 4: not a directive (nonsense line).',
    'Line 5: Sitemap must be an absolute URL.',
    'Line 6: unknown directive foo.',
    'A wildcard group disallows / which blocks all crawling.'
  ]);
  assert.equal(result.lines, 6);
  assert.deepEqual(h.rows('tool_runs').map((r) => [r.tool, r.status]), [['robots-validator', 'completed']]);
});

test('the sitemap parser handles url sets, indexes and malformed XML', () => {
  const set = parseSitemap('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc> https://a.example/ </loc><lastmod>yesterday</lastmod></url><url><lastmod>2026-01-01</lastmod></url></urlset>');
  assert.equal(set.root, 'urlset');
  assert.deepEqual(set.urls.map((u) => [u.loc && u.loc.trim(), u.lastmod]), [['https://a.example/', 'yesterday'], [null, '2026-01-01']]);
  const index = parseSitemap('<sitemapindex><sitemap><loc>https://a.example/s1.xml</loc></sitemap><sitemap><loc>https://a.example/s2.xml</loc></sitemap></sitemapindex>');
  assert.deepEqual(index.locs, ['https://a.example/s1.xml', 'https://a.example/s2.xml']);
  assert.ok(parseSitemap('<urlset><url><loc>x</url></urlset>').error);
  assert.ok(parseSitemap('<html><body>Not found</body>').error);
  assert.ok(parseSitemap('just text').error);
});

test('the sitemap validator reports entries and problems', async () => {
  h.respond = () =>
    new Response('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/</loc></url><url><loc>https://other.example/x</loc><lastmod>13/01/2026</lastmod></url></urlset>', {
      headers: { 'Content-Type': 'text/plain' }
    });
  const { result } = await (await h.call('/api/forge/sitemap-validator/run', { method: 'POST', body: { url: 'example.com' } })).json();
  assert.equal(result.url, 'https://example.com/sitemap.xml');
  assert.equal(result.type, 'urlset');
  assert.equal(result.entries, 2);
  assert.deepEqual(result.problems, [
    '1 URLs are on a different host than the sitemap, e.g. https://other.example/x.',
    '1 lastmod values are not W3C dates.',
    'Content-Type is text/plain, expected an XML type.'
  ]);
});

test('the metadata and canonical checkers read the page head', async () => {
  h.respond = () => new Response('<html><head><title>Short</title><link rel="canonical" href="/page"><meta property="og:title" content="T"></head></html>', { headers: { 'Content-Type': 'text/html' } });
  const meta = (await (await h.call('/api/forge/metadata-checker/run', { method: 'POST', body: { url: 'https://example.com/page' } })).json()).result;
  assert.equal(meta.title, 'Short');
  assert.deepEqual(meta.meta, { 'og:title': 'T' });
  assert.ok(meta.problems.includes('Title length 5 is outside 15 to 65 characters.'));
  assert.ok(meta.problems.includes('Missing og:image.'));
  const canon = (await (await h.call('/api/forge/canonical-checker/run', { method: 'POST', body: { url: 'https://example.com/page' } })).json()).result;
  assert.equal(canon.canonical, 'https://example.com/page');
  assert.equal(canon.self_referencing, true);
  assert.deepEqual(canon.problems, ['Canonical is relative; use an absolute URL.']);
});

test('the redirect checker reports each hop and temporary redirects', async () => {
  h.respond = (url) => {
    if (url === 'http://example.com/') return new Response(null, { status: 302, headers: { Location: 'https://example.com/' } });
    if (url === 'https://example.com/') return new Response(null, { status: 301, headers: { Location: 'https://www.example.com/' } });
    return new Response(null, { status: 200 });
  };
  const { result } = await (await h.call('/api/forge/redirect-checker/run', { method: 'POST', body: { url: 'http://example.com' } })).json();
  assert.equal(result.final_url, 'https://www.example.com/');
  assert.equal(result.hop_count, 2);
  assert.deepEqual(result.problems, [
    'Chain of 2 redirects; link to the final address directly.',
    'A 302 (temporary) redirect is used; use 301 or 308 for permanent moves.',
    'The http to https redirect is not permanent.'
  ]);
});

test('unknown tools are a 404, unsafe addresses a 422, and unreachable sites a 502', async () => {
  assert.equal((await h.call('/api/forge/nope/run', { method: 'POST', body: { url: 'example.com' } })).status, 404);
  const unsafe = await h.call('/api/forge/metadata-checker/run', { method: 'POST', body: { url: 'http://10.0.0.1' } });
  assert.equal(unsafe.status, 422);
  h.respond = () => {
    throw new TypeError('fetch failed');
  };
  const down = await h.call('/api/forge/metadata-checker/run', { method: 'POST', body: { url: 'example.com' } });
  assert.equal(down.status, 502);
  assert.equal((await down.json()).error.message, 'The server could not be reached.');
  assert.deepEqual(h.rows('tool_runs').map((r) => r.status).sort(), ['failed', 'rejected']);
  const tools = await (await h.call('/api/forge/tools')).json();
  assert.equal(tools.length, 5);
});
