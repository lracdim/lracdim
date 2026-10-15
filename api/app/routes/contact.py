"""Contact: the public intake form. A submission also opens a studio lead."""
from __future__ import annotations

from litestar import get, post
from litestar.di import Provide
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.security import rate_limit, require_admin
from ..db import provide_db
from ..models import ContactSubmission
from ..schemas import ContactIn, ContactOut
from ..services.contact_service import PROJECT_TYPES, create_submission
from ..services.studio_service import open_lead_from_submission

DB = {"db": Provide(provide_db)}


@get("/api/contact/project-types", sync_to_thread=False)
def project_types() -> list[str]:
    return list(PROJECT_TYPES)


@post("/api/contact", status_code=201, dependencies=DB, guards=[rate_limit("contact", settings.rate_limit_contact)], sync_to_thread=True)
def submit(data: ContactIn, db: Session) -> ContactOut:
    if data.honeypot:
        # Bots fill the hidden field. Acknowledge without storing.
        return ContactOut(id="0" * 32, received=True, notified=False)
    row = create_submission(db, data.model_dump(exclude={"honeypot"}))
    open_lead_from_submission(db, row)  # the submission enters the studio workflow
    return ContactOut(id=row.id, received=True, notified=bool(row.notified))


@get("/api/contact/submissions", dependencies=DB, guards=[require_admin], sync_to_thread=True)
def submissions(db: Session) -> list[dict]:
    rows = db.query(ContactSubmission).order_by(ContactSubmission.created_at.desc()).limit(100).all()
    return [
        {
            "id": r.id,
            "created_at": r.created_at,
            "name": r.name,
            "email": r.email,
            "company": r.company,
            "project_type": r.project_type,
            "timeline": r.timeline,
            "budget_range": r.budget_range,
            "classification": r.classification,
            "notified": bool(r.notified),
        }
        for r in rows
    ]


routes = [project_types, submit, submissions]
