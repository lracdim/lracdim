/**
 * LRACDIM scan worker
 * -------------------------------------------------------------------------
 * Fetches a prospect's public HTML server-side so the browser-based
 * diagnostic can analyse a REAL document instead of a modelled profile.
 *
 * GET /?url=https://example.com
 *   -> { ok: true, finalUrl, status, loadMs, bytes, html }
 *   -> { ok: false, error }
 *
 * Guards: http(s) only, no private / loopback / link-local targets, no
 * raw IPs, 8 s timeout, 1.5 MB cap, HTML content only, CORS restricted to
 * ALLOWED_ORIGINS. Nothing is stored.
 *
 * Deploy:  cd workers/scan && npx wrangler deploy
 * Then put the worker URL in src/_data/site.js -> scanEndpoint.
 */

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8000;

const BLOCKED_HOSTS = /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i;
const PRIVATE_IP =
  /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc00:|fd00:|fe80:)/i;
const RAW_IP = /^(\d{1,3}\.){3}\d{1,3}$|^\[?[0-9a-f:]+\]?$/i;

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const ok = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : '';
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  };
  if (ok) headers['Access-Control-Allow-Origin'] = ok;
  if (ok && ok !== '*') headers['Vary'] = 'Origin';
  return headers;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

function validateTarget(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { error: 'That is not a URL I can read.' };
  }
  if (!/^https?:$/.test(url.protocol)) return { error: 'Only http and https are scanned.' };
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.test(host) || PRIVATE_IP.test(host) || RAW_IP.test(host)) {
    return { error: 'That address is not a public website.' };
  }
  if (!host.includes('.')) return { error: 'That does not look like a public domain.' };
  url.hash = '';
  return { url };
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return json({ ok: false, error: 'GET only.' }, 405, headers);
    if (!headers['Access-Control-Allow-Origin']) {
      return json({ ok: false, error: 'Origin not allowed.' }, 403, headers);
    }

    const raw = new URL(request.url).searchParams.get('url') || '';
    const target = validateTarget(raw.trim());
    if (target.error) return json({ ok: false, error: target.error }, 400, headers);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const started = Date.now();

    try {
      const res = await fetch(target.url.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'LRACDIM-Diagnostic/1.0 (+https://lracdimension.com/)',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5'
        },
        cf: { cacheTtl: 0 }
      });

      const type = res.headers.get('content-type') || '';
      if (!/text\/html|application\/xhtml/i.test(type)) {
        return json({ ok: false, error: 'That URL did not return an HTML page.' }, 415, headers);
      }

      // Read with a hard byte cap so a huge page cannot run up the bill.
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_BYTES) {
          reader.cancel();
          break;
        }
        chunks.push(value);
      }
      const html = new TextDecoder('utf-8', { fatal: false }).decode(concat(chunks));

      return json(
        {
          ok: true,
          finalUrl: res.url,
          status: res.status,
          loadMs: Date.now() - started,
          bytes: received,
          truncated: received > MAX_BYTES,
          html
        },
        200,
        headers
      );
    } catch (err) {
      const aborted = err && err.name === 'AbortError';
      return json(
        { ok: false, error: aborted ? 'The site took too long to respond.' : 'The site could not be reached.' },
        aborted ? 504 : 502,
        headers
      );
    } finally {
      clearTimeout(timer);
    }
  }
};

function concat(chunks) {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
