"""The Vector pipeline: fetch → analyzers → scoring → persistence, with
stage updates written to the audit row as it progresses."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from urllib.parse import urlsplit

from sqlalchemy.orm import Session

from ..analyzers import ANALYZERS, AnalyzerResult, PageContext
from ..core.ssrf import UnsafeURL, validate
from ..models import Audit, AuditResult, Issue, Prescription, Website
from ..scoring import build_prescription, category_score, health_score, rank_findings, severity_counts
from .fetcher import FetchError, fetch

log = logging.getLogger("vector")

STAGES = [
    ("connecting", "Connecting"),
    ("fetching", "Fetching the page"),
    ("technical", "Analyzing technical structure"),
    ("seo", "Analyzing SEO"),
    ("performance", "Analyzing performance indicators"),
    ("accessibility", "Analyzing accessibility"),
    ("security", "Reviewing security headers"),
    ("links", "Checking links"),
    ("content", "Analyzing content"),
    ("scoring", "Calculating scores"),
    ("report", "Generating prescription"),
]


def stage_list(current: str | None, failed: str | None = None) -> list[dict]:
    keys = [k for k, _ in STAGES]
    idx = keys.index(current) if current in keys else -1
    out = []
    for i, (key, label) in enumerate(STAGES):
        state = "done" if i < idx else "active" if i == idx else "pending"
        if failed and key == failed:
            state = "failed"
        out.append({"key": key, "label": label, "state": state})
    return out


def get_or_create_website(db: Session, url: str) -> Website:
    host = (urlsplit(url).hostname or "").lower()
    site = db.query(Website).filter(Website.host == host).one_or_none()
    if site is None:
        site = Website(host=host, url=url)
        db.add(site)
        db.flush()
    return site


def create_audit(db: Session, raw_url: str, listed: bool = True) -> Audit:
    url = validate(raw_url).url  # resolves and applies the SSRF policy before anything is queued
    site = get_or_create_website(db, url)
    audit = Audit(website_id=site.id, url=url, status="queued", stage="queued", stages=stage_list(None), listed=1 if listed else 0)
    db.add(audit)
    db.commit()
    db.refresh(audit)
    return audit


def _set_stage(db: Session, audit: Audit, key: str) -> None:
    audit.stage = key
    audit.stages = stage_list(key)
    db.commit()


def run_audit(db: Session, audit_id: str, analyzers=None) -> Audit:
    audit = db.get(Audit, audit_id)
    if audit is None:
        raise LookupError(audit_id)
    audit.status = "running"
    audit.started_at = datetime.now(timezone.utc)
    _set_stage(db, audit, "connecting")
    analyzers = analyzers or [cls() for cls in ANALYZERS]
    try:
        _set_stage(db, audit, "fetching")
        fetched = fetch(audit.url)
        ctx = PageContext.from_fetched(fetched)
        results: list[AnalyzerResult] = []
        for analyzer in analyzers:
            _set_stage(db, audit, analyzer.category)
            try:
                results.append(analyzer.run(ctx))
            except Exception:  # one analyzer failing must not kill the audit
                log.exception("analyzer %s failed for %s", analyzer.category, audit.url)
                results.append(AnalyzerResult(analyzer.category, [], {"error": "analyzer failed"}))
        _set_stage(db, audit, "scoring")
        scores = {r.category: category_score(r.findings) for r in results}
        health = health_score(scores)
        _set_stage(db, audit, "report")
        for r in results:
            db.add(AuditResult(audit_id=audit.id, category=r.category, score=scores[r.category], metrics=r.metrics))
        for rank, (category, f) in enumerate(rank_findings(results)):
            db.add(Issue(audit_id=audit.id, category=category, code=f.code, severity=f.severity, title=f.title, evidence=f.evidence, explanation=f.explanation, recommendation=f.recommendation, impact=f.impact, rank=rank))
        for item in build_prescription(results):
            db.add(Prescription(audit_id=audit.id, position=item["position"], severity=item["severity"], action=item["action"], issue_code=item["issue_code"]))
        audit.scores = scores
        audit.health_score = health
        audit.summary = {"final_url": fetched.final_url, "status": fetched.status, "response_ms": fetched.elapsed_ms, "counts": severity_counts(results), "checked_at": datetime.now(timezone.utc).isoformat()}
        audit.status = "completed"
        audit.stages = [dict(s, state="done") for s in stage_list("report")]
        audit.completed_at = datetime.now(timezone.utc)
        db.commit()
    except (FetchError, UnsafeURL) as e:
        audit.status = "failed"
        audit.error_message = str(getattr(e, "reason", e))
        audit.stages = stage_list(audit.stage, failed=audit.stage)
        audit.completed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:
        log.exception("audit %s crashed", audit_id)
        audit.status = "failed"
        audit.error_message = "The examination stopped because of an internal error. It has been logged."
        audit.stages = stage_list(audit.stage, failed=audit.stage)
        audit.completed_at = datetime.now(timezone.utc)
        db.commit()
    db.refresh(audit)
    return audit
