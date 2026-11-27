/**
 * Client portal routes (/api/studio/v1/client/*), ported from the Python
 * engine's routes/client.py. Every query is scoped to the signed-in user's own
 * client: another client's ids answer 404, never 403, so their existence is
 * not revealed. The router has already checked the role.
 */
import { startAudit } from './audits.js';
import { siteReport, siteSummaries } from './sites.js';
import { HttpError, actorName, batch, first, isMonth, logStmt, newId, notFound, nowIso, oneOf, stmt, str, thisMonth } from './util.js';
import {
  PRIORITIES,
  SLA,
  TICKET_CATEGORIES,
  billingReport,
  clientOverview,
  loadProjects,
  loadTicket,
  loadTickets,
  monthlyReport,
  ticketOut,
  worklogReport
} from './views.js';

const cid = (user) => user.clientId;

export const overview = ({ env, user }) => clientOverview(env, cid(user));

export const sites = ({ env, user }) => siteSummaries(env, 's.client_id = ?', cid(user));

async function ownSite(env, user, id) {
  const [s] = await siteSummaries(env, 's.id = ? AND s.client_id = ?', id, cid(user));
  if (!s) throw notFound('Website not found.');
  return s;
}

export async function siteHealth({ env, params, user }) {
  return siteReport(env, await ownSite(env, user, params.id));
}

/** A fresh Vector examination of one of the client's sites: three per user an hour. */
export async function scanSite({ env, ctx, params, user }) {
  const s = await ownSite(env, user, params.id);
  const audit = await startAudit(env, ctx, s.url, { key: `user:${user.id}`, limit: env.RATE_LIMIT_STUDIO_CLIENT_SCANS || '3/hour' });
  await batch(env, [logStmt(env, actorName(user), 'scan.requested', s.url)]);
  return { __status: 202, data: audit };
}

export const projects = ({ env, user }) => loadProjects(env, 'p.client_id = ?', cid(user));

export async function approve({ env, params, user }) {
  const m = await first(
    env,
    'SELECT m.*, p.name AS project_name FROM studio_milestones m JOIN studio_projects p ON p.id = m.project_id WHERE m.id = ? AND p.id = ? AND p.client_id = ?',
    params.mid,
    params.id,
    cid(user)
  );
  if (!m) throw notFound('Milestone not found.');
  if (m.status !== 'awaiting_approval') throw new HttpError(409, 'conflict', 'This milestone is not waiting for approval.');
  await batch(env, [
    stmt(env, "UPDATE studio_milestones SET status = 'done', approved_at = ?, approved_by = ? WHERE id = ?", nowIso(), actorName(user), m.id),
    logStmt(env, actorName(user), 'milestone.approved', `${m.title} — ${m.project_name}`)
  ]);
  const [p] = await loadProjects(env, 'p.id = ?', params.id);
  return p;
}

export function worklog({ env, url, user }) {
  const m = url.searchParams.get('month');
  return worklogReport(env, cid(user), isMonth(m) ? m : thisMonth());
}

export const billing = ({ env, user }) => billingReport(env, cid(user));

export function report({ env, params, user }) {
  if (!isMonth(params.month)) throw new HttpError(422, 'validation', 'Month must look like 2026-11.');
  return monthlyReport(env, cid(user), params.month);
}

/* ------------------------------------------------------------ support */

export async function tickets({ env, user }) {
  return (await loadTickets(env, 't.client_id = ?', cid(user))).map((t) => ticketOut(t));
}

async function ownTicket(env, user, id) {
  const t = await loadTicket(env, id, 't.client_id = ?', cid(user));
  if (!t) throw notFound('Request not found.');
  return t;
}

export const ticket = ({ env, params, user }) => ownTicket(env, user, params.id);

export async function createTicket({ env, body, user }) {
  const subject = str(body, 'subject', { min: 3, max: 160, required: true });
  const text = str(body, 'body', { min: 1, max: 5000, required: true });
  const category = oneOf(body, 'category', TICKET_CATEGORIES, { fallback: 'question' });
  const priority = oneOf(body, 'priority', PRIORITIES, { fallback: 'normal' });
  const id = newId();
  const at = nowIso();
  // The number is taken inside the INSERT, so two requests cannot read the same maximum.
  await batch(env, [
    stmt(
      env,
      "INSERT INTO studio_tickets (id, number, client_id, subject, category, priority, status, sla_hours, created_at, updated_at) SELECT ?, COALESCE(MAX(number), 1000) + 1, ?, ?, ?, ?, 'open', ?, ?, ? FROM studio_tickets",
      id,
      cid(user),
      subject,
      category,
      priority,
      SLA[priority],
      at,
      at
    ),
    stmt(env, "INSERT INTO studio_ticket_messages (id, ticket_id, author, role, body, at) VALUES (?, ?, ?, 'client', ?, ?)", newId(), id, user.name, text, at),
    logStmt(env, actorName(user), 'ticket.created', subject)
  ]);
  return { __status: 201, data: await ownTicket(env, user, id) };
}

export async function reply({ env, params, body, user }) {
  const t = await ownTicket(env, user, params.id);
  const text = str(body, 'body', { min: 1, max: 5000, required: true });
  const at = nowIso();
  await batch(env, [
    stmt(env, "INSERT INTO studio_ticket_messages (id, ticket_id, author, role, body, at) VALUES (?, ?, ?, 'client', ?, ?)", newId(), t.id, user.name, text, at),
    // A client reply reopens a resolved or waiting request.
    stmt(env, "UPDATE studio_tickets SET updated_at = ?, status = CASE WHEN status IN ('resolved', 'waiting') THEN 'open' ELSE status END WHERE id = ?", at, t.id)
  ]);
  return ownTicket(env, user, t.id);
}
