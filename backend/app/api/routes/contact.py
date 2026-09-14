from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...core.config import settings
from ...core.security import rate_limit, require_admin
from ...db import get_db
from ...models import ContactSubmission
from ...schemas import ContactIn, ContactOut
from ...services.contact_service import PROJECT_TYPES, create_submission

router = APIRouter(prefix="/api/contact", tags=["contact"])


@router.get("/project-types")
def project_types():
    return list(PROJECT_TYPES)


@router.post("", response_model=ContactOut, status_code=201, dependencies=[Depends(rate_limit("contact", settings.rate_limit_contact))])
def submit(payload: ContactIn, db: Session = Depends(get_db)):
    if payload.honeypot:
        # Bots fill the hidden field. Acknowledge without storing.
        return {"id": "0" * 32, "received": True, "notified": False}
    row = create_submission(db, payload.model_dump(exclude={"honeypot"}))
    return {"id": row.id, "received": True, "notified": bool(row.notified)}


@router.get("/submissions", dependencies=[Depends(require_admin)])
def submissions(db: Session = Depends(get_db)):
    rows = db.query(ContactSubmission).order_by(ContactSubmission.created_at.desc()).limit(100).all()
    return [{"id": r.id, "created_at": r.created_at, "name": r.name, "email": r.email, "company": r.company, "project_type": r.project_type, "timeline": r.timeline, "budget_range": r.budget_range, "classification": r.classification, "notified": bool(r.notified)} for r in rows]
