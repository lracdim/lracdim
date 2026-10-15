"""Studio delivery workflow.

A website diagnostic or intake submission opens a Lead. The admin moves the
lead through the pipeline; qualifying it creates a Client and a Project. The
client area reads only that client's own projects, milestones, deliverables,
and messages.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .core import new_id, now

# The pipeline, in order. `declined` and `archived` are terminal.
STAGES = (
    "diagnostic_submitted",
    "lead_review",
    "discovery_call",
    "qualified",
    "declined",
    "proposal",
    "contract_deposit",
    "onboarding",
    "strategy",
    "design",
    "development",
    "qa_approval",
    "launch",
    "maintenance",
    "archived",
)
TERMINAL_STAGES = ("declined", "archived")
# Stage a project (rather than a lead) lives in once work starts.
PROJECT_STAGES = ("onboarding", "strategy", "design", "development", "qa_approval", "launch", "maintenance", "archived")


class Lead(Base):
    __tablename__ = "leads"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    submission_id: Mapped[str | None] = mapped_column(ForeignKey("contact_submissions.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), index=True)
    company: Mapped[str | None] = mapped_column(String(160), nullable=True)
    website: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    project_type: Mapped[str] = mapped_column(String(64))
    budget_range: Mapped[str | None] = mapped_column(String(64), nullable=True)
    timeline: Mapped[str | None] = mapped_column(String(64), nullable=True)
    problem: Mapped[str] = mapped_column(Text)
    health_score: Mapped[int | None] = mapped_column(Integer, nullable=True)  # from the public diagnostic, when one was run
    stage: Mapped[str] = mapped_column(String(32), default="diagnostic_submitted", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    events: Mapped[list[LeadEvent]] = relationship(back_populates="lead", cascade="all, delete-orphan", order_by="LeadEvent.created_at")


class LeadEvent(Base):
    """One row per stage change, so the dashboard can show a timeline."""

    __tablename__ = "lead_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    lead_id: Mapped[str] = mapped_column(ForeignKey("leads.id"), index=True)
    from_stage: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_stage: Mapped[str] = mapped_column(String(32))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    lead: Mapped[Lead] = relationship(back_populates="events")


class Client(Base):
    __tablename__ = "clients"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120))
    company: Mapped[str | None] = mapped_column(String(160), nullable=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    # TODO: temporary authentication. The client area identifies a client by
    # this opaque key in an X-Client-Key header. Replace with a real session
    # (signed cookie or token) and hashed credentials before launch.
    access_key: Mapped[str] = mapped_column(String(64), default=new_id, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    projects: Mapped[list[Project]] = relationship(back_populates="client", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    lead_id: Mapped[str | None] = mapped_column(ForeignKey("leads.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    stage: Mapped[str] = mapped_column(String(32), default="onboarding", index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    client: Mapped[Client] = relationship(back_populates="projects")
    milestones: Mapped[list[Milestone]] = relationship(back_populates="project", cascade="all, delete-orphan", order_by="Milestone.position")
    deliverables: Mapped[list[Deliverable]] = relationship(back_populates="project", cascade="all, delete-orphan")
    messages: Mapped[list[Message]] = relationship(back_populates="project", cascade="all, delete-orphan", order_by="Message.created_at")


class Milestone(Base):
    __tablename__ = "milestones"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    position: Mapped[int] = mapped_column(Integer, default=0)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    project: Mapped[Project] = relationship(back_populates="milestones")


class Deliverable(Base):
    __tablename__ = "deliverables"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(32), default="file")  # file | link | report
    url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="pending")  # pending | delivered | approved
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    project: Mapped[Project] = relationship(back_populates="deliverables")


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    sender: Mapped[str] = mapped_column(String(16))  # admin | client
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    project: Mapped[Project] = relationship(back_populates="messages")
