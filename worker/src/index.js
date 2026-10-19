/**
 * LRACDIMENSION API on Cloudflare Workers (free plan), backed by D1.
 *
 * Serves everything the public site calls: health, the project-intake form,
 * Vector examinations, Signal scans and monitoring, and the Forge tools.
 * Scheduled Signal checks run from the Cron Trigger in wrangler.jsonc.
 */
import { error, json, preflight, allowedOrigin, withCors } from './http.js';
import { PROJECT_TYPES, submissions, submit } from './contact.js';
import { vectorRoute } from './vector.js';
import { signalRoute, sweep } from './signal.js';
import { forgeRoute } from './forge.js';

async function health(env) {
  try {
    await env.DB.prepare('SELECT 1').first();
  } catch (err) {
    console.error('health: database unreachable', err && err.message);
    return json({ ok: false, database: 'd1', runtime: 'cloudflare-workers' }, 503);
  }
  return json({ ok: true, database: 'd1', runtime: 'cloudflare-workers' });
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
  const handler = pathname.startsWith('/api/vector/') ? vectorRoute : pathname.startsWith('/api/signal/') ? signalRoute : pathname.startsWith('/api/forge/') ? forgeRoute : null;
  const response = handler ? await handler(request, env, ctx, url) : null;
  return response || error(404, 'not_found', 'Not found.');
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
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      sweep(env, event.scheduledTime).catch((err) => console.error('signal sweep failed', (err && err.stack) || err))
    );
  }
};
