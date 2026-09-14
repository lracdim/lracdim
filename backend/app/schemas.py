from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_serializer, field_validator

from .services.contact_service import PROJECT_TYPES


class Error(BaseModel):
    code: str
    message: str


class UTCModel(BaseModel):
    """Datetimes are stored in UTC; SQLite returns them naive. Always emit an
    explicit UTC offset so browsers do not read them as local time."""

    model_config = {"from_attributes": True}

    @field_serializer("*", when_used="json")
    def _utc(self, value):
        if isinstance(value, datetime):
            return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat().replace("+00:00", "Z")
        return value


class AuditCreate(BaseModel):
    url: str = Field(min_length=3, max_length=2048)


class StageOut(BaseModel):
    key: str
    label: str
    state: Literal["pending", "active", "done", "failed"]


class AuditOut(UTCModel):
    id: str
    url: str
    status: Literal["queued", "running", "completed", "failed"]
    stage: str
    stages: list[StageOut]
    error_message: str | None
    health_score: int | None
    scores: dict[str, int]
    summary: dict
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class IssueOut(BaseModel):
    category: str
    code: str
    severity: str
    title: str
    evidence: str
    explanation: str
    recommendation: str
    impact: str

    model_config = {"from_attributes": True}


class PrescriptionOut(BaseModel):
    position: int
    severity: str
    action: str
    issue_code: str

    model_config = {"from_attributes": True}


class ResultOut(BaseModel):
    category: str
    score: int
    metrics: dict

    model_config = {"from_attributes": True}


class AuditResultsOut(BaseModel):
    audit: AuditOut
    results: list[ResultOut]
    issues: list[IssueOut]
    prescription: list[PrescriptionOut]
    methodology: str


class AuditHistoryItem(UTCModel):
    id: str
    health_score: int | None
    scores: dict[str, int]
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class TargetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=3, max_length=2048)


class TargetOut(UTCModel):
    id: str
    name: str
    url: str
    host: str
    source: str
    status: str
    last_status_code: int | None
    last_response_ms: int | None
    last_checked_at: datetime | None
    ssl_valid: int | None
    ssl_expires_at: datetime | None
    ssl_issuer: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class EventOut(UTCModel):
    id: str
    target_id: str
    kind: str
    level: str
    message: str
    status_code: int | None
    response_ms: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ToolRunIn(BaseModel):
    url: str = Field(min_length=3, max_length=2048)


class ToolRunOut(BaseModel):
    tool: str
    run_id: str
    processing_ms: int
    result: dict


class ContactIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    company: str | None = Field(default=None, max_length=160)
    project_type: str
    problem: str = Field(min_length=10, max_length=5000)
    current_system: str | None = Field(default=None, max_length=2000)
    desired_outcome: str | None = Field(default=None, max_length=2000)
    timeline: str | None = Field(default=None, max_length=64)
    budget_range: str | None = Field(default=None, max_length=64)
    additional: str | None = Field(default=None, max_length=5000)
    website: str | None = Field(default=None, max_length=2048)
    honeypot: str | None = Field(default=None, max_length=10)

    @field_validator("project_type")
    @classmethod
    def _type(cls, v: str) -> str:
        if v not in PROJECT_TYPES:
            raise ValueError(f"project_type must be one of: {', '.join(PROJECT_TYPES)}")
        return v


class ContactOut(BaseModel):
    id: str
    received: bool
    notified: bool


class ScanIn(BaseModel):
    url: str = Field(min_length=3, max_length=2048)


class ScanOut(BaseModel):
    target: TargetOut | None
    persisted: bool
    snapshot: dict


class SnapshotOut(UTCModel):
    id: str | None
    created_at: datetime | None
    data: dict | None
