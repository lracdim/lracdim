"""Persistent entities. Relationships are deliberate:

website 1-* audit 1-* audit_result (one per analyzer) ; audit 1-* issue ;
audit 1-* prescription ; monitoring_target 1-* signal_event ; tool_run ;
contact_submission ; user (reserved for account features; no auth yet)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Website(Base):
    __tablename__ = "websites"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    host: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    url: Mapped[str] = mapped_column(String(2048))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    audits: Mapped[list["Audit"]] = relationship(back_populates="website")


class Audit(Base):
    __tablename__ = "audits"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    website_id: Mapped[str] = mapped_column(ForeignKey("websites.id"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    url: Mapped[str] = mapped_column(String(2048))
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)  # queued|running|completed|failed
    stage: Mapped[str] = mapped_column(String(64), default="queued")
    stages: Mapped[list] = mapped_column(JSON, default=list)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    health_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scores: Mapped[dict] = mapped_column(JSON, default=dict)
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    website: Mapped[Website] = relationship(back_populates="audits")
    results: Mapped[list["AuditResult"]] = relationship(back_populates="audit", cascade="all, delete-orphan")
    issues: Mapped[list["Issue"]] = relationship(back_populates="audit", cascade="all, delete-orphan", order_by="Issue.rank")
    prescriptions: Mapped[list["Prescription"]] = relationship(back_populates="audit", cascade="all, delete-orphan", order_by="Prescription.position")


class AuditResult(Base):
    __tablename__ = "audit_results"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    audit_id: Mapped[str] = mapped_column(ForeignKey("audits.id"), index=True)
    category: Mapped[str] = mapped_column(String(32))
    score: Mapped[int] = mapped_column(Integer)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    audit: Mapped[Audit] = relationship(back_populates="results")


class Issue(Base):
    __tablename__ = "issues"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    audit_id: Mapped[str] = mapped_column(ForeignKey("audits.id"), index=True)
    category: Mapped[str] = mapped_column(String(32))
    code: Mapped[str] = mapped_column(String(64))
    severity: Mapped[str] = mapped_column(String(16))  # critical|high|medium|low
    title: Mapped[str] = mapped_column(String(255))
    evidence: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str] = mapped_column(Text)
    recommendation: Mapped[str] = mapped_column(Text)
    impact: Mapped[str] = mapped_column(Text)
    rank: Mapped[int] = mapped_column(Integer, default=0)
    audit: Mapped[Audit] = relationship(back_populates="issues")


class Prescription(Base):
    __tablename__ = "prescriptions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    audit_id: Mapped[str] = mapped_column(ForeignKey("audits.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    severity: Mapped[str] = mapped_column(String(16))
    action: Mapped[str] = mapped_column(String(255))
    issue_code: Mapped[str] = mapped_column(String(64))
    audit: Mapped[Audit] = relationship(back_populates="prescriptions")


class MonitoringTarget(Base):
    __tablename__ = "monitoring_targets"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    url: Mapped[str] = mapped_column(String(2048))
    host: Mapped[str] = mapped_column(String(255), index=True)
    enabled: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(16), default="unknown")  # operational|degraded|unavailable|unknown
    last_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_response_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ssl_valid: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ssl_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ssl_issuer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    events: Mapped[list["SignalEvent"]] = relationship(back_populates="target", cascade="all, delete-orphan")


class SignalEvent(Base):
    __tablename__ = "signal_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    target_id: Mapped[str] = mapped_column(ForeignKey("monitoring_targets.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)  # check|status_change|incident|warning|ssl
    level: Mapped[str] = mapped_column(String(16), default="info")  # info|warning|critical
    message: Mapped[str] = mapped_column(String(255))
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    target: Mapped[MonitoringTarget] = relationship(back_populates="events")


Index("ix_signal_events_target_created", SignalEvent.target_id, SignalEvent.created_at)


class ToolRun(Base):
    __tablename__ = "tool_runs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    tool: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(16))
    processing_ms: Mapped[int] = mapped_column(Integer, default=0)
    result_meta: Mapped[dict] = mapped_column(JSON, default=dict)  # metadata only, never the payload
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class ContactSubmission(Base):
    __tablename__ = "contact_submissions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), index=True)
    company: Mapped[str | None] = mapped_column(String(160), nullable=True)
    project_type: Mapped[str] = mapped_column(String(64))
    problem: Mapped[str] = mapped_column(Text)
    current_system: Mapped[str | None] = mapped_column(Text, nullable=True)
    desired_outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    timeline: Mapped[str | None] = mapped_column(String(64), nullable=True)
    budget_range: Mapped[str | None] = mapped_column(String(64), nullable=True)
    additional: Mapped[str | None] = mapped_column(Text, nullable=True)
    website: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    classification: Mapped[dict] = mapped_column(JSON, default=dict)
    notified: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class ResearchEntry(Base):
    __tablename__ = "research_entries"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255))
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    views: Mapped[int] = mapped_column(Integer, default=0)
