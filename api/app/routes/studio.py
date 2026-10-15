"""Studio: the delivery workflow behind the dashboard.

Admin routes need the admin key. Client routes need an X-Client-Key header
that identifies one client, and every query is scoped to that client in
studio_service, so a client can only ever read their own records.

TODO: both checks are temporary. Replace with signed sessions and per-user
roles before the dashboard is exposed publicly.
"""
from __future__ import annotations

from litestar import get, patch, post
from litestar.connection import ASGIConnection
from litestar.di import Provide
from litestar.handlers.base import BaseRouteHandler
from litestar.params import Parameter
from sqlalchemy.orm import Session

from ..core.security import ApiError, require_admin
from ..db import provide_db
from ..models.studio import PROJECT_STAGES, STAGES, TERMINAL_STAGES, Client, Lead, Milestone, Project
from ..schemas.studio import (
    ClientOut,
    DeliverableOut,
    LeadAdvanceIn,
    LeadDetailOut,
    LeadNotesIn,
    LeadOut,
    LeadQualifyIn,
    MessageIn,
    MessageOut,
    MilestoneOut,
    ProjectDetailOut,
    ProjectOut,
    ProjectStageIn,
    QualifyOut,
    WorkflowOut,
)
from ..services import studio_service
from ..services.studio_service import WorkflowError

DB = {"db": Provide(provide_db)}


def _client_from_key(db: Session, key: str) -> Client:
    client = db.query(Client).filter(Client.access_key == key).one_or_none() if key else None
    if client is None:
        raise ApiError(401, "unauthorized", "A client key is required.")
    return client


def require_client(connection: ASGIConnection, _: BaseRouteHandler) -> None:
    """Guard: the header must be present. The handler resolves it to a client
    and scopes every query to that client."""
    if not connection.headers.get("x-client-key"):
        raise ApiError(401, "unauthorized", "A client key is required.")


def _lead_or_404(db: Session, lead_id: str) -> Lead:
    lead = db.get(Lead, lead_id)
    if lead is None:
        raise ApiError(404, "not_found", "No lead with that id.")
    return lead


def _project_or_404(db: Session, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise ApiError(404, "not_found", "No project with that id.")
    return project


# ---- workflow description ------------------------------------------------


@get("/api/studio/workflow", sync_to_thread=False)
def workflow() -> WorkflowOut:
    """The pipeline itself, so the dashboard never hard-codes stage names."""
    return WorkflowOut(
        stages=list(STAGES),
        terminal=list(TERMINAL_STAGES),
        project_stages=list(PROJECT_STAGES),
        transitions={stage: list(nexts) for stage, nexts in studio_service.ALLOWED_TRANSITIONS.items()},
    )


# ---- admin ---------------------------------------------------------------


@get("/api/studio/leads", dependencies=DB, guards=[require_admin], sync_to_thread=True)
def list_leads(db: Session, stage: str | None = None, limit: int = Parameter(default=100, ge=1, le=500)) -> list[LeadOut]:
    q = db.query(Lead)
    if stage:
        q = q.filter(Lead.stage == stage)
    return [LeadOut.model_validate(r) for r in q.order_by(Lead.created_at.desc()).limit(limit).all()]


@get("/api/studio/leads/{lead_id:str}", dependencies=DB, guards=[require_admin], sync_to_thread=True)
def get_lead(lead_id: str, db: Session) -> LeadDetailOut:
    lead = _lead_or_404(db, lead_id)
    return LeadDetailOut(
        lead=LeadOut.model_validate(lead),
        events=[e for e in lead.events],
        next_stages=list(studio_service.next_stages(lead.stage)),
    )


@post("/api/studio/leads/{lead_id:str}/advance", status_code=200, dependencies=DB, guards=[require_admin], sync_to_thread=True)
def advance_lead(lead_id: str, data: LeadAdvanceIn, db: Session) -> LeadDetailOut:
    lead = _lead_or_404(db, lead_id)
    try:
        lead = studio_service.advance_lead(db, lead, data.to_stage, data.note)
    except WorkflowError as e:
        raise ApiError(409, "bad_transition", str(e))
    return LeadDetailOut(lead=LeadOut.model_validate(lead), events=list(lead.events), next_stages=list(studio_service.next_stages(lead.stage)))


@post("/api/studio/leads/{lead_id:str}/qualify", status_code=201, dependencies=DB, guards=[require_admin], sync_to_thread=True)
def qualify_lead(lead_id: str, data: LeadQualifyIn, db: Session) -> QualifyOut:
    lead = _lead_or_404(db, lead_id)
    try:
        client, project = studio_service.qualify_lead(db, lead, data.project_name, data.due_in_days)
    except WorkflowError as e:
        raise ApiError(409, "bad_transition", str(e))
    return QualifyOut(client=ClientOut.model_validate(client), project=ProjectOut.model_validate(project))


@patch("/api/studio/leads/{lead_id:str}/notes", dependencies=DB, guards=[require_admin], sync_to_thread=True)
def set_lead_notes(lead_id: str, data: LeadNotesIn, db: Session) -> LeadOut:
    lead = _lead_or_404(db, lead_id)
    lead.notes = data.notes
    db.commit()
    db.refresh(lead)
    return LeadOut.model_validate(lead)


@get("/api/studio/clients", dependencies=DB, guards=[require_admin], sync_to_thread=True)
def list_clients(db: Session) -> list[ClientOut]:
    return [ClientOut.model_validate(c) for c in db.query(Client).order_by(Client.created_at.desc()).all()]


@get("/api/studio/projects", dependencies=DB, guards=[require_admin], sync_to_thread=True)
def list_projects(db: Session, client_id: str | None = None) -> list[ProjectOut]:
    q = db.query(Project)
    if client_id:
        q = q.filter(Project.client_id == client_id)
    return [ProjectOut.model_validate(p) for p in q.order_by(Project.created_at.desc()).all()]


@get("/api/studio/projects/{project_id:str}", dependencies=DB, guards=[require_admin], sync_to_thread=True)
def get_project(project_id: str, db: Session) -> ProjectDetailOut:
    return _project_detail(_project_or_404(db, project_id))


@patch("/api/studio/projects/{project_id:str}/stage", dependencies=DB, guards=[require_admin], sync_to_thread=True)
def set_project_stage(project_id: str, data: ProjectStageIn, db: Session) -> ProjectOut:
    project = _project_or_404(db, project_id)
    if data.stage not in PROJECT_STAGES:
        raise ApiError(409, "bad_transition", f"A project stage is one of: {', '.join(PROJECT_STAGES)}.")
    project.stage = data.stage
    db.commit()
    db.refresh(project)
    return ProjectOut.model_validate(project)


@post("/api/studio/milestones/{milestone_id:str}/complete", status_code=200, dependencies=DB, guards=[require_admin], sync_to_thread=True)
def complete_milestone(milestone_id: str, db: Session) -> MilestoneOut:
    milestone = db.get(Milestone, milestone_id)
    if milestone is None:
        raise ApiError(404, "not_found", "No milestone with that id.")
    return MilestoneOut.model_validate(studio_service.complete_milestone(db, milestone))


@post("/api/studio/projects/{project_id:str}/messages", status_code=201, dependencies=DB, guards=[require_admin], sync_to_thread=True)
def admin_message(project_id: str, data: MessageIn, db: Session) -> MessageOut:
    project = _project_or_404(db, project_id)
    return MessageOut.model_validate(studio_service.post_message(db, project, "admin", data.body))


# ---- client area ---------------------------------------------------------


@get("/api/studio/me", dependencies=DB, guards=[require_client], sync_to_thread=True)
def me(db: Session, x_client_key: str = Parameter(header="X-Client-Key", default="")) -> ClientOut:
    return ClientOut.model_validate(_client_from_key(db, x_client_key))


@get("/api/studio/me/projects", dependencies=DB, guards=[require_client], sync_to_thread=True)
def my_projects(db: Session, x_client_key: str = Parameter(header="X-Client-Key", default="")) -> list[ProjectOut]:
    client = _client_from_key(db, x_client_key)
    return [ProjectOut.model_validate(p) for p in studio_service.client_projects(db, client.id)]


@get("/api/studio/me/projects/{project_id:str}", dependencies=DB, guards=[require_client], sync_to_thread=True)
def my_project(project_id: str, db: Session, x_client_key: str = Parameter(header="X-Client-Key", default="")) -> ProjectDetailOut:
    client = _client_from_key(db, x_client_key)
    project = _project_or_404(db, project_id)
    if project.client_id != client.id:
        # Same answer as a missing project: never confirm another client's ids.
        raise ApiError(404, "not_found", "No project with that id.")
    return _project_detail(project)


@get("/api/studio/me/files", dependencies=DB, guards=[require_client], sync_to_thread=True)
def my_files(db: Session, x_client_key: str = Parameter(header="X-Client-Key", default="")) -> list[DeliverableOut]:
    client = _client_from_key(db, x_client_key)
    return [DeliverableOut.model_validate(d) for d in studio_service.deliverables_for_client(db, client.id)]


@post("/api/studio/me/projects/{project_id:str}/messages", status_code=201, dependencies=DB, guards=[require_client], sync_to_thread=True)
def client_message(project_id: str, data: MessageIn, db: Session, x_client_key: str = Parameter(header="X-Client-Key", default="")) -> MessageOut:
    client = _client_from_key(db, x_client_key)
    project = _project_or_404(db, project_id)
    if project.client_id != client.id:
        raise ApiError(404, "not_found", "No project with that id.")
    return MessageOut.model_validate(studio_service.post_message(db, project, "client", data.body))


def _project_detail(project: Project) -> ProjectDetailOut:
    return ProjectDetailOut(
        project=ProjectOut.model_validate(project),
        client=ClientOut.model_validate(project.client),
        milestones=[MilestoneOut.model_validate(m) for m in project.milestones],
        deliverables=[DeliverableOut.model_validate(d) for d in project.deliverables],
        messages=[MessageOut.model_validate(m) for m in project.messages],
    )


routes = [
    workflow,
    list_leads,
    get_lead,
    advance_lead,
    qualify_lead,
    set_lead_notes,
    list_clients,
    list_projects,
    get_project,
    set_project_stage,
    complete_milestone,
    admin_message,
    me,
    my_projects,
    my_project,
    my_files,
    client_message,
]
