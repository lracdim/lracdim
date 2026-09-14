"""Scoring methodology (the single source of truth).

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
    security 0.15, links 0.10, content 0.05
  (content is weighted lightest because its checks are the coarsest).

Ranking
  Findings are ranked by severity, then by category weight, then by the
  order the analyzer reported them. The prescription is the ranked list,
  de-duplicated by code, presented as actions.

Nothing here inspects the target's identity or adjusts scores for any reason
other than findings."""
from __future__ import annotations

from ..analyzers.base import AnalyzerResult, Finding

DEDUCTIONS = {"critical": 30, "high": 15, "medium": 8, "low": 3}
SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
WEIGHTS = {"technical": 0.20, "seo": 0.20, "performance": 0.15, "accessibility": 0.15, "security": 0.15, "links": 0.10, "content": 0.05}


def category_score(findings: list[Finding]) -> int:
    score = 100 - sum(DEDUCTIONS[f.severity] for f in findings)
    return max(0, min(100, score))


def health_score(scores: dict[str, int]) -> int:
    total_weight = sum(WEIGHTS.get(cat, 0.1) for cat in scores)
    if not total_weight:
        return 0
    return round(sum(scores[cat] * WEIGHTS.get(cat, 0.1) for cat in scores) / total_weight)


def rank_findings(results: list[AnalyzerResult]) -> list[tuple[str, Finding]]:
    ranked: list[tuple[int, int, int, str, Finding]] = []
    for result in results:
        for order, finding in enumerate(result.findings):
            ranked.append((SEVERITY_RANK[finding.severity], -int(WEIGHTS.get(result.category, 0.1) * 100), order, result.category, finding))
    ranked.sort(key=lambda t: t[:3])
    return [(cat, f) for _, _, _, cat, f in ranked]


def severity_counts(results: list[AnalyzerResult]) -> dict[str, int]:
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for result in results:
        for f in result.findings:
            counts[f.severity] += 1
    return counts


def build_prescription(results: list[AnalyzerResult]) -> list[dict]:
    seen: set[str] = set()
    plan: list[dict] = []
    for category, finding in rank_findings(results):
        if finding.code in seen:
            continue
        seen.add(finding.code)
        plan.append({"position": len(plan) + 1, "severity": finding.severity, "action": finding.recommendation, "issue_code": finding.code, "category": category, "title": finding.title})
    return plan
