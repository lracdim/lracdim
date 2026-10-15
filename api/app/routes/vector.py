"""Vector: website examinations."""
from __future__ import annotations

from litestar import get, post
from litestar.di import Provide
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.security import ApiError, rate_limit
from ..core.ssrf import UnsafeURL
from ..db import provide_db
from ..models import Audit, Website
from ..schemas import AuditCreate, AuditHistoryItem, AuditOut, AuditResultsOut, RecentAuditItem
from ..scoring import engine as scoring
from ..services.audit_service import create_audit
from ..workers.queue import queue

DB = {"db": Provide(provide_db)}


@post("/api/vector/audits", status_code=202, dependencies=DB, guards=[rate_limit("audits", settings.rate_limit_audits)], sync_to_thread=True)
def start_audit(data: AuditCreate, db: Session) -> AuditOut:
    try:
        audit = create_audit(db, data.url, listed=data.listed)
    except UnsafeURL as e:
        raise ApiError(422, "invalid_url", str(e))
    queue.enqueue_audit(audit.id)
    return AuditOut.model_validate(audit)


@get("/api/vector/recent", dependencies=DB, sync_to_thread=True)
def recent(db: Session) -> list[RecentAuditItem]:
    """Latest completed examination per website, newest first, for websites
    whose examiner did not opt out. Host, score, and date only."""
    rows = db.query(Audit).filter(Audit.status == "completed", Audit.listed == 1).order_by(Audit.completed_at.desc()).limit(60).all()
    out, seen = [], set()
    for a in rows:
        if a.website_id in seen:
            continue
        seen.add(a.website_id)
        out.append(RecentAuditItem(id=a.id, host=a.website.host, health_score=a.health_score, completed_at=a.completed_at))
        if len(out) == 10:
            break
    return out


@get("/api/vector/audits/{audit_id:str}", dependencies=DB, sync_to_thread=True)
def get_audit(audit_id: str, db: Session) -> AuditOut:
    audit = db.get(Audit, audit_id)
    if audit is None:
        raise ApiError(404, "not_found", "No examination with that id.")
    return AuditOut.model_validate(audit)


@get("/api/vector/audits/{audit_id:str}/results", dependencies=DB, sync_to_thread=True)
def get_results(audit_id: str, db: Session) -> AuditResultsOut:
    audit = db.get(Audit, audit_id)
    if audit is None:
        raise ApiError(404, "not_found", "No examination with that id.")
    if audit.status != "completed":
        raise ApiError(409, "not_ready", f"The examination is {audit.status}.")
    results = sorted(audit.results, key=lambda r: list(scoring.WEIGHTS).index(r.category) if r.category in scoring.WEIGHTS else 99)
    return AuditResultsOut.model_validate(
        {"audit": audit, "results": results, "issues": audit.issues, "prescription": audit.prescriptions, "methodology": scoring.__doc__.strip()}
    )


@get("/api/vector/websites/{host:str}/audits", dependencies=DB, sync_to_thread=True)
def website_history(host: str, db: Session) -> list[AuditHistoryItem]:
    site = db.query(Website).filter(Website.host == host.lower()).one_or_none()
    if site is None:
        return []
    rows = db.query(Audit).filter(Audit.website_id == site.id, Audit.status == "completed").order_by(Audit.completed_at.asc()).limit(50).all()
    return [AuditHistoryItem.model_validate(r) for r in rows]


routes = [start_audit, recent, get_audit, get_results, website_history]
