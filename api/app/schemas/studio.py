"""Studio workflow schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from .core import UTCModel


class LeadOut(UTCModel):
    id: str
    name: str
    email: str
    company: str | None
    website: str | None
    project_type: str
    budget_range: str | None
    timeline: str | None
    problem: str
    health_score: int | None
    stage: str
    notes: str | None
    client_id: str | None
    created_at: datetime
    updated_at: datetime


class LeadEventOut(UTCModel):
    id: str
    from_stage: str | None
    to_stage: str
    note: str | None
    created_at: datetime


class LeadDetailOut(BaseModel):
    lead: LeadOut
    events: list[LeadEventOut]
    next_stages: list[str]


class LeadAdvanceIn(BaseModel):
    to_stage: str = Field(min_length=3, max_length=32)
    note: str | None = Field(default=None, max_length=2000)


class LeadQualifyIn(BaseModel):
    project_name: str | None = Field(default=None, max_length=160)
    due_in_days: int = Field(default=45, ge=1, le=365)


class LeadNotesIn(BaseModel):
    notes: str = Field(max_length=5000)


class ClientOut(UTCModel):
    id: str
    name: str
    company: str | None
    email: EmailStr
    created_at: datetime


class MilestoneOut(UTCModel):
    id: str
    title: str
    position: int
    due_at: datetime | None
    completed_at: datetime | None


class DeliverableOut(UTCModel):
    id: str
    project_id: str
    title: str
    kind: str
    url: str | None
    status: str
    created_at: datetime


class MessageOut(UTCModel):
    id: str
    project_id: str
    sender: str
    body: str
    created_at: datetime
    read_at: datetime | None


class ProjectOut(UTCModel):
    id: str
    client_id: str
    lead_id: str | None
    name: str
    summary: str | None
    stage: str
    started_at: datetime | None
    due_at: datetime | None
    created_at: datetime


class ProjectDetailOut(BaseModel):
    project: ProjectOut
    client: ClientOut
    milestones: list[MilestoneOut]
    deliverables: list[DeliverableOut]
    messages: list[MessageOut]


class ProjectStageIn(BaseModel):
    stage: str = Field(min_length=3, max_length=32)


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class QualifyOut(BaseModel):
    client: ClientOut
    project: ProjectOut


class WorkflowOut(BaseModel):
    stages: list[str]
    terminal: list[str]
    project_stages: list[str]
    transitions: dict[str, list[str]]
