from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...core.config import settings
from ...core.security import rate_limit
from ...core.ssrf import UnsafeURL
from ...db import get_db
from ...models import Audit, Website
from ...schemas import AuditCreate, AuditHistoryItem, AuditOut, AuditResultsOut
from ...scoring import engine as scoring
from ...services.audit_service import create_audit
from ...workers.queue import queue

router = APIRouter(prefix="/api/vector", tags=["vector"])


@router.post("/audits", response_model=AuditOut, status_code=202, dependencies=[Depends(rate_limit("audits", settings.rate_limit_audits))])
def start_audit(payload: AuditCreate, db: Session = Depends(get_db)):
    try:
        audit = create_audit(db, payload.url)
    except UnsafeURL as e:
        raise HTTPException(status_code=422, detail={"code": "invalid_url", "message": str(e)})
    queue.enqueue_audit(audit.id)
    return audit


@router.get("/audits/{audit_id}", response_model=AuditOut)
def get_audit(audit_id: str, db: Session = Depends(get_db)):
    audit = db.get(Audit, audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "No examination with that id."})
    return audit


@router.get("/audits/{audit_id}/results", response_model=AuditResultsOut)
def get_results(audit_id: str, db: Session = Depends(get_db)):
    audit = db.get(Audit, audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "No examination with that id."})
    if audit.status != "completed":
        raise HTTPException(status_code=409, detail={"code": "not_ready", "message": f"The examination is {audit.status}."})
    return {"audit": audit, "results": sorted(audit.results, key=lambda r: list(scoring.WEIGHTS).index(r.category) if r.category in scoring.WEIGHTS else 99), "issues": audit.issues, "prescription": audit.prescriptions, "methodology": scoring.__doc__.strip()}


@router.get("/websites/{host}/audits", response_model=list[AuditHistoryItem])
def website_history(host: str, db: Session = Depends(get_db)):
    site = db.query(Website).filter(Website.host == host.lower()).one_or_none()
    if site is None:
        return []
    return db.query(Audit).filter(Audit.website_id == site.id, Audit.status == "completed").order_by(Audit.completed_at.asc()).limit(50).all()
