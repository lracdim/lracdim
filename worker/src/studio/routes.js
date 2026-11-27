/**
 * The studio dashboard's API, mounted at /api/studio. Paths after the prefix
 * are the Python engine's (/v1/auth/login, /v1/admin/overview, …), so the
 * dashboard only needs VITE_API_URL=<worker origin>/api/studio.
 *
 * Unknown paths answer 404 before any authentication, as every other Worker
 * route does. Known paths then require: nothing (health, sign-in, invites), a
 * session (me, logout), an admin session ('admin'; a "view as client" session
 * is a client session and cannot use admin routes), or a client session
 * ('client').
 */
import { error, json, readJson } from '../http.js';
import * as admin from './admin.js';
import * as auth from './auth.js';
import * as audits from './audits.js';
import * as client from './client.js';
import { HttpError, Invalid } from './util.js';

export { rollupUptime } from './sites.js';
export { pruneAnonymisedStmts } from './prospects.js';

const ID = '([0-9a-f]{32})';
const PROSPECT = '((?:contact|report)-[0-9a-f]{32})';

// [method, path pattern, access, handler]. Patterns are anchored and their groups become params.
const ROUTES = [
  ['GET', '/health', 'public', () => ({ ok: true, service: 'studio' })],
  ['POST', '/v1/auth/login', 'public', auth.login],
  ['POST', '/v1/auth/invite-info', 'public', auth.inviteInfo],
  ['POST', '/v1/auth/accept-invite', 'public', auth.acceptInvite],
  ['GET', '/v1/auth/me', 'session', auth.me],
  ['POST', '/v1/auth/logout', 'session', auth.logout],

  ['GET', '/v1/admin/overview', 'admin', admin.overview],
  ['GET', '/v1/admin/activity', 'admin', admin.activity],
  ['GET', '/v1/admin/settings', 'admin', admin.settings],
  ['GET', '/v1/admin/clients', 'admin', admin.listClients],
  ['POST', '/v1/admin/clients', 'admin', admin.addClient],
  ['GET', `/v1/admin/clients/${ID}`, 'admin', admin.clientDetail, ['id']],
  ['PATCH', `/v1/admin/clients/${ID}`, 'admin', admin.updateClient, ['id']],
  ['POST', `/v1/admin/clients/${ID}/impersonate`, 'admin', admin.impersonate, ['id']],
  ['POST', `/v1/admin/clients/${ID}/invite`, 'admin', admin.inviteClientUser, ['id']],
  ['GET', '/v1/admin/sites', 'admin', admin.listSites],
  ['POST', '/v1/admin/sites', 'admin', admin.addSiteRoute],
  ['PATCH', `/v1/admin/sites/${ID}`, 'admin', admin.updateSite, ['id']],
  ['DELETE', `/v1/admin/sites/${ID}`, 'admin', admin.deleteSite, ['id']],
  ['GET', `/v1/admin/sites/${ID}/health`, 'admin', admin.siteHealth, ['id']],
  ['POST', `/v1/admin/sites/${ID}/scan`, 'admin', admin.scanSite, ['id']],
  ['GET', '/v1/admin/audits', 'admin', audits.recentAudits],
  ['POST', '/v1/admin/audits', 'admin', (c) => audits.adminStart(c).then((data) => ({ __status: 202, data }))],
  ['GET', `/v1/admin/audits/${ID}`, 'admin', audits.auditDetail, ['id']],
  ['GET', '/v1/admin/prospects', 'admin', admin.listProspects],
  ['PATCH', `/v1/admin/prospects/${PROSPECT}`, 'admin', admin.updateProspect, ['id']],
  ['POST', `/v1/admin/prospects/${PROSPECT}/convert`, 'admin', admin.convertProspect, ['id']],
  ['GET', '/v1/admin/projects', 'admin', admin.listProjects],
  ['POST', '/v1/admin/projects', 'admin', admin.addProject],
  ['PATCH', `/v1/admin/projects/${ID}`, 'admin', admin.updateProject, ['id']],
  ['POST', `/v1/admin/projects/${ID}/advance`, 'admin', admin.advanceProject, ['id']],
  ['POST', `/v1/admin/projects/${ID}/milestones`, 'admin', admin.addMilestone, ['id']],
  ['PATCH', `/v1/admin/projects/${ID}/milestones/${ID}`, 'admin', admin.updateMilestone, ['id', 'mid']],
  ['GET', '/v1/admin/tickets', 'admin', admin.listTickets],
  ['GET', `/v1/admin/tickets/${ID}`, 'admin', admin.ticketDetail, ['id']],
  ['PATCH', `/v1/admin/tickets/${ID}`, 'admin', admin.updateTicket, ['id']],
  ['POST', `/v1/admin/tickets/${ID}/messages`, 'admin', admin.replyTicket, ['id']],
  ['GET', '/v1/admin/invoices', 'admin', admin.listInvoices],
  ['POST', '/v1/admin/invoices', 'admin', admin.addInvoice],
  ['PATCH', `/v1/admin/invoices/${ID}`, 'admin', admin.updateInvoice, ['id']],
  ['GET', '/v1/admin/worklog', 'admin', admin.worklog],
  ['POST', '/v1/admin/worklog', 'admin', admin.addWork],
  ['DELETE', `/v1/admin/worklog/${ID}`, 'admin', admin.deleteWork, ['id']],

  ['GET', '/v1/client/overview', 'client', client.overview],
  ['GET', '/v1/client/sites', 'client', client.sites],
  ['GET', `/v1/client/sites/${ID}/health`, 'client', client.siteHealth, ['id']],
  ['POST', `/v1/client/sites/${ID}/scan`, 'client', client.scanSite, ['id']],
  ['GET', '/v1/client/projects', 'client', client.projects],
  ['POST', `/v1/client/projects/${ID}/milestones/${ID}/approve`, 'client', client.approve, ['id', 'mid']],
  ['GET', '/v1/client/worklog', 'client', client.worklog],
  ['GET', '/v1/client/billing', 'client', client.billing],
  ['GET', '/v1/client/reports/([^/]+)', 'client', client.report, ['month']],
  ['GET', '/v1/client/tickets', 'client', client.tickets],
  ['POST', '/v1/client/tickets', 'client', client.createTicket],
  ['GET', `/v1/client/tickets/${ID}`, 'client', client.ticket, ['id']],
  ['POST', `/v1/client/tickets/${ID}/messages`, 'client', client.reply, ['id']]
].map(([method, path, access, handler, names = []]) => ({ method, re: new RegExp(`^${path}$`), access, handler, names }));

const MAX_BODY = 64 * 1024;

function match(method, path) {
  let pathMatched = false;
  for (const r of ROUTES) {
    const m = r.re.exec(path);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== method) continue;
    return { route: r, params: Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return pathMatched ? 'method' : null;
}

/** Handles every /api/studio/* request. */
export async function studioRoute(request, env, ctx, url) {
  const path = url.pathname.slice('/api/studio'.length) || '/';
  const found = match(request.method, path);
  if (!found) return error(404, 'not_found', 'Not found.');
  if (found === 'method') return error(405, 'method_not_allowed', 'Method not allowed.');
  const { route, params } = found;
  try {
    let user = null;
    if (route.access !== 'public') {
      user = await auth.authenticate(request, env);
      if (route.access === 'admin' && (user.role !== 'admin' || user.impersonating)) throw new HttpError(403, 'forbidden', 'Admins only.');
      if (route.access === 'client' && (user.role !== 'client' || !user.clientId)) throw new HttpError(403, 'forbidden', 'Client accounts only.');
    }
    let body = {};
    if (request.method === 'POST' || request.method === 'PATCH' || request.method === 'PUT') {
      const raw = await request.clone().text();
      if (raw.trim()) {
        const [parsed, bad] = await readJson(request, MAX_BODY);
        if (bad) return bad;
        body = parsed;
      }
    }
    const result = await route.handler({ request, env, ctx, url, params, body, user });
    if (result instanceof Response) return result;
    if (result && result.__status) return json(result.data, result.__status);
    return json(result ?? { ok: true });
  } catch (err) {
    if (err instanceof Invalid) return error(422, 'validation', err.message, [{ field: err.field, message: err.detail }]);
    if (err instanceof HttpError) return error(err.status, err.code, err.message);
    throw err;
  }
}
