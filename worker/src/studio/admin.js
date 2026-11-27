/**
 * Admin routes (/api/studio/v1/admin/*), ported from the Python engine's
 * routes/admin.py. Every handler gets {env, ctx, request, url, params, body,
 * user} and returns data (200), created(data) (201) or throws HttpError /
 * Invalid. The router has already checked that `user` is an admin.
 */
import { UnsafeURL, validateResolved } from '../ssrf.js';
import { INVITE_MS, inviteStatements, publicUser, startImpersonation } from './auth.js';
import { startAudit } from './audits.js';
import { PLANS, PLAN_NAMES } from './plans.js';
import { loadProspect, loadProspects, overlayStmt, STAGES } from './prospects.js';
import { ensureTarget, releaseTargetStmt, siteReport, siteSummaries } from './sites.js';
import {
  Invalid,
  activityOut,
  actorName,
  addDays,
  all,
  batch,
  bool,
  conflict,
  day,
  email,
  first,
  isMonth,
  logStmt,
  money,
  newId,
  notFound,
  nowIso,
  number,
  oneOf,
  stmt,
  str,
  thisMonth,
  today
} from './util.js';
import {
  INVOICE_KINDS,
  INVOICE_STATUSES,
  MILESTONE_STATUSES,
  PHASES,
  PRIORITIES,
  PROJECT_HEALTH,
  TICKET_STATUSES,
  WORK_CATEGORIES,
  adminOverview,
  adminWorklog,
  billingReport,
  clientOverview,
  invoiceOut,
  invoicesReport,
  loadClientRows,
  loadInvoices,
  loadProjects,
  loadTicket,
  loadTickets,
  ticketOut,
  workOut
} from './views.js';

export const created = (data) => ({ __status: 201, data });
const CLIENT_STATUSES = ['active', 'onboarding', 'paused', 'churned'];

async function getClient(env, id) {
  const c = await first(env, 'SELECT * FROM studio_clients WHERE id = ?', id);
  if (!c) throw notFound('Client not found.');
  return c;
}

async function clientRowOf(env, id) {
  return (await loadClientRows(env, id))[0];
}

/** Validate a website address for monitoring. Returns {url, host}; throws Invalid. */
async function safeSite(field, raw) {
  try {
    const { url, host } = await validateResolved(raw);
    return { url: url.replace(/\/$/, ''), host };
  } catch (err) {
    if (err instanceof UnsafeURL) throw new Invalid(field, err.message);
    throw err;
  }
}

/** Insert a site and register it with Signal. Returns the site id. */
async function addSite(env, ctx, admin, clientId, { name, url, host, platform = 'Unknown', hosting = 'Unknown', notes = '' }) {
  const dup = await first(env, 'SELECT id FROM studio_sites WHERE client_id = ? AND host = ?', clientId, host);
  if (dup) throw conflict('This client already has a website at that address.');
  const targetId = await ensureTarget(env, ctx, url, host);
  const id = newId();
  await batch(env, [
    stmt(env, 'INSERT INTO studio_sites (id, client_id, name, url, host, platform, hosting, notes, target_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, clientId, name, url, host, platform || 'Unknown', hosting || 'Unknown', notes || '', targetId, nowIso()),
    logStmt(env, actorName(admin), 'site.added', url)
  ]);
  return id;
}

/** A portal user (disabled until the invite is accepted) and its invite. */
async function newPortalUser(env, admin, clientId, address, name) {
  const taken = await first(env, 'SELECT id FROM studio_users WHERE email = ?', address);
  if (taken) throw conflict('A user with that email already exists.');
  const userId = newId();
  const inv = await inviteStatements(env, userId, admin.id);
  return {
    invite: { email: address, token: inv.token, expiresAt: inv.expiresAt },
    statements: [
      stmt(env, "INSERT INTO studio_users (id, email, name, role, client_id, password_hash, disabled, created_at) VALUES (?, ?, ?, 'client', ?, NULL, 1, ?)", userId, address, name, clientId, nowIso()),
      ...inv.statements
    ]
  };
}

/**
 * Shared by POST /clients and prospect conversion. With `website`, the site is
 * added to monitoring; `strictWebsite` false (conversion) skips a website the
 * SSRF policy refuses instead of failing, and reports it as a warning.
 */
async function createClient(env, ctx, admin, data, { strictWebsite = true } = {}) {
  let site = null;
  let warning = null;
  if (data.website) {
    try {
      site = await safeSite('website', data.website);
    } catch (err) {
      if (strictWebsite || !(err instanceof Invalid)) throw err;
      warning = `The website "${data.website}" was not added to monitoring: ${err.detail}`;
    }
  }
  const t = today();
  const plan = PLANS[data.plan];
  const id = newId();
  const now = nowIso();
  const portal = data.portalAccess ? await newPortalUser(env, admin, id, data.email, data.contactName) : null;
  await batch(env, [
    stmt(
      env,
      'INSERT INTO studio_clients (id, company, contact_name, email, phone, plan, mrr, included_hours, status, industry, since, renewal_date, notes, nps, created_at, updated_at) ' +
        "VALUES (?, ?, ?, ?, '', ?, ?, ?, 'onboarding', ?, ?, ?, '', NULL, ?, ?)",
      id,
      data.company,
      data.contactName,
      data.email,
      data.plan,
      plan.price,
      plan.includedHours,
      data.industry || '',
      t,
      addDays(t, 365),
      now,
      now
    ),
    ...(portal ? portal.statements : []),
    logStmt(env, actorName(admin), 'client.created', data.company)
  ]);
  if (site) await addSite(env, ctx, admin, id, { name: data.company, url: site.url, host: site.host });
  return { client: await clientRowOf(env, id), invite: portal ? portal.invite : null, warning };
}

/* ------------------------------------------------------------ overview */

export const overview = ({ env }) => adminOverview(env);

export async function activity({ env, url }) {
  const n = Number(url.searchParams.get('limit') || 100);
  const limit = Number.isInteger(n) && n >= 1 && n <= 500 ? n : 100;
  return (await all(env, 'SELECT * FROM studio_activity ORDER BY at DESC, id DESC LIMIT ?', limit)).map(activityOut);
}

/* ------------------------------------------------------------ clients */

export const listClients = ({ env }) => loadClientRows(env);

export async function addClient({ env, ctx, body, user }) {
  const data = {
    company: str(body, 'company', { min: 2, max: 160, required: true }),
    contactName: str(body, 'contactName', { min: 2, max: 120, required: true }),
    email: email(body, 'email'),
    plan: oneOf(body, 'plan', PLAN_NAMES, { fallback: 'Essentials' }),
    industry: str(body, 'industry', { max: 80, fallback: '' }),
    website: str(body, 'website', { max: 300 }),
    portalAccess: bool(body, 'portalAccess', false)
  };
  return created(await createClient(env, ctx, user, data));
}

export async function clientDetail({ env, params }) {
  await getClient(env, params.id);
  const [overviewData, row, projects, tickets, billing, users] = await Promise.all([
    clientOverview(env, params.id),
    clientRowOf(env, params.id),
    loadProjects(env, 'p.client_id = ?', params.id),
    loadTickets(env, 't.client_id = ?', params.id),
    billingReport(env, params.id),
    all(env, 'SELECT * FROM studio_users WHERE client_id = ? ORDER BY created_at', params.id)
  ]);
  // The admin sees drafts too, which the client's billing view leaves out.
  const drafts = (await loadInvoices(env, "i.client_id = ? AND i.status = 'draft'", params.id)).map((i) => invoiceOut(i));
  return {
    ...overviewData,
    row,
    projects,
    tickets: tickets.map((x) => ticketOut(x)),
    billing: { ...billing, invoices: [...drafts, ...billing.invoices] },
    users: users.map((u) => publicUser(u))
  };
}

export async function updateClient({ env, params, body, user }) {
  const c = await getClient(env, params.id);
  const changes = {};
  const set = (col, v) => {
    if (v !== null && v !== undefined) changes[col] = v;
  };
  set('company', str(body, 'company', { min: 2, max: 160 }));
  set('contact_name', str(body, 'contactName', { min: 2, max: 120 }));
  set('email', email(body, 'email', { required: false }));
  set('industry', str(body, 'industry', { max: 80 }));
  set('phone', str(body, 'phone', { max: 40 }));
  set('status', oneOf(body, 'status', CLIENT_STATUSES));
  set('renewal_date', day(body, 'renewalDate'));
  if (typeof body.notes === 'string') changes.notes = str(body, 'notes', { max: 5000, fallback: '' }) ?? '';
  const plan = oneOf(body, 'plan', PLAN_NAMES);
  if (plan) Object.assign(changes, { plan, mrr: PLANS[plan].price, included_hours: PLANS[plan].includedHours });
  if ('nps' in body) changes.nps = body.nps === null || body.nps === '' ? null : number(body, 'nps', { min: 0, max: 10, integer: true });
  const cols = Object.keys(changes);
  if (cols.length) {
    await batch(env, [
      stmt(env, `UPDATE studio_clients SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...cols.map((k) => changes[k]), nowIso(), c.id),
      logStmt(env, actorName(user), 'client.updated', changes.company || c.company, cols.join(', '))
    ]);
  }
  return clientRowOf(env, c.id);
}

/** "View as client": a one-hour session as the client's portal user, recorded with the admin's id. */
export async function impersonate({ env, request, params, user }) {
  const c = await getClient(env, params.id);
  const target = await first(env, "SELECT * FROM studio_users WHERE client_id = ? AND role = 'client' ORDER BY disabled ASC, created_at ASC LIMIT 1", c.id);
  if (!target) throw conflict('This client has no portal user yet. Invite them first.');
  const s = await startImpersonation(env, request, user, target);
  await batch(env, [...s.statements, logStmt(env, user.name, 'client.impersonated', c.company)]);
  return { token: s.token, expiresAt: s.expiresAt, user: publicUser(target, { id: user.id, name: user.name }) };
}

/**
 * Create the client's portal user and its invite, or issue a fresh invite to
 * an existing one (which also resets an active user's password when accepted).
 */
export async function inviteClientUser({ env, params, body, user }) {
  const c = await getClient(env, params.id);
  const existing = body.userId
    ? await first(env, "SELECT * FROM studio_users WHERE id = ? AND client_id = ? AND role = 'client'", String(body.userId), c.id)
    : await first(env, "SELECT * FROM studio_users WHERE client_id = ? AND role = 'client' ORDER BY created_at ASC LIMIT 1", c.id);
  if (body.userId && !existing) throw notFound('User not found.');
  if (existing) {
    const inv = await inviteStatements(env, existing.id, user.id);
    await batch(env, [...inv.statements, logStmt(env, actorName(user), 'client.invite_issued', c.company, existing.email)]);
    return created({ invite: { email: existing.email, token: inv.token, expiresAt: inv.expiresAt }, user: publicUser(existing) });
  }
  const address = email(body, 'email', { required: false }) || c.email;
  const name = str(body, 'name', { min: 2, max: 120 }) || c.contact_name;
  const portal = await newPortalUser(env, user, c.id, address, name);
  await batch(env, [...portal.statements, logStmt(env, actorName(user), 'client.invite_issued', c.company, address)]);
  const u = await first(env, 'SELECT * FROM studio_users WHERE email = ?', address);
  return created({ invite: portal.invite, user: publicUser(u) });
}

/* ------------------------------------------------------------ sites */

export const listSites = ({ env }) => siteSummaries(env);

async function getSite(env, id) {
  const [s] = await siteSummaries(env, 's.id = ?', id);
  if (!s) throw notFound('Website not found.');
  return s;
}

export async function addSiteRoute({ env, ctx, body, user }) {
  const clientId = str(body, 'clientId', { required: true, max: 64 });
  await getClient(env, clientId);
  const name = str(body, 'name', { min: 1, max: 120, required: true });
  const site = await safeSite('url', str(body, 'url', { min: 4, max: 300, required: true }));
  const id = await addSite(env, ctx, user, clientId, {
    name,
    ...site,
    platform: str(body, 'platform', { max: 60, fallback: 'Unknown' }),
    hosting: str(body, 'hosting', { max: 60, fallback: 'Unknown' }),
    notes: str(body, 'notes', { max: 2000, fallback: '' })
  });
  return created(await getSite(env, id));
}

export async function updateSite({ env, params, body, user }) {
  const s = await getSite(env, params.id);
  const changes = {};
  for (const [col, field, max] of [['name', 'name', 120], ['platform', 'platform', 60], ['hosting', 'hosting', 60], ['notes', 'notes', 2000]]) {
    const v = str(body, field, { max, min: col === 'name' ? 1 : 0 });
    if (v !== null) changes[col] = v;
  }
  const cols = Object.keys(changes);
  if (cols.length) {
    await batch(env, [
      stmt(env, `UPDATE studio_sites SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...cols.map((k) => changes[k]), s.id),
      logStmt(env, actorName(user), 'site.updated', s.url, cols.join(', '))
    ]);
  }
  return getSite(env, s.id);
}

/** Removes the site; its Signal target stops being checked unless something else uses it. Vector history stays. */
export async function deleteSite({ env, params, user }) {
  const s = await getSite(env, params.id);
  await batch(env, [
    stmt(env, 'UPDATE studio_worklog SET site_id = NULL WHERE site_id = ?', s.id),
    ...(s.monitoring.targetId ? [releaseTargetStmt(env, s.monitoring.targetId, s.id)] : []),
    stmt(env, 'DELETE FROM studio_sites WHERE id = ?', s.id),
    logStmt(env, actorName(user), 'site.removed', s.url)
  ]);
  return { ok: true };
}

export async function siteHealth({ env, params }) {
  return siteReport(env, await getSite(env, params.id));
}

/** "Re-scan": a new Vector examination of the site, polled through the site report. */
export async function scanSite({ env, ctx, params, user }) {
  const s = await getSite(env, params.id);
  const audit = await startAudit(env, ctx, s.url, { key: `user:${user.id}`, limit: env.RATE_LIMIT_STUDIO_AUDITS || '30/hour' });
  await batch(env, [logStmt(env, actorName(user), 'scan.started', s.url)]);
  return { __status: 202, data: audit };
}

/* ------------------------------------------------------------ pipeline */

export const listProspects = ({ env }) => loadProspects(env);

async function getProspect(env, id) {
  const p = await loadProspect(env, id);
  if (!p) throw notFound('Prospect not found.');
  return p;
}

export async function updateProspect({ env, params, body, user }) {
  const p = await getProspect(env, params.id);
  const stage = oneOf(body, 'stage', STAGES);
  const value = number(body, 'value', { min: 0, max: 10_000_000 });
  const notes = typeof body.notes === 'string' ? str(body, 'notes', { max: 5000, fallback: '' }) ?? '' : null;
  await batch(env, [
    overlayStmt(env, p, { stage: stage ?? p.stage, value: value ?? p.value, notes: notes ?? p.notes, clientId: p.clientId }),
    ...(stage && stage !== p.stage ? [logStmt(env, actorName(user), 'prospect.stage', p.company, stage)] : [])
  ]);
  return getProspect(env, p.id);
}

export async function convertProspect({ env, ctx, params, body, url, user }) {
  const p = await getProspect(env, params.id);
  if (p.clientId) throw conflict('Already converted.');
  const plan = oneOf(body, 'plan', PLAN_NAMES) || oneOf({ plan: url.searchParams.get('plan') }, 'plan', PLAN_NAMES, { fallback: 'Essentials' });
  const out = await createClient(
    env,
    ctx,
    user,
    {
      company: p.company.slice(0, 160),
      contactName: p.name.slice(0, 120),
      email: p.email,
      plan,
      industry: '',
      website: p.website || null,
      portalAccess: bool(body, 'portalAccess', false)
    },
    { strictWebsite: false }
  );
  await batch(env, [overlayStmt(env, p, { stage: 'won', value: p.value, notes: p.notes, clientId: out.client.id }), logStmt(env, actorName(user), 'prospect.converted', p.company)]);
  return created(out);
}

/* ------------------------------------------------------------ projects */

export const listProjects = ({ env }) => loadProjects(env);

async function getProject(env, id) {
  const [p] = await loadProjects(env, 'p.id = ?', id);
  if (!p) throw notFound('Project not found.');
  return p;
}

export async function addProject({ env, body, user }) {
  const clientId = str(body, 'clientId', { required: true, max: 64 });
  const c = await getClient(env, clientId);
  const id = newId();
  const name = str(body, 'name', { min: 2, max: 160, required: true });
  await batch(env, [
    stmt(
      env,
      "INSERT INTO studio_projects (id, client_id, name, type, phase, start_date, due_date, budget, hours_budget, hours_logged, health, created_at) VALUES (?, ?, ?, ?, 'discovery', ?, ?, ?, ?, 0, 'on_track', ?)",
      id,
      c.id,
      name,
      str(body, 'type', { max: 60, fallback: 'Project' }),
      day(body, 'startDate', { fallback: today() }),
      day(body, 'dueDate', { required: true }),
      number(body, 'budget', { min: 0, max: 10_000_000, required: true }),
      number(body, 'hoursBudget', { min: 0, max: 10_000, required: true }),
      nowIso()
    ),
    logStmt(env, actorName(user), 'project.created', name, c.company)
  ]);
  return created(await getProject(env, id));
}

export async function updateProject({ env, params, body, user }) {
  const p = await getProject(env, params.id);
  const changes = {};
  const set = (col, v) => {
    if (v !== null && v !== undefined) changes[col] = v;
  };
  set('phase', oneOf(body, 'phase', PHASES));
  set('health', oneOf(body, 'health', PROJECT_HEALTH));
  set('hours_logged', number(body, 'hoursLogged', { min: 0, max: 10_000 }));
  set('due_date', day(body, 'dueDate'));
  set('name', str(body, 'name', { min: 2, max: 160 }));
  set('budget', number(body, 'budget', { min: 0, max: 10_000_000 }));
  set('hours_budget', number(body, 'hoursBudget', { min: 0, max: 10_000 }));
  const cols = Object.keys(changes);
  if (cols.length) {
    await batch(env, [
      stmt(env, `UPDATE studio_projects SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...cols.map((k) => changes[k]), p.id),
      logStmt(env, actorName(user), 'project.updated', p.name, cols.map((k) => `${k}=${changes[k]}`).join(', '))
    ]);
  }
  return getProject(env, p.id);
}

export async function advanceProject({ env, params, user }) {
  const p = await getProject(env, params.id);
  const i = PHASES.indexOf(p.phase);
  if (i === PHASES.length - 1) throw conflict('Project is already in maintenance.');
  const next = PHASES[i + 1];
  await batch(env, [
    stmt(env, `UPDATE studio_projects SET phase = ?${next === 'maintenance' ? ", health = 'complete'" : ''} WHERE id = ?`, next, p.id),
    logStmt(env, actorName(user), 'project.advanced', p.name, next)
  ]);
  return getProject(env, p.id);
}

export async function addMilestone({ env, params, body, user }) {
  const p = await getProject(env, params.id);
  const title = str(body, 'title', { min: 2, max: 160, required: true });
  await batch(env, [
    stmt(
      env,
      "INSERT INTO studio_milestones (id, project_id, title, due_date, status, needs_approval, created_at) VALUES (?, ?, ?, ?, 'upcoming', ?, ?)",
      newId(),
      p.id,
      title,
      day(body, 'dueDate', { required: true }),
      bool(body, 'needsApproval', false) ? 1 : 0,
      nowIso()
    ),
    logStmt(env, actorName(user), 'milestone.added', `${title} — ${p.name}`)
  ]);
  return created(await getProject(env, p.id));
}

export async function updateMilestone({ env, params, body, user }) {
  const p = await getProject(env, params.id);
  const m = p.milestones.find((x) => x.id === params.mid);
  if (!m) throw notFound('Milestone not found.');
  const status = oneOf(body, 'status', MILESTONE_STATUSES, { required: true });
  await batch(env, [
    // Marking done by the studio is not a client approval, so approved_* stay empty.
    stmt(env, 'UPDATE studio_milestones SET status = ? WHERE id = ?', status, m.id),
    logStmt(env, actorName(user), `milestone.${status}`, `${m.title} — ${p.name}`)
  ]);
  return getProject(env, p.id);
}

/* ------------------------------------------------------------ support */

export async function listTickets({ env }) {
  return (await loadTickets(env)).map((t) => ticketOut(t));
}

async function getTicket(env, id) {
  const t = await loadTicket(env, id);
  if (!t) throw notFound('Ticket not found.');
  return t;
}

export const ticketDetail = ({ env, params }) => getTicket(env, params.id);

export async function updateTicket({ env, params, body, user }) {
  const t = await getTicket(env, params.id);
  const status = oneOf(body, 'status', TICKET_STATUSES);
  const priority = oneOf(body, 'priority', PRIORITIES);
  // As in services.py, the SLA target is fixed when the ticket opens; changing the priority does not move it.
  await batch(env, [
    stmt(env, 'UPDATE studio_tickets SET status = COALESCE(?, status), priority = COALESCE(?, priority), updated_at = ? WHERE id = ?', status, priority, nowIso(), t.id),
    ...(status ? [logStmt(env, actorName(user), `ticket.${status}`, `#${t.number} ${t.subject}`)] : [])
  ]);
  return getTicket(env, t.id);
}

export async function replyTicket({ env, params, body, user }) {
  const t = await getTicket(env, params.id);
  const text = str(body, 'body', { min: 1, max: 5000, required: true });
  const at = nowIso();
  await batch(env, [
    stmt(env, "INSERT INTO studio_ticket_messages (id, ticket_id, author, role, body, at) VALUES (?, ?, ?, 'admin', ?, ?)", newId(), t.id, user.name, text, at),
    stmt(env, "UPDATE studio_tickets SET updated_at = ?, status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END WHERE id = ?", at, t.id),
    logStmt(env, actorName(user), 'ticket.replied', `#${t.number} ${t.subject}`)
  ]);
  return getTicket(env, t.id);
}

/* ------------------------------------------------------------ billing */

export const listInvoices = ({ env }) => invoicesReport(env);

export async function addInvoice({ env, body, user }) {
  const clientId = str(body, 'clientId', { required: true, max: 64 });
  const c = await getClient(env, clientId);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) throw new Invalid('items', 'Add between 1 and 50 line items.');
  const items = body.items.map((it, n) => {
    if (!it || typeof it !== 'object') throw new Invalid(`items.${n}`, 'Must be a line item.');
    return {
      description: str(it, 'description', { min: 1, max: 200, required: true }),
      quantity: number(it, 'quantity', { min: 0.01, max: 10_000, required: true }),
      unitPrice: number(it, 'unitPrice', { min: 0, max: 1_000_000, required: true })
    };
  });
  const amount = money(items.reduce((a, i) => a + i.quantity * i.unitPrice, 0));
  const dueIn = number(body, 'dueInDays', { min: 0, max: 120, integer: true, fallback: 14 });
  const kind = oneOf(body, 'kind', INVOICE_KINDS, { fallback: 'one_off' });
  const send = bool(body, 'send', true);
  const t = today();
  const id = newId();
  // LD-2026001, LD-2026002, …: one more than the highest number so far, as the Python engine numbered them.
  const max = await first(env, "SELECT MAX(CAST(substr(number, 4) AS INTEGER)) AS n FROM studio_invoices WHERE number LIKE 'LD-%'");
  const number_ = `LD-${Math.max(max?.n || 0, 2026000) + 1}`;
  await batch(env, [
    stmt(
      env,
      'INSERT INTO studio_invoices (id, number, client_id, kind, issued_at, due_at, status, paid_at, items, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)',
      id,
      number_,
      c.id,
      kind,
      t,
      addDays(t, dueIn),
      send ? 'sent' : 'draft',
      JSON.stringify(items),
      amount,
      nowIso()
    ),
    logStmt(env, actorName(user), 'invoice.created', `${number_} · ${c.company} · $${amount.toLocaleString('en-US')}`)
  ]);
  const [row] = await loadInvoices(env, 'i.id = ?', id);
  return created(invoiceOut(row));
}

export async function updateInvoice({ env, params, body, user }) {
  const [inv] = await loadInvoices(env, 'i.id = ?', params.id);
  if (!inv) throw notFound('Invoice not found.');
  const status = oneOf(body, 'status', INVOICE_STATUSES, { required: true });
  await batch(env, [
    stmt(env, 'UPDATE studio_invoices SET status = ?, paid_at = ? WHERE id = ?', status, status === 'paid' ? today() : null, inv.id),
    logStmt(env, actorName(user), `invoice.${status}`, inv.number)
  ]);
  const [row] = await loadInvoices(env, 'i.id = ?', inv.id);
  return invoiceOut(row);
}

/* ------------------------------------------------------------ work log */

export async function worklog({ env, url }) {
  const m = url.searchParams.get('month');
  const clientId = url.searchParams.get('clientId');
  return adminWorklog(env, isMonth(m) ? m : thisMonth(), clientId || null);
}

export async function addWork({ env, body, user }) {
  const clientId = str(body, 'clientId', { required: true, max: 64 });
  const c = await getClient(env, clientId);
  const siteId = str(body, 'siteId', { max: 64 });
  if (siteId && !(await first(env, 'SELECT id FROM studio_sites WHERE id = ? AND client_id = ?', siteId, c.id))) throw new Invalid('siteId', 'That website does not belong to this client.');
  const id = newId();
  const title = str(body, 'title', { min: 2, max: 200, required: true });
  await batch(env, [
    stmt(
      env,
      'INSERT INTO studio_worklog (id, client_id, site_id, date, category, title, minutes, by_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      c.id,
      siteId,
      day(body, 'date', { required: true }),
      oneOf(body, 'category', WORK_CATEGORIES, { required: true }),
      title,
      number(body, 'minutes', { min: 5, max: 1440, integer: true, required: true }),
      user.name,
      nowIso()
    ),
    logStmt(env, actorName(user), 'work.logged', `${c.company} · ${title}`)
  ]);
  const row = await first(env, 'SELECT w.*, c.company FROM studio_worklog w JOIN studio_clients c ON c.id = w.client_id WHERE w.id = ?', id);
  return created(workOut(row));
}

export async function deleteWork({ env, params, user }) {
  const w = await first(env, 'SELECT * FROM studio_worklog WHERE id = ?', params.id);
  if (!w) throw notFound('Entry not found.');
  await batch(env, [stmt(env, 'DELETE FROM studio_worklog WHERE id = ?', w.id), logStmt(env, actorName(user), 'work.deleted', w.title)]);
  return { ok: true };
}

/* ------------------------------------------------------------ settings */

export async function settings({ env }) {
  const [team, counts, studioTargets] = await Promise.all([
    all(env, "SELECT * FROM studio_users WHERE role = 'admin' ORDER BY created_at"),
    first(
      env,
      `SELECT (SELECT COUNT(*) FROM studio_clients) AS clients, (SELECT COUNT(*) FROM studio_sites) AS sites, (SELECT COUNT(*) FROM studio_projects) AS projects,
              (SELECT COUNT(*) FROM studio_tickets) AS tickets, (SELECT COUNT(*) FROM studio_invoices) AS invoices, (SELECT COUNT(*) FROM studio_worklog) AS worklog,
              (SELECT COUNT(*) FROM studio_users WHERE role = 'client') AS portalUsers`
    ),
    first(env, "SELECT COUNT(*) AS n FROM monitoring_targets WHERE enabled = 1 AND source IN ('admin', 'studio')")
  ]);
  return {
    environment: 'cloudflare-workers',
    plans: PLANS,
    team: team.map((u) => publicUser(u)),
    integrations: [
      { key: 'vector', name: 'Vector website examinations', status: 'connected', detail: 'Health score and eight category scores for every client site and audit' },
      { key: 'signal', name: 'Signal uptime monitoring', status: 'connected', detail: `Checked every 5 minutes by the cron, at most 8 sites per run (${studioTargets?.n || 0} sites on the 5-minute cadence now)` },
      { key: 'email', name: 'Portal email', status: 'not_connected', detail: 'Invites are links the studio copies and sends; the portal sends no email' },
      { key: 'payments', name: 'Payments', status: 'not_connected', detail: 'Invoices are records only; payments are marked by hand' }
    ],
    inviteDays: INVITE_MS / 86_400_000,
    storage: { backend: 'd1', counts: counts || {} }
  };
}
