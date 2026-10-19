/**
 * Safe HTTP fetching, ported from api/app/services/fetcher.py. One place
 * enforces: the SSRF policy on the first request and on every redirect, a
 * response-size ceiling, a timeout, a bounded redirect chain, an honest
 * User-Agent, and the free plan's outbound-request budget.
 */
import { UnsafeURL, validate, validateResolved } from './ssrf.js';

export const USER_AGENT = 'LRACDIMENSION-Vector/1.0 (+https://www.lracdimension.online/vector/)';

/** User-presentable fetch failure. `reason` is safe to display. */
export class FetchError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

/** Thrown when an invocation has used its outbound requests. */
export class BudgetExhausted extends Error {}

/**
 * Outbound-request counter for one invocation. The free plan allows 50
 * external subrequests per invocation and every redirect hop counts.
 */
export class Budget {
  constructor(limit = 46) {
    this.left = limit;
  }
  take(n = 1) {
    if (this.left < n) throw new BudgetExhausted('outbound request budget used up');
    this.left -= n;
  }
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function decode(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

async function readLimited(res, limit) {
  if (!res.body) return { body: new Uint8Array(0), truncated: false };
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return { body: concat(chunks).slice(0, limit), truncated: true };
    }
  }
  return { body: concat(chunks), truncated: false };
}

function concat(chunks) {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

const timedOut = (err) => err && (err.name === 'TimeoutError' || err.name === 'AbortError');

/**
 * Fetch a public URL. Redirects are followed manually so each hop is
 * re-validated. Returns the same fields as the Python Fetched dataclass.
 * `resolve: true` also checks the first address over DNS.
 */
export async function fetchPage(url, { method = 'GET', maxRedirects = 5, timeout = 12000, maxBytes = 3_000_000, budget, resolve = false } = {}) {
  const target = resolve ? await validateResolved(url, budget) : validate(url);
  let current = target.url;
  const redirects = [];
  const started = Date.now();
  for (let hop = 0; hop <= maxRedirects; hop++) {
    budget?.take();
    let res;
    try {
      res = await fetch(current, {
        method,
        redirect: 'manual',
        // Accept-Encoding as a browser sends it, so servers compress as they would
        // for a visitor and the performance analyzer sees Content-Encoding. Some
        // hosts (Vercel, seen from Cloudflare's edge) compress with Brotli only.
        // The runtime decodes the body either way.
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Encoding': 'gzip, deflate, br' },
        signal: AbortSignal.timeout(timeout)
      });
    } catch (err) {
      throw new FetchError(timedOut(err) ? 'The connection timed out before the server answered.' : 'The server could not be reached.');
    }
    const location = res.headers.get('location');
    if (REDIRECTS.has(res.status) && location) {
      const next = new URL(location, current).toString();
      redirects.push({ from: current, to: next, status: res.status });
      await res.body?.cancel();
      try {
        current = validate(next).url;
      } catch (err) {
        if (err instanceof UnsafeURL) throw new FetchError(`A redirect pointed at an address that cannot be examined (${err.message}).`);
        throw err;
      }
      continue;
    }
    const headers = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    let body = new Uint8Array(0);
    let truncated = false;
    if (method === 'GET') {
      try {
        ({ body, truncated } = await readLimited(res, maxBytes));
      } catch (err) {
        throw new FetchError(timedOut(err) ? 'The server started answering but did not finish in time.' : 'The server could not be reached.');
      }
    } else {
      await res.body?.cancel();
    }
    return {
      url: target.url,
      final_url: current,
      status: res.status,
      headers,
      body,
      text: decode(body),
      elapsed_ms: Date.now() - started,
      redirects,
      truncated,
      https: current.startsWith('https://')
    };
  }
  throw new FetchError('The address redirects too many times.');
}

/**
 * Cheap link check: HEAD, falling back to GET without reading the body.
 * Returns [status, final_url, redirects], or [null, null, []] on failure.
 * Budget exhaustion propagates so the caller can stop checking.
 */
export async function headOrGet(url, { timeout = 8000, budget } = {}) {
  try {
    let r = await fetchPage(url, { method: 'HEAD', timeout, maxBytes: 1, budget });
    if ([405, 403, 501].includes(r.status)) r = await fetchPage(url, { method: 'GET', timeout, maxBytes: 1024, budget });
    return [r.status, r.final_url, r.redirects];
  } catch (err) {
    if (err instanceof BudgetExhausted) throw err;
    if (err instanceof FetchError || err instanceof UnsafeURL) return [null, null, []];
    throw err;
  }
}
