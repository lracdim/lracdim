/**
 * The sales pipeline is built from the leads already in D1:
 *  - contact_submissions: the site's project-intake form ("Project inquiry");
 *  - report_requests: people who asked for an emailed Vector report ("Vector
 *    report"), with the examined site and its health score. Requests the
 *    retention sweep has anonymised are skipped.
 * The studio's own fields (stage, deal value, notes, the client a lead became)
 * live in studio_prospects keyed by (source, source_id); nothing about the
 * person is copied. A lead without a row there is a "new" lead worth 0.
 *
 * Prospect ids are "<source>-<source id>", e.g. "contact-3f9a…".
 */
import { parse } from '../audit-view.js';
import { all, first, nowIso, stmt } from './util.js';
import { visibilityOf } from './sites.js';

export const STAGES = ['new', 'reviewing', 'call_booked', 'proposal', 'won', 'lost'];
export const OPEN_STAGES = ['new', 'reviewing', 'call_booked', 'proposal'];
const LABEL = { contact: 'Project inquiry', report: 'Vector report' };
const LIMIT = 300; // most recent of each kind

const overlay = (r) => ({
  stage: r.stage || 'new',
  value: r.value || 0,
  notes: r.notes || '',
  clientId: r.client_id ?? null,
  updatedAt: r.updated_at || r.created_at
});

function contactOut(r) {
  const message = [r.problem, r.desired_outcome && `Desired outcome: ${r.desired_outcome}`].filter(Boolean).join('\n\n');
  return {
    id: `contact-${r.id}`,
    kind: 'contact',
    source: LABEL.contact,
    name: r.name,
    email: r.email,
    company: r.company || r.name,
    website: r.website || '',
    message,
    createdAt: r.created_at,
    healthScore: null,
    visibility: null,
    auditId: null,
    details: { projectType: r.project_type, timeline: r.timeline ?? null, budgetRange: r.budget_range ?? null, reportStatus: null },
    ...overlay(r)
  };
}

function reportOut(r) {
  let host = '';
  try {
    host = new URL(r.url).hostname;
  } catch {
    host = r.url;
  }
  return {
    id: `report-${r.id}`,
    kind: 'report',
    source: LABEL.report,
    name: r.name,
    email: r.email,
    company: r.company || host,
    website: r.url,
    message: r.note || '',
    createdAt: r.created_at,
    healthScore: r.health_score ?? null,
    visibility: r.scores ? visibilityOf(parse(r.scores, {})) : null,
    auditId: r.audit_id,
    details: { projectType: null, timeline: null, budgetRange: null, reportStatus: r.report_status },
    ...overlay(r)
  };
}

const CONTACT_SQL = `SELECT c.id, c.name, c.email, c.company, c.project_type, c.problem, c.desired_outcome, c.timeline, c.budget_range, c.website, c.created_at,
         p.stage, p.value, p.notes, p.client_id, p.updated_at
    FROM contact_submissions c LEFT JOIN studio_prospects p ON p.source = 'contact' AND p.source_id = c.id`;
const REPORT_SQL = `SELECT r.id, r.name, r.email, r.company, r.note, r.status AS report_status, r.created_at, r.audit_id, a.url, a.health_score, a.scores,
         p.stage, p.value, p.notes, p.client_id, p.updated_at
    FROM report_requests r JOIN audits a ON a.id = r.audit_id LEFT JOIN studio_prospects p ON p.source = 'report' AND p.source_id = r.id
   WHERE r.anonymized = 0`;

/** Both kinds of lead, newest first. Two queries. */
export async function loadProspects(env) {
  const [contacts, reports] = await Promise.all([
    all(env, `${CONTACT_SQL} ORDER BY c.created_at DESC LIMIT ?`, LIMIT),
    all(env, `${REPORT_SQL} ORDER BY r.created_at DESC LIMIT ?`, LIMIT)
  ]);
  return [...contacts.map(contactOut), ...reports.map(reportOut)].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** [source, sourceId] for a prospect id, or null. */
export function parseProspectId(id) {
  const m = /^(contact|report)-([0-9a-f]{32})$/.exec(String(id || ''));
  return m ? [m[1], m[2]] : null;
}

export async function loadProspect(env, id) {
  const key = parseProspectId(id);
  if (!key) return null;
  const [source, sourceId] = key;
  const row = source === 'contact' ? await first(env, `${CONTACT_SQL} WHERE c.id = ?`, sourceId) : await first(env, `${REPORT_SQL} AND r.id = ?`, sourceId);
  return row ? (source === 'contact' ? contactOut(row) : reportOut(row)) : null;
}

/** Upsert of the studio's fields for a prospect; pass the merged values. */
export function overlayStmt(env, prospect, { stage, value, notes, clientId }) {
  const [source, sourceId] = parseProspectId(prospect.id);
  return stmt(
    env,
    `INSERT INTO studio_prospects (source, source_id, stage, value, notes, client_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (source, source_id) DO UPDATE SET stage = excluded.stage, value = excluded.value, notes = excluded.notes, client_id = excluded.client_id, updated_at = excluded.updated_at`,
    source,
    sourceId,
    stage,
    value,
    notes,
    clientId ?? null,
    nowIso()
  );
}

/**
 * Cron: when the report retention sweep anonymises a request, drop the
 * studio's notes about it too (and the whole row unless it became a client).
 */
export function pruneAnonymisedStmts(env) {
  const gone = "source = 'report' AND source_id IN (SELECT id FROM report_requests WHERE anonymized = 1)";
  return [stmt(env, `DELETE FROM studio_prospects WHERE ${gone} AND client_id IS NULL`), stmt(env, `UPDATE studio_prospects SET notes = '' WHERE ${gone} AND notes <> ''`)];
}
