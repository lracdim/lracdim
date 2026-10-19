/**
 * Forge: server-side tools that fetch other sites through the validated
 * fetcher. Ported from api/app/services/forge_tools.py and routes/forge.py.
 * Results are structured and never include the raw fetched body.
 */
import { Parser } from 'htmlparser2';
import { Budget, FetchError, fetchPage } from './fetcher.js';
import { clientIp, error, json, newId, nowIso, readJson, stringField } from './http.js';
import { Page } from './page.js';
import { hit } from './ratelimit.js';
import { UnsafeURL, normalize, validateResolved } from './ssrf.js';

const originOf = (url) => {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
};

async function robotsValidator(url, budget) {
  const target = `${originOf(normalize(url))}/robots.txt`;
  const r = await fetchPage(target, { timeout: 8000, maxBytes: 200_000, budget });
  if (r.status !== 200) return { url: target, status: r.status, found: false, problems: [`robots.txt returned ${r.status}.`], groups: [], sitemaps: [] };
  const groups = [];
  const sitemaps = [];
  const problems = [];
  let current = null;
  const lines = r.text.split(/\r\n|\r|\n/);
  if (lines.length && lines.at(-1) === '') lines.pop(); // str.splitlines() drops the final empty line
  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.split('#', 1)[0].trim();
    if (!line) return;
    const idx = line.indexOf(':');
    if (idx === -1) {
      problems.push(`Line ${n}: not a directive (${raw.trim().slice(0, 60)}).`);
      return;
    }
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (current === null || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value);
    } else if (key === 'allow' || key === 'disallow' || key === 'crawl-delay') {
      if (current === null) {
        problems.push(`Line ${n}: ${key} before any User-agent.`);
        return;
      }
      if (key !== 'crawl-delay' && value && !(value.startsWith('/') || value.startsWith('*'))) {
        problems.push(`Line ${n}: ${key} path should start with / (got ${value.slice(0, 40)}).`);
      }
      current.rules.push({ type: key, value });
    } else if (key === 'sitemap') {
      sitemaps.push(value);
      if (!/^https?:\/\//.test(value)) problems.push(`Line ${n}: Sitemap must be an absolute URL.`);
    } else if (key !== 'host') {
      problems.push(`Line ${n}: unknown directive ${key}.`);
    }
  });
  const blocksAll = groups.some((g) => g.agents.includes('*') && g.rules.some((rule) => rule.type === 'disallow' && rule.value === '/'));
  if (blocksAll) problems.push('A wildcard group disallows / which blocks all crawling.');
  if (!sitemaps.length) problems.push('No Sitemap directive.');
  return { url: target, status: r.status, found: true, groups, sitemaps, problems, blocks_all: blocksAll, lines: lines.length };
}

const localName = (name) => name.slice(name.lastIndexOf(':') + 1);

/**
 * Parse sitemap XML into {root, urls: [{loc, lastmod}], locs} or {error}.
 * htmlparser2 is lenient, so well-formedness (balanced tags, one root, no
 * stray text) is checked here.
 */
export function parseSitemap(xml) {
  const stack = [];
  const urls = [];
  const locs = [];
  let root = null;
  let rootClosed = false;
  let err = null;
  let text = '';
  let currentUrl = null;
  const fail = (msg) => {
    err ??= msg;
  };
  const parser = new Parser(
    {
      onopentag(name) {
        if (rootClosed) fail('junk after document element');
        text = '';
        if (!stack.length) root ??= name;
        stack.push(name);
        if (stack.length === 2 && localName(name) === 'url') currentUrl = { loc: null, lastmod: null };
      },
      ontext(chunk) {
        if (!stack.length && chunk.trim()) fail(rootClosed ? 'junk after document element' : 'text before the root element');
        text += chunk;
      },
      onclosetag(name, isImplied) {
        if (isImplied) fail(`mismatched or unclosed tag <${name}>`);
        const local = localName(name);
        if (local === 'loc' && text.trim()) locs.push(text.trim());
        if (currentUrl && stack.length === 3 && (local === 'loc' || local === 'lastmod')) currentUrl[local] = text;
        if (currentUrl && stack.length === 2 && local === 'url') {
          urls.push(currentUrl);
          currentUrl = null;
        }
        stack.pop();
        if (!stack.length) rootClosed = true;
        text = '';
      }
    },
    { xmlMode: true, decodeEntities: true }
  );
  parser.write(xml);
  parser.end();
  if (!root) fail('no element found');
  return err ? { error: err } : { root: localName(root), urls, locs };
}

async function sitemapValidator(url, budget) {
  let target = normalize(url);
  if (!target.endsWith('.xml') && !target.includes('sitemap')) target = `${originOf(target)}/sitemap.xml`;
  // 1 MB rather than the Python API's 2 MB keeps parsing inside the free plan's CPU limit.
  const r = await fetchPage(target, { timeout: 10000, maxBytes: 1_000_000, budget });
  const out = { url: target, status: r.status, type: null, entries: 0, sample: [], problems: [], truncated: r.truncated };
  if (r.status !== 200) {
    out.problems.push(`Sitemap returned ${r.status}.`);
    return out;
  }
  const parsed = parseSitemap(r.text);
  if (parsed.error) {
    out.problems.push(`Not well-formed XML: ${parsed.error.slice(0, 120)}.`);
    return out;
  }
  if (parsed.root === 'sitemapindex') {
    Object.assign(out, { type: 'index', entries: parsed.locs.length, sample: parsed.locs.slice(0, 10) });
  } else if (parsed.root === 'urlset') {
    const locs = parsed.urls.map((u) => (u.loc || '').trim());
    Object.assign(out, { type: 'urlset', entries: parsed.urls.length, sample: locs.slice(0, 10) });
    const empty = locs.filter((l) => !l).length;
    if (empty) out.problems.push(`${empty} <url> entries have no <loc>.`);
    const host = new URL(target).hostname;
    const foreign = locs.filter((l) => {
      if (!l) return false;
      try {
        return new URL(l).hostname !== host;
      } catch {
        return true;
      }
    });
    if (foreign.length) out.problems.push(`${foreign.length} URLs are on a different host than the sitemap, e.g. ${foreign[0]}.`);
    if (parsed.urls.length > 50_000) out.problems.push('More than 50,000 URLs; split into an index.');
    const badLastmod = parsed.urls.filter((u) => u.lastmod && !/^\d{4}-\d{2}-\d{2}/.test(u.lastmod.trim())).length;
    if (badLastmod) out.problems.push(`${badLastmod} lastmod values are not W3C dates.`);
  } else {
    out.problems.push(`Root element is <${parsed.root}>, expected <urlset> or <sitemapindex>.`);
  }
  if (!(r.headers['content-type'] || '').includes('xml')) out.problems.push(`Content-Type is ${r.headers['content-type'] || 'missing'}, expected an XML type.`);
  return out;
}

const META_KEYS = ['description', 'robots', 'viewport', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'author', 'theme-color'];

async function metadataChecker(url, budget) {
  const r = await fetchPage(url, { timeout: 10000, budget });
  const page = new Page(r.text);
  const meta = {};
  for (const m of page.all('meta')) {
    const key = m.attrs.name || m.attrs.property || m.attrs['http-equiv'];
    if (key) meta[String(key).toLowerCase()] = (m.attrs.content || '').slice(0, 300);
  }
  const canonical = page.linkRel('canonical');
  const title = page.title;
  const problems = [];
  if (!title) problems.push('Missing <title>.');
  else if (title.length < 15 || title.length > 65) problems.push(`Title length ${title.length} is outside 15 to 65 characters.`);
  if (!meta.description) problems.push('Missing meta description.');
  else if (meta.description.length < 50 || meta.description.length > 165) problems.push(`Description length ${meta.description.length} is outside 50 to 165 characters.`);
  for (const key of ['og:title', 'og:description', 'og:image', 'og:url']) if (!(key in meta)) problems.push(`Missing ${key}.`);
  if (!('twitter:card' in meta)) problems.push('Missing twitter:card.');
  if (!canonical) problems.push('Missing canonical link.');
  if (!('viewport' in meta)) problems.push('Missing viewport meta.');
  return {
    url: r.final_url,
    status: r.status,
    title,
    title_length: title.length,
    canonical: canonical ? canonical.attrs.href ?? null : null,
    meta: Object.fromEntries(Object.entries(meta).filter(([k]) => META_KEYS.includes(k) || k.startsWith('og:'))),
    problems
  };
}

async function canonicalChecker(url, budget) {
  const r = await fetchPage(url, { timeout: 10000, budget });
  const page = new Page(r.text);
  const declared = page.all('link').filter((l) => String(l.attrs.rel || '').split(/\s+/).includes('canonical')).map((l) => l.attrs.href).filter(Boolean);
  const headerLink = r.headers.link || '';
  const problems = [];
  if (!declared.length && !headerLink.includes('rel="canonical"')) problems.push('No canonical declared in HTML or Link header.');
  if (declared.length > 1) problems.push(`${declared.length} canonical tags; there should be one.`);
  let resolved = null;
  if (declared.length) {
    try {
      resolved = new URL(declared[0], r.final_url).toString();
    } catch {
      resolved = declared[0];
    }
  }
  const selfRef = resolved !== null && resolved.replace(/\/+$/, '') === r.final_url.replace(/\/+$/, '');
  if (declared.length && !/^https?:\/\//.test(declared[0])) problems.push('Canonical is relative; use an absolute URL.');
  if (resolved && resolved.startsWith('http://') && r.final_url.startsWith('https://')) problems.push('Canonical points at http while the page is https.');
  if (r.redirects.length) problems.push(`The requested address redirected ${r.redirects.length} time(s) before the final page.`);
  return { url: r.final_url, requested: r.url, status: r.status, canonical: resolved, self_referencing: selfRef, header_canonical: headerLink.includes('rel="canonical"'), redirects: r.redirects, problems };
}

async function redirectChecker(url, budget) {
  let r = await fetchPage(url, { method: 'HEAD', timeout: 10000, maxBytes: 1, budget });
  if ([405, 403, 501].includes(r.status)) r = await fetchPage(url, { method: 'GET', timeout: 10000, maxBytes: 1024, budget });
  const hops = r.redirects.map((h) => ({ from: h.from, to: h.to, status: h.status }));
  const problems = [];
  if (hops.length > 1) problems.push(`Chain of ${hops.length} redirects; link to the final address directly.`);
  if (hops.some((h) => h.status === 302)) problems.push('A 302 (temporary) redirect is used; use 301 or 308 for permanent moves.');
  if (r.url.startsWith('http://') && r.final_url.startsWith('https://') && hops.length && ![301, 308].includes(hops[0].status)) problems.push('The http to https redirect is not permanent.');
  return { requested: r.url, final_url: r.final_url, final_status: r.status, hops, hop_count: hops.length, problems };
}

export const TOOLS = {
  'robots-validator': robotsValidator,
  'sitemap-validator': sitemapValidator,
  'metadata-checker': metadataChecker,
  'canonical-checker': canonicalChecker,
  'redirect-checker': redirectChecker
};

async function record(env, tool, status, started, meta) {
  const row = { id: newId(), processing_ms: Date.now() - started };
  await env.DB.prepare('INSERT INTO tool_runs (id, tool, status, processing_ms, result_meta, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(row.id, tool, status, row.processing_ms, JSON.stringify(meta), nowIso())
    .run();
  return row;
}

async function run(request, env, ctx, tool) {
  if (!(await hit(env, ctx, 'tools', clientIp(request), env.RATE_LIMIT_TOOLS || '60/hour'))) {
    return error(429, 'rate_limited', 'Too many requests. Try again later.');
  }
  if (!(tool in TOOLS)) return error(404, 'unknown_tool', 'No such tool.');
  const [body, bad] = await readJson(request);
  if (bad) return bad;
  const [url, badUrl] = stringField(body, 'url', 3, 2048);
  if (badUrl) return badUrl;
  const started = Date.now();
  const budget = new Budget();
  let result;
  try {
    await validateResolved(url, budget); // policy check up front; the fetcher re-checks every hop
    result = await TOOLS[tool](url, budget);
  } catch (err) {
    if (err instanceof UnsafeURL) {
      await record(env, tool, 'rejected', started, { reason: err.message });
      return error(422, 'invalid_url', err.message);
    }
    if (err instanceof FetchError) {
      await record(env, tool, 'failed', started, { reason: err.reason });
      return error(502, 'fetch_failed', err.reason);
    }
    throw err;
  }
  const row = await record(env, tool, 'completed', started, { url_host: String(result.url || url).slice(0, 120), problems: (result.problems || []).length });
  return json({ tool, run_id: row.id, processing_ms: row.processing_ms, result });
}

/** Routes under /api/forge/. Returns a Response, or null when nothing matches. */
export async function forgeRoute(request, env, ctx, url) {
  const p = url.pathname;
  if (p === '/api/forge/tools' && request.method === 'GET') return json(Object.keys(TOOLS).map((tool) => ({ tool, mode: 'server' })));
  const match = p.match(/^\/api\/forge\/([^/]+)\/run$/);
  if (match && request.method === 'POST') return run(request, env, ctx, decodeURIComponent(match[1]));
  return null;
}
