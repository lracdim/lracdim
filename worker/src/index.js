/**
 * LRACDIMENSION API on Cloudflare Workers (free plan).
 *
 * Served here: health and the project-intake form, stored in D1.
 * Everything else under /api/ (Vector, Signal, Forge, studio) is forwarded
 * server-to-server to LEGACY_API_ORIGIN, the Python API, until it is ported.
 * With LEGACY_API_ORIGIN unset those routes answer 503.
 */
import { error, json, preflight, allowedOrigin, withCors, SECURITY_HEADERS } from './http.js';
import { PROJECT_TYPES, submissions, submit } from './contact.js';

async function health(env) {
  try {
    await env.DB.prepare('SELECT 1').first();
  } catch (err) {
    console.error('health: database unreachable', err && err.message);
    return json({ ok: false, database: 'd1', runtime: 'cloudflare-workers' }, 503);
  }
  return json({ ok: true, database: 'd1', runtime: 'cloudflare-workers', legacy: !!env.LEGACY_API_ORIGIN });
}

/** Forward to the Python API. Origin is dropped (CORS is answered here) and the
 * visitor's IP goes in X-Forwarded-For so per-visitor rate limits still apply. */
export async function forward(request, env, url) {
  const headers = new Headers();
  for (const name of ['content-type', 'accept', 'x-admin-key']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) headers.set('X-Forwarded-For', ip);
  const init = { method: request.method, headers, redirect: 'manual', signal: AbortSignal.timeout(25000) };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.arrayBuffer();

  let upstream;
  try {
    upstream = await fetch(env.LEGACY_API_ORIGIN.replace(/\/$/, '') + url.pathname + url.search, init);
  } catch (err) {
    console.warn(`legacy API unreachable: ${err && err.message}`);
    return error(502, 'upstream_unreachable', 'This feature is temporarily unavailable. Try again shortly.');
  }
  const out = new Headers(SECURITY_HEADERS);
  for (const name of ['content-type', 'retry-after']) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

async function route(request, env, ctx, url) {
  const { pathname } = url;
  const method = request.method;
  if (pathname === '/api/health' && method === 'GET') return health(env);
  if (pathname === '/api/contact/project-types' && method === 'GET') return json(PROJECT_TYPES);
  if (pathname === '/api/contact/submissions' && method === 'GET') return submissions(request, env);
  if (pathname === '/api/contact') {
    return method === 'POST' ? submit(request, env, ctx) : error(405, 'method_not_allowed', 'Use POST.');
  }
  if (pathname.startsWith('/api/')) {
    if (env.LEGACY_API_ORIGIN) return forward(request, env, url);
    return error(503, 'not_available', 'This feature is moving to the new API and is not available right now.');
  }
  return error(404, 'not_found', 'Not found.');
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return preflight(request, env);
    const url = new URL(request.url);
    let response;
    try {
      response = await route(request, env, ctx, url);
    } catch (err) {
      console.error(`unhandled error on ${request.method} ${url.pathname}`, (err && err.stack) || err);
      response = error(500, 'internal', 'Something went wrong on our side. It has been logged.');
    }
    return withCors(response, allowedOrigin(request, env));
  }
};
