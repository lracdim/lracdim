/**
 * The shapes an examination is returned in.
 *
 * - auditOut: the audit record the page polls (scores and counts, public).
 * - briefReport: what anyone may see at /results — category scores and the
 *   top issues without their evidence or fixes, plus counts of what is locked.
 * - fullReport: everything, for the emailed link and the admin key.
 *
 * The brief keeps the full report's field names (metrics and the issue text
 * fields are present but empty), so a page built for the full report still
 * renders it.
 */
import { METHODOLOGY } from './scoring.js';

export const BRIEF_ISSUES = 3;

export const parse = (v, fallback) => {
  if (v === null || v === undefined) return fallback;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
};

export function auditOut(row) {
  return {
    id: row.id,
    url: row.url,
    status: row.status,
    stage: row.stage,
    stages: parse(row.stages, []),
    error_message: row.error_message ?? null,
    health_score: row.health_score ?? null,
    scores: parse(row.scores, {}),
    summary: parse(row.summary, {}),
    created_at: row.created_at,
    completed_at: row.completed_at ?? null
  };
}

/** The stored prescription with each fix's issue title and category joined back on. */
export function fullPrescription(row) {
  const issues = parse(row.issues, []);
  return parse(row.prescription, []).map((p) => {
    const issue = issues.find((i) => i.code === p.issue_code) || {};
    return { ...p, title: p.title || issue.title || p.issue_code, category: p.category || issue.category || null };
  });
}

export function fullReport(row) {
  return {
    audit: auditOut(row),
    gated: false,
    results: parse(row.results, []),
    issues: parse(row.issues, []),
    prescription: fullPrescription(row),
    methodology: METHODOLOGY
  };
}

export function briefReport(row) {
  const issues = parse(row.issues, []);
  const fixes = parse(row.prescription, []);
  return {
    audit: auditOut(row),
    gated: true,
    results: parse(row.results, []).map((r) => ({ category: r.category, score: r.score, metrics: {} })),
    issues: issues.slice(0, BRIEF_ISSUES).map((i) => ({
      category: i.category,
      code: i.code,
      severity: i.severity,
      title: i.title,
      explanation: i.explanation,
      evidence: '',
      recommendation: '',
      impact: ''
    })),
    prescription: [],
    locked: { total_issues: issues.length, issues: Math.max(0, issues.length - BRIEF_ISSUES), fixes: fixes.length },
    methodology: METHODOLOGY
  };
}
