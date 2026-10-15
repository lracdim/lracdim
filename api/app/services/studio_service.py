"""Studio workflow rules.

One place decides what a lead may do next, what happens when it is qualified,
and how a client's own records are scoped. Routes stay thin.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from ..models.core import ContactSubmission
from ..models.studio import STAGES, TERMINAL_STAGES, Client, Deliverable, Lead, LeadEvent, Message, Milestone, Project

log = logging.getLogger("studio")

# What the admin may move a lead to from where it is now. Leads stop at
# `qualified`; everything after that is tracked on the project.
ALLOWED_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "diagnostic_submitted": ("lead_review", "declined"),
    "lead_review": ("discovery_call", "declined"),
    "discovery_call": ("proposal", "declined"),
    "proposal": ("contract_deposit", "declined"),
    "contract_deposit": ("qualified", "declined"),
    "qualified": ("archived",),
    "declined": ("lead_review",),  # a declined lead can be reopened
    "archived": (),
}

# The default milestones a new project starts with, in order.
STARTER_MILESTONES = ("Onboarding and access", "Web strategy", "Design", "Development", "QA and approval", "Launch")


class WorkflowError(ValueError):
    """Raised when a requested stage change is not allowed."""


def next_stages(stage: str) -> tuple[str, ...]:
    return ALLOWED_TRANSITIONS.get(stage, ())


def open_lead_from_submission(db: Session, submission: ContactSubmission, health_score: int | None = None) -> Lead:
    """Every intake submission becomes a lead at the first stage. Called from
    the public contact route, so a failure here must never lose the enquiry."""
    try:
        lead = Lead(
            submission_id=submission.id,
            name=submission.name,
            email=submission.email,
            company=submission.company,
            website=submission.website,
            project_type=submission.project_type,
            budget_range=submission.budget_range,
            timeline=submission.timeline,
            problem=submission.problem,
            health_score=health_score,
            stage="diagnostic_submitted",
        )
        db.add(lead)
        db.flush()
        db.add(LeadEvent(lead_id=lead.id, from_stage=None, to_stage="diagnostic_submitted", note="Submitted from the public site"))
        db.commit()
        db.refresh(lead)
        return lead
    except Exception:  # pragma: no cover - the submission itself is already stored
        log.exception("could not open a lead for submission %s", submission.id)
        db.rollback()
        raise


def advance_lead(db: Session, lead: Lead, to_stage: str, note: str | None = None) -> Lead:
    if to_stage not in STAGES:
        raise WorkflowError(f"{to_stage} is not a workflow stage.")
    if to_stage not in next_stages(lead.stage):
        allowed = ", ".join(next_stages(lead.stage)) or "nothing (this stage is terminal)"
        raise WorkflowError(f"A lead at {lead.stage} can move to: {allowed}.")
    previous = lead.stage
    lead.stage = to_stage
    db.add(LeadEvent(lead_id=lead.id, from_stage=previous, to_stage=to_stage, note=note))
    db.commit()
    db.refresh(lead)
    return lead


def qualify_lead(db: Session, lead: Lead, project_name: str | None = None, due_in_days: int = 45) -> tuple[Client, Project]:
    """Qualifying a lead creates the client (reusing one with the same email)
    and the first project, with starter milestones."""
    if lead.stage in TERMINAL_STAGES:
        raise WorkflowError("A declined or archived lead cannot be qualified.")
    client = db.query(Client).filter(Client.email == lead.email).one_or_none()
    if client is None:
        client = Client(name=lead.name, company=lead.company, email=lead.email)
        db.add(client)
        db.flush()

    now = datetime.now(UTC)
    project = Project(
        client_id=client.id,
        lead_id=lead.id,
        name=project_name or f"{lead.company or lead.name}: {lead.project_type}",
        summary=lead.problem[:500],
        stage="onboarding",
        started_at=now,
        due_at=now + timedelta(days=due_in_days),
    )
    db.add(project)
    db.flush()
    for position, title in enumerate(STARTER_MILESTONES):
        db.add(Milestone(project_id=project.id, title=title, position=position))

    previous = lead.stage
    lead.stage = "qualified"
    lead.client_id = client.id
    db.add(LeadEvent(lead_id=lead.id, from_stage=previous, to_stage="qualified", note=f"Client and project created: {project.name}"))
    db.commit()
    db.refresh(client)
    db.refresh(project)
    return client, project


def complete_milestone(db: Session, milestone: Milestone) -> Milestone:
    milestone.completed_at = datetime.now(UTC)
    db.commit()
    db.refresh(milestone)
    return milestone


def post_message(db: Session, project: Project, sender: str, body: str) -> Message:
    if sender not in ("admin", "client"):
        raise WorkflowError("A message is from either the admin or the client.")
    message = Message(project_id=project.id, sender=sender, body=body)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def client_projects(db: Session, client_id: str) -> list[Project]:
    """The only query the client area may use. Scoping lives here so no route
    can forget it."""
    return db.query(Project).filter(Project.client_id == client_id).order_by(Project.created_at.desc()).all()


def deliverables_for_client(db: Session, client_id: str) -> list[Deliverable]:
    return (
        db.query(Deliverable)
        .join(Project, Deliverable.project_id == Project.id)
        .filter(Project.client_id == client_id)
        .order_by(Deliverable.created_at.desc())
        .all()
    )
