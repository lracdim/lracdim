/**
 * The computed views the dashboard reads, ported from the Python engine's
 * services.py: client rows with churn risk, ticket SLA states, invoice
 * receivables, the command centre and the client portal pages.
 *
 * Dropped from the Python views because their numbers were generated demo
 * data with no real source here: traffic and analytics, client leads,
 * keyword rankings, AI citations, Core Web Vitals, backups and pending
 * updates. Website numbers come from Signal and Vector (see sites.js).
 *
 * Loaders take a SQL condition on a fixed table alias plus its arguments, so
 * the admin (everything) and the client portal (one client) share them and a
 * client can only ever be scoped to its own rows.
 */
import { PLANS, PLAN_NAMES, planOut } from './plans.js';
import { latestAudits, siteSummaries, avgOf, visibilityOf } from './sites.js';
import { loadProspects, OPEN_STAGES, STAGES } from './prospects.js';
import { parse } from '../audit-view.js';
import { activityOut, addDays, all, daysUntil, first, monthRange, parseJson, previousMonth, round1, sum, thisMonth, today } from './util.js';

/* ------------------------------------------------------------ clients */

export function clientOut(c) {
  return {
    id: c.id,
    company: c.company,
    contactName: c.contact_name,
    email: c.email,
    phone: c.phone,
    plan: c.plan,
    mrr: c.mrr,
    includedHours: c.included_hours,
    status: c.status,
    industry: c.industry,
    since: c.since,
    renewalDate: c.renewal_date ?? null,
    notes: c.notes,
    nps: c.nps ?? null,
    createdAt: c.created_at
  };
}

/** Hours of work logged per client in a month: Map(clientId → hours). */
async function hoursByClient(env, month, clientId = null) {
  const { start, end } = monthRange(month);
  const rows = await all(
    env,
    `SELECT client_id, SUM(minutes) AS minutes FROM studio_worklog WHERE date >= ? AND date <= ?${clientId ? ' AND client_id = ?' : ''} GROUP BY client_id`,
    start,
    end,
    ...(clientId ? [clientId] : [])
  );
  return new Map(rows.map((r) => [r.client_id, round1(r.minutes / 60)]));
}

/** Python's client_row: the clients table row with its rolled-up numbers and churn risk. */
export function clientRow(c, { sites = [], paid = 0, overdue = 0, openTickets = 0, hoursUsed = 0 } = {}) {
  const scored = sites.filter((s) => s.health !== null);
  const health = scored.length ? Math.round(sum(scored, (s) => s.health) / scored.length) : null;
  const renewalDays = daysUntil(c.renewal_date);
  let risk = 0;
  if (c.status === 'paused') risk += 30;
  if (overdue) risk += 25;
  if ((c.nps ?? 10) <= 6) risk += 15;
  if (health !== null && health < 65) risk += 15;
  if ((renewalDays ?? 999) < 60) risk += 10;
  return {
    ...clientOut(c),
    siteCount: sites.length,
    health,
    visibility: avgOf(sites.map((s) => s.visibility)),
    openTickets,
    overdue,
    lifetimeValue: paid,
    hoursUsed,
    renewalDays,
    churnRisk: risk >= 40 ? 'high' : risk >= 20 ? 'medium' : 'low',
    riskScore: risk
  };
}

/** Client rows for every client, or one. */
export async function loadClientRows(env, clientId = null) {
  const t = today();
  const [clients, sites, money, tickets, hours] = await Promise.all([
    all(env, `SELECT * FROM studio_clients${clientId ? ' WHERE id = ?' : ''} ORDER BY company`, ...(clientId ? [clientId] : [])),
    clientId ? siteSummaries(env, 's.client_id = ?', clientId) : siteSummaries(env),
    all(
      env,
      `SELECT client_id, SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS paid,
              SUM(CASE WHEN status = 'overdue' OR (status = 'sent' AND due_at < ?) THEN amount ELSE 0 END) AS overdue
         FROM studio_invoices${clientId ? ' WHERE client_id = ?' : ''} GROUP BY client_id`,
      t,
      ...(clientId ? [clientId] : [])
    ),
    all(env, `SELECT client_id, COUNT(*) AS n FROM studio_tickets WHERE status <> 'resolved'${clientId ? ' AND client_id = ?' : ''} GROUP BY client_id`, ...(clientId ? [clientId] : [])),
    hoursByClient(env, thisMonth(), clientId)
  ]);
  const m = new Map(money.map((r) => [r.client_id, r]));
  const tk = new Map(tickets.map((r) => [r.client_id, r.n]));
  return clients.map((c) =>
    clientRow(c, {
      sites: sites.filter((s) => s.clientId === c.id),
      paid: m.get(c.id)?.paid || 0,
      overdue: m.get(c.id)?.overdue || 0,
      openTickets: tk.get(c.id) || 0,
      hoursUsed: hours.get(c.id) || 0
    })
  );
}

/* ------------------------------------------------------------ tickets */

export const SLA = { urgent: 2, high: 8, normal: 24, low: 72 };
export const TICKET_CATEGORIES = ['bug', 'content', 'feature', 'question', 'billing', 'incident'];
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
export const TICKET_STATUSES = ['open', 'in_progress', 'waiting', 'resolved'];

const TICKET_SELECT = `SELECT t.*, c.company,
    (SELECT MIN(m.at) FROM studio_ticket_messages m WHERE m.ticket_id = t.id AND m.role = 'admin') AS first_reply_at,
    (SELECT COUNT(*) FROM studio_ticket_messages m WHERE m.ticket_id = t.id) AS message_count,
    (SELECT m.body FROM studio_ticket_messages m WHERE m.ticket_id = t.id ORDER BY m.at DESC, m.rowid DESC LIMIT 1) AS last_message
  FROM studio_tickets t JOIN studio_clients c ON c.id = t.client_id`;

/**
 * services.py sla_state: the first studio reply is due sla_hours after the
 * ticket opened. Answered in time = met, late = missed; unanswered: resolved
 * counts as met, otherwise breached past the due time, due_soon within 4 h.
 */
export function slaState(t, now = Date.now()) {
  const created = Date.parse(t.created_at);
  const due = created + t.sla_hours * 3600_000;
  const reply = t.first_reply_at ? Date.parse(t.first_reply_at) : null;
  let state;
  if (reply !== null) state = reply <= due ? 'met' : 'missed';
  else if (t.status === 'resolved') state = 'met';
  else state = now > due ? 'breached' : due - now < 4 * 3600_000 ? 'due_soon' : 'pending';
  return { slaDueAt: new Date(due).toISOString(), slaState: state, firstResponseHours: reply !== null ? round1((reply - created) / 3600_000) : null };
}

export const messageOut = (m) => ({ id: m.id, author: m.author, role: m.role, body: m.body, at: m.at });

export function ticketOut(t, messages = null) {
  const out = {
    id: t.id,
    number: t.number,
    clientId: t.client_id,
    company: t.company ?? null,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    slaHours: t.sla_hours,
    ...slaState(t),
    messageCount: t.message_count ?? (messages ? messages.length : 0)
  };
  if (messages) out.messages = messages.map(messageOut);
  else out.lastMessage = String(t.last_message || '').slice(0, 140);
  return out;
}

export const loadTickets = (env, where = '1 = 1', ...args) => all(env, `${TICKET_SELECT} WHERE ${where} ORDER BY t.updated_at DESC`, ...args);

/** One ticket with its thread, or null. `where` narrows it further (a client's own tickets). */
export async function loadTicket(env, id, where = '1 = 1', ...args) {
  const t = await first(env, `${TICKET_SELECT} WHERE t.id = ? AND ${where}`, id, ...args);
  if (!t) return null;
  const messages = await all(env, 'SELECT * FROM studio_ticket_messages WHERE ticket_id = ? ORDER BY at ASC, rowid ASC', id);
  return ticketOut(t, messages);
}

/* ------------------------------------------------------------ invoices */

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'void'];
export const INVOICE_KINDS = ['retainer', 'project', 'one_off'];

/** A sent invoice past its due date is overdue, whether or not anyone marked it. */
export const invoiceStatus = (i, t = today()) => (i.status === 'sent' && i.due_at < t ? 'overdue' : i.status);
const unpaid = (status) => status === 'sent' || status === 'overdue';

export function invoiceOut(i, t = today()) {
  return {
    id: i.id,
    number: i.number,
    clientId: i.client_id,
    company: i.company ?? null,
    kind: i.kind,
    issuedAt: i.issued_at,
    dueAt: i.due_at,
    status: invoiceStatus(i, t),
    paidAt: i.paid_at ?? null,
    items: parseJson(i.items, []),
    amount: i.amount
  };
}

export const loadInvoices = (env, where = '1 = 1', ...args) =>
  all(env, `SELECT i.*, c.company FROM studio_invoices i JOIN studio_clients c ON c.id = i.client_id WHERE ${where} ORDER BY i.issued_at DESC, i.number DESC`, ...args);

/** Admin billing page: every invoice, receivables aging, the price list. */
export async function invoicesReport(env) {
  const t = today();
  const items = (await loadInvoices(env)).map((i) => invoiceOut(i, t));
  const aging = { current: 0, '1-30': 0, '31-60': 0, '60+': 0 };
  for (const i of items) {
    if (!unpaid(i.status)) continue;
    const late = -daysUntil(i.dueAt);
    aging[late <= 0 ? 'current' : late <= 30 ? '1-30' : late <= 60 ? '31-60' : '60+'] += i.amount;
  }
  return { items, aging, plans: PLANS };
}

export async function billingReport(env, clientId) {
  const [client, rows] = await Promise.all([first(env, 'SELECT * FROM studio_clients WHERE id = ?', clientId), loadInvoices(env, 'i.client_id = ?', clientId)]);
  const t = today();
  // Drafts are the studio's work in progress, not the client's business.
  const invoices = rows.filter((i) => i.status !== 'draft').map((i) => invoiceOut(i, t));
  const open = invoices.filter((i) => unpaid(i.status));
  const year = t.slice(0, 4);
  return {
    plan: planOut(client?.plan),
    renewalDate: client?.renewal_date ?? null,
    invoices,
    outstanding: sum(open, (i) => i.amount),
    overdue: sum(open.filter((i) => i.status === 'overdue'), (i) => i.amount),
    paidThisYear: sum(invoices.filter((i) => i.status === 'paid' && (i.paidAt || '').startsWith(year)), (i) => i.amount)
  };
}

/* ------------------------------------------------------------ projects */

export const PHASES = ['discovery', 'strategy', 'design', 'development', 'qa', 'launch', 'maintenance'];
export const PROJECT_HEALTH = ['on_track', 'at_risk', 'late', 'complete'];
export const MILESTONE_STATUSES = ['upcoming', 'in_progress', 'awaiting_approval', 'done'];

const milestoneOut = (m) => ({
  id: m.id,
  title: m.title,
  dueDate: m.due_date,
  status: m.status,
  needsApproval: Boolean(m.needs_approval),
  approvedAt: m.approved_at ?? null,
  approvedBy: m.approved_by ?? null
});

export function projectOut(p, milestones = []) {
  return {
    id: p.id,
    clientId: p.client_id,
    company: p.company ?? null,
    name: p.name,
    type: p.type,
    phase: p.phase,
    startDate: p.start_date,
    dueDate: p.due_date,
    budget: p.budget,
    hoursBudget: p.hours_budget,
    hoursLogged: p.hours_logged,
    health: p.health,
    milestones: milestones.map(milestoneOut)
  };
}

/** Projects (alias `p`) with their milestones, incomplete first, then by due date. Two queries. */
export async function loadProjects(env, where = '1 = 1', ...args) {
  const [projects, milestones] = await Promise.all([
    all(env, `SELECT p.*, c.company FROM studio_projects p JOIN studio_clients c ON c.id = p.client_id WHERE ${where} ORDER BY (p.health = 'complete'), p.due_date`, ...args),
    all(env, `SELECT m.* FROM studio_milestones m JOIN studio_projects p ON p.id = m.project_id WHERE ${where} ORDER BY m.due_date, m.created_at`, ...args)
  ]);
  return projects.map((p) => projectOut(p, milestones.filter((m) => m.project_id === p.id)));
}

/* ------------------------------------------------------------ work log */

export const WORK_CATEGORIES = ['maintenance', 'security', 'seo', 'aeo', 'geo', 'performance', 'content', 'feature'];

export const workOut = (w) => ({
  id: w.id,
  clientId: w.client_id,
  siteId: w.site_id ?? null,
  date: w.date,
  category: w.category,
  title: w.title,
  minutes: w.minutes,
  by: w.by_name,
  company: w.company ?? null
});

const loadWork = (env, where, args = [], limit = 2000) =>
  all(env, `SELECT w.*, c.company FROM studio_worklog w JOIN studio_clients c ON c.id = w.client_id WHERE ${where} ORDER BY w.date DESC, w.created_at DESC LIMIT ?`, ...args, limit);

/** Admin: one month's entries and each active client's hours against the plan. */
export async function adminWorklog(env, month, clientId = null) {
  const { start, end } = monthRange(month);
  const [rows, clients] = await Promise.all([
    loadWork(env, `w.date >= ? AND w.date <= ?${clientId ? ' AND w.client_id = ?' : ''}`, [start, end, ...(clientId ? [clientId] : [])]),
    all(env, "SELECT * FROM studio_clients WHERE status <> 'churned' ORDER BY company")
  ]);
  const perClient = clients.map((c) => {
    const used = round1(sum(rows.filter((w) => w.client_id === c.id), (w) => w.minutes) / 60);
    return { clientId: c.id, company: c.company, plan: c.plan, hoursUsed: used, hoursIncluded: c.included_hours, effectiveRate: used ? Math.round(c.mrr / used) : null };
  });
  return { month, items: rows.map(workOut), perClient };
}

/** services.py worklog_report: one client's month of work. */
export async function worklogReport(env, clientId, month) {
  const { start, end } = monthRange(month);
  const [client, rows, months] = await Promise.all([
    first(env, 'SELECT included_hours FROM studio_clients WHERE id = ?', clientId),
    loadWork(env, 'w.client_id = ? AND w.date >= ? AND w.date <= ?', [clientId, start, end]),
    all(env, 'SELECT DISTINCT substr(date, 1, 7) AS m FROM studio_worklog WHERE client_id = ?', clientId)
  ]);
  const byCat = new Map();
  for (const w of rows) byCat.set(w.category, (byCat.get(w.category) || 0) + w.minutes);
  return {
    month,
    months: [...new Set([...months.map((r) => r.m), thisMonth(), month])].sort().reverse(),
    items: rows.map(workOut),
    hoursUsed: round1(sum(rows, (w) => w.minutes) / 60),
    hoursIncluded: client?.included_hours ?? 0,
    byCategory: [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([category, minutes]) => ({ category, hours: round1(minutes / 60) }))
  };
}

/* ------------------------------------------------------------ shared pieces */

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

/** The top issues across a client's sites: the first four of each site's latest audit, then by severity. */
function topIssues(audits, sites, limit = 5) {
  const byHost = new Map(sites.map((s) => [s.host, s]));
  const out = [];
  for (const a of audits) {
    const site = byHost.get(a.host);
    for (const i of parse(a.issues, []).slice(0, 4)) {
      out.push({ category: i.category, code: i.code, severity: i.severity, title: i.title, evidence: i.evidence, explanation: i.explanation, recommendation: i.recommendation, impact: i.impact, siteId: site?.id ?? null, siteName: site?.name ?? a.host });
    }
  }
  return out.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)).slice(0, limit);
}

const milestoneWithProject = (p, m) => ({ ...m, projectId: p.id, project: p.name });

/* ------------------------------------------------------------ client portal */

export async function clientOverview(env, clientId) {
  const t = today();
  const month = thisMonth();
  const { start, end } = monthRange(month);
  const [client, sites, audits, projects, openTickets, monthMinutes, recentWork, unpaidRows] = await Promise.all([
    first(env, 'SELECT * FROM studio_clients WHERE id = ?', clientId),
    siteSummaries(env, 's.client_id = ?', clientId),
    latestAudits(env, 's.client_id = ?', true, clientId),
    loadProjects(env, 'p.client_id = ?', clientId),
    first(env, "SELECT COUNT(*) AS n FROM studio_tickets WHERE client_id = ? AND status <> 'resolved'", clientId),
    first(env, 'SELECT SUM(minutes) AS m FROM studio_worklog WHERE client_id = ? AND date >= ? AND date <= ?', clientId, start, end),
    loadWork(env, 'w.client_id = ?', [clientId], 6),
    loadInvoices(env, "i.client_id = ? AND i.status IN ('sent', 'overdue')", clientId)
  ]);
  const unpaidInv = unpaidRows.map((i) => invoiceOut(i, t));
  const approvals = projects.flatMap((p) => p.milestones.filter((m) => m.status === 'awaiting_approval').map((m) => milestoneWithProject(p, m)));
  const upcoming = projects
    .flatMap((p) => p.milestones.filter((m) => m.status === 'upcoming' || m.status === 'in_progress').map((m) => milestoneWithProject(p, m)))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  return {
    client: clientOut(client),
    plan: planOut(client.plan),
    sites,
    scores: { health: avgOf(sites.map((s) => s.health)), visibility: avgOf(sites.map((s) => s.visibility)) },
    uptime30: sites.some((s) => s.uptime30 !== null) ? round3(avgNums(sites.map((s) => s.uptime30))) : null,
    topIssues: topIssues(audits, sites),
    approvals,
    nextMilestone: upcoming[0] || null,
    openTickets: openTickets?.n || 0,
    hours: { used: round1((monthMinutes?.m || 0) / 60), included: client.included_hours },
    recentWork: recentWork.map(workOut),
    balance: {
      amount: sum(unpaidInv, (i) => i.amount),
      overdue: sum(unpaidInv.filter((i) => i.status === 'overdue'), (i) => i.amount),
      nextDue: unpaidInv.map((i) => i.dueAt).sort()[0] || null
    }
  };
}

const avgNums = (values) => {
  const v = values.filter((x) => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const round3 = (n) => (n === null ? null : Math.round(n * 1000) / 1000);

/** services.py monthly_report, without traffic and leads: uptime, work, support and scores for one month. */
export async function monthlyReport(env, clientId, month) {
  const { start, end } = monthRange(month);
  const [client, sites, days, work, tickets, audits] = await Promise.all([
    first(env, 'SELECT * FROM studio_clients WHERE id = ?', clientId),
    all(env, 'SELECT id, name, host, target_id FROM studio_sites WHERE client_id = ?', clientId),
    all(env, 'SELECT u.* FROM studio_uptime_days u WHERE u.day >= ? AND u.day <= ? AND u.target_id IN (SELECT target_id FROM studio_sites WHERE client_id = ?)', start, end, clientId),
    worklogReport(env, clientId, month),
    all(env, 'SELECT status FROM studio_tickets WHERE client_id = ? AND created_at >= ? AND created_at <= ?', clientId, `${start}T00:00:00`, `${end}T23:59:59.999Z`),
    // Each site's latest completed examination up to the end of the month.
    all(
      env,
      `SELECT w.host, a.health_score, a.scores FROM audits a JOIN websites w ON w.id = a.website_id
        WHERE a.status = 'completed' AND w.host IN (SELECT host FROM studio_sites WHERE client_id = ?)
          AND a.completed_at = (SELECT MAX(a2.completed_at) FROM audits a2 WHERE a2.website_id = a.website_id AND a2.status = 'completed' AND a2.completed_at <= ?)`,
      clientId,
      `${end}T23:59:59.999Z`
    )
  ]);
  const perTarget = new Map();
  for (const d of days) {
    const cur = perTarget.get(d.target_id) || { checks: 0, down: 0, incidents: 0 };
    perTarget.set(d.target_id, { checks: cur.checks + d.checks, down: cur.down + d.down, incidents: cur.incidents + d.incidents });
  }
  const uptimes = [...perTarget.values()].filter((v) => v.checks).map((v) => ((v.checks - v.down) / v.checks) * 100);
  const incidents = sum([...perTarget.values()], (v) => v.incidents);
  const uptime = uptimes.length ? Math.round(avgNums(uptimes) * 1000) / 1000 : null;
  const scored = audits.map((a) => ({ health: a.health_score, ...parse(a.scores, {}) }));
  const scores = scored.length
    ? Object.fromEntries(['health', 'technical', 'seo', 'performance', 'accessibility', 'security', 'links', 'content', 'ai'].map((k) => [k, avgOf(scored.map((s) => s[k]))]))
    : {};
  if (scored.length) scores.visibility = avgOf(scored.map((s) => visibilityOf(s)));
  const ticketStats = { opened: tickets.length, resolved: tickets.filter((x) => x.status === 'resolved').length };
  const highlights = [`${work.hoursUsed} hours of care work delivered across ${work.items.length} task${work.items.length === 1 ? '' : 's'}.`];
  if (uptime !== null) highlights.push(`Average uptime ${uptime.toFixed(2)}% with ${incidents} outage${incidents === 1 ? '' : 's'} detected by monitoring.`);
  if (scores.health !== undefined && scores.health !== null) highlights.push(`Website health score ${scores.health} at the latest examination.`);
  highlights.push(`${ticketStats.opened} support request${ticketStats.opened === 1 ? '' : 's'} opened, ${ticketStats.resolved} resolved.`);
  return {
    month,
    client: client ? { company: client.company, plan: client.plan } : null,
    sites: sites.map((s) => ({ id: s.id, name: s.name, host: s.host })),
    work: { hours: work.hoursUsed, tasks: work.items.length, byCategory: work.byCategory, items: work.items.slice(0, 12) },
    uptime,
    incidents,
    scores,
    tickets: ticketStats,
    highlights
  };
}

/* ------------------------------------------------------------ command centre */

export async function adminOverview(env) {
  const t = today();
  const month = thisMonth();
  const lastMonth = previousMonth(month);
  const firstMonth = (() => {
    let m = month;
    for (let i = 0; i < 11; i++) m = previousMonth(m);
    return m;
  })();
  const [clients, sites, unpaidRows, revenueRows, openTicketRows, firstReply, prospects, projects, hours, activity] = await Promise.all([
    all(env, 'SELECT * FROM studio_clients'),
    siteSummaries(env),
    loadInvoices(env, "i.status IN ('sent', 'overdue')"),
    all(env, "SELECT substr(paid_at, 1, 7) AS month, SUM(amount) AS revenue FROM studio_invoices WHERE status = 'paid' AND paid_at >= ? GROUP BY substr(paid_at, 1, 7)", `${firstMonth}-01`),
    loadTickets(env, "t.status <> 'resolved'"),
    first(
      env,
      `SELECT AVG(h) AS hours FROM (SELECT (julianday(fr) - julianday(created_at)) * 24 AS h FROM
         (SELECT t.created_at, (SELECT MIN(m.at) FROM studio_ticket_messages m WHERE m.ticket_id = t.id AND m.role = 'admin') AS fr FROM studio_tickets t)
        WHERE fr IS NOT NULL)`
    ),
    loadProspects(env),
    loadProjects(env),
    hoursByClient(env, month),
    all(env, 'SELECT * FROM studio_activity ORDER BY at DESC, id DESC LIMIT 12')
  ]);
  const billable = clients.filter((c) => c.status === 'active' || c.status === 'onboarding');
  const mrr = sum(billable, (c) => c.mrr);
  const revenue = new Map(revenueRows.map((r) => [r.month, r.revenue]));
  const series = [];
  for (let m = firstMonth, i = 0; i < 12; i++, m = nextMonth(m)) series.push({ month: m, revenue: revenue.get(m) || 0 });
  const invoices = unpaidRows.map((i) => invoiceOut(i, t));
  const overdue = invoices.filter((i) => i.status === 'overdue');
  const tickets = openTicketRows.map((x) => ticketOut(x));
  const won = prospects.filter((p) => p.stage === 'won').length;
  const lost = prospects.filter((p) => p.stage === 'lost').length;
  const name = new Map(clients.map((c) => [c.id, c.company]));
  const included = sum(billable, (c) => c.included_hours);
  const used = round1(sum(billable, (c) => hours.get(c.id) || 0));

  const attention = [];
  const flag = (severity, kind, title, detail, link) => attention.push({ severity, kind, title, detail, link });
  for (const s of sites) {
    const link = `/admin/sites/${s.id}`;
    if (s.monitoring.status === 'unavailable') flag('critical', 'downtime', `${s.name} is unavailable`, s.url, link);
    if (s.sslValid === false) flag('critical', 'ssl', 'SSL check failed', s.url, link);
    if (s.incidents7d) flag('warning', 'downtime', `${s.incidents7d} downtime incident(s) this week`, s.url, link);
    if (s.health !== null && s.health < 65) flag('warning', 'health', `Health score ${s.health}`, s.url, link);
    if (s.health === null && s.lastAuditAt === null) flag('info', 'audit', `${s.name} has not been examined yet`, s.url, link);
  }
  for (const i of overdue) flag('critical', 'invoice', `Invoice ${i.number} overdue`, `${i.company} · $${i.amount.toLocaleString('en-US')}`, '/admin/billing');
  for (const x of tickets) {
    if (x.slaState === 'breached' || x.slaState === 'due_soon') {
      flag(x.slaState === 'breached' ? 'critical' : 'warning', 'ticket', `#${x.number} SLA ${x.slaState.replace('_', ' ')}`, `${x.company} · ${x.subject}`, `/admin/support/${x.id}`);
    }
  }
  for (const p of projects) {
    for (const m of p.milestones) if (m.status === 'awaiting_approval') flag('info', 'approval', `Waiting on client approval: ${m.title}`, `${name.get(p.clientId)} · ${p.name}`, '/admin/projects');
    if (p.health === 'at_risk' || p.health === 'late') flag('warning', 'project', `Project ${p.health.replace('_', ' ')}: ${p.name}`, name.get(p.clientId) || '', '/admin/projects');
  }
  // Every lead without a studio stage counts as "new", including old ones from before the dashboard existed,
  // so only the last 14 days' new leads are flagged.
  const recent = `${addDays(t, -13)}T`;
  for (const pr of prospects) {
    if (pr.stage === 'new' && pr.createdAt >= recent) flag('info', 'prospect', `New ${pr.kind === 'contact' ? 'project inquiry' : 'Vector report request'}: ${pr.company}`, pr.website || pr.email, '/admin/pipeline');
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  attention.sort((a, b) => rank[a.severity] - rank[b.severity]);

  const renewals = billable
    .map((c) => ({ clientId: c.id, company: c.company, renewalDate: c.renewal_date, days: daysUntil(c.renewal_date), mrr: c.mrr }))
    .filter((r) => r.days !== null && r.days <= 90)
    .sort((a, b) => a.days - b.days);
  const openProspects = prospects.filter((p) => OPEN_STAGES.includes(p.stage));
  return {
    mrr,
    arr: mrr * 12,
    mrrByPlan: PLAN_NAMES.map((p) => ({ plan: p, clients: billable.filter((c) => c.plan === p).length, mrr: sum(billable.filter((c) => c.plan === p), (c) => c.mrr) })),
    clients: Object.fromEntries(['active', 'onboarding', 'paused', 'churned'].map((s) => [s, clients.filter((c) => c.status === s).length])),
    revenue: { series, thisMonth: revenue.get(month) || 0, lastMonth: revenue.get(lastMonth) || 0, trailing12: sum(series, (r) => r.revenue) },
    receivables: {
      outstanding: sum(invoices.filter((i) => i.status === 'sent'), (i) => i.amount),
      overdue: sum(overdue, (i) => i.amount),
      overdueCount: overdue.length
    },
    pipeline: {
      openValue: sum(openProspects, (p) => p.value),
      openCount: openProspects.length,
      byStage: STAGES.map((s) => ({ stage: s, count: prospects.filter((p) => p.stage === s).length, value: sum(prospects.filter((p) => p.stage === s), (p) => p.value) })),
      winRate: won + lost ? Math.round((won / (won + lost)) * 100) : null
    },
    support: {
      open: tickets.length,
      breached: tickets.filter((x) => x.slaState === 'breached').length,
      urgent: tickets.filter((x) => x.priority === 'urgent' || x.priority === 'high').length,
      avgFirstResponseHours: firstReply?.hours === null || firstReply?.hours === undefined ? null : round1(firstReply.hours)
    },
    sites: {
      total: sites.length,
      monitored: sites.filter((s) => s.monitoring.status !== 'not_monitored').length,
      down: sites.filter((s) => s.monitoring.status === 'unavailable').length,
      avgHealth: avgOf(sites.map((s) => s.health)),
      avgVisibility: avgOf(sites.map((s) => s.visibility)),
      avgUptime: sites.some((s) => s.uptime30 !== null) ? round3(avgNums(sites.map((s) => s.uptime30))) : null,
      atRisk: sites.filter((s) => (s.health !== null && s.health < 65) || s.incidents7d || s.sslValid === false || s.monitoring.status === 'unavailable').length
    },
    capacity: { hoursUsed: used, hoursIncluded: included, utilisation: included ? Math.round((used / included) * 100) : 0 },
    projects: { active: projects.filter((p) => p.health !== 'complete').length, atRisk: projects.filter((p) => p.health === 'at_risk' || p.health === 'late').length },
    renewals,
    attention: attention.slice(0, 14),
    activity: activity.map(activityOut)
  };
}

function nextMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 15)).toISOString().slice(0, 7);
}
