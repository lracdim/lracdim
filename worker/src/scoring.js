/**
 * Scoring, ported from api/app/scoring/engine.py. METHODOLOGY is that
 * module's docstring, returned with every report.
 */

export const METHODOLOGY = `Scoring methodology (the single source of truth).

Category score
  Every category starts at 100. Each finding deducts a fixed amount by
  severity: critical 30, high 15, medium 8, low 3. Deductions are capped so
  one category cannot go below 0. Nothing is added back for good behaviour:
  a category with no findings scores 100, which means "nothing we check for
  was wrong", not "perfect".

Health score
  A weighted mean of the category scores. Weights reflect how directly each
  category affects whether the site works for a visitor and a crawler:
    technical 0.20, seo 0.20, performance 0.15, accessibility 0.15,
    security 0.15, links 0.10, content 0.05, ai visibility 0.05
  (content and AI visibility are weighted lightest: content's checks are the
  coarsest, and AI visibility measures access and signals, not outcomes).
  Weights are normalised by their sum, so they need not total exactly 1.

Ranking
  Findings are ranked by severity, then by category weight, then by the
  order the analyzer reported them. The prescription is the ranked list,
  de-duplicated by code, presented as actions.

Nothing here inspects the target's identity or adjusts scores for any reason
other than findings.`;

export const DEDUCTIONS = { critical: 30, high: 15, medium: 8, low: 3 };
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
export const WEIGHTS = { technical: 0.2, seo: 0.2, performance: 0.15, accessibility: 0.15, security: 0.15, links: 0.1, content: 0.05, ai: 0.05 };

const weight = (cat) => WEIGHTS[cat] ?? 0.1;

/** Python's round(): halves go to the even neighbour. */
export function pyRound(x, digits = 0) {
  const f = 10 ** digits;
  const v = x * f;
  const r = Math.round(v);
  const halfway = Math.abs(v - Math.trunc(v)) === 0.5;
  return (halfway && r % 2 !== 0 ? r - 1 : r) / f;
}

export function categoryScore(findings) {
  const score = 100 - findings.reduce((n, f) => n + DEDUCTIONS[f.severity], 0);
  return Math.max(0, Math.min(100, score));
}

export function healthScore(scores) {
  const cats = Object.keys(scores);
  const total = cats.reduce((n, c) => n + weight(c), 0);
  if (!total) return 0;
  return pyRound(cats.reduce((n, c) => n + scores[c] * weight(c), 0) / total);
}

/** [[category, finding], ...] by severity, then category weight, then report order. */
export function rankFindings(results) {
  const ranked = [];
  for (const r of results) {
    r.findings.forEach((f, order) => ranked.push([SEVERITY_RANK[f.severity], -Math.trunc(weight(r.category) * 100), order, r.category, f]));
  }
  ranked.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return ranked.map(([, , , cat, f]) => [cat, f]);
}

export function severityCounts(results) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const r of results) for (const f of r.findings) counts[f.severity]++;
  return counts;
}

export function buildPrescription(results) {
  const seen = new Set();
  const plan = [];
  for (const [category, f] of rankFindings(results)) {
    if (seen.has(f.code)) continue;
    seen.add(f.code);
    plan.push({ position: plan.length + 1, severity: f.severity, action: f.recommendation, issue_code: f.code, category, title: f.title });
  }
  return plan;
}
