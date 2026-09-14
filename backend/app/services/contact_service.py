"""Project intake: validate, classify (rule-based, internal only), persist,
notify."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import ContactSubmission
from .notify import notify

PROJECT_TYPES = ("Website", "Web Application", "Business System", "Automation", "Data / Analytics", "AI System", "Other")

KEYWORDS = {
    "Application Development": ("app", "portal", "dashboard", "login", "account", "users", "platform", "lms", "hrms", "booking"),
    "WordPress Development": ("wordpress", "wp", "elementor", "plugin", "theme"),
    "Automation": ("automat", "n8n", "zapier", "workflow", "email", "notification", "pipeline", "sync"),
    "Database Engineering": ("database", "postgres", "records", "reporting", "report", "data", "csv", "spreadsheet", "excel"),
    "SEO and Performance": ("seo", "google", "ranking", "traffic", "slow", "speed", "performance"),
    "AI Integration": ("ai", "chatbot", "gpt", "llm", "assistant"),
}


def classify(project_type: str, text: str, budget: str | None, timeline: str | None) -> dict:
    """Rule-based recommendation for triage. Not a promise, not shown to
    the submitter."""
    lowered = text.lower()
    services = [name for name, words in KEYWORDS.items() if any(w in lowered for w in words)]
    base = {"Website": 1, "Web Application": 3, "Business System": 3, "Automation": 2, "Data / Analytics": 2, "AI System": 3, "Other": 2}.get(project_type, 2)
    complexity_score = base + min(2, len(services) // 2) + (1 if len(text) > 600 else 0)
    complexity = "Low" if complexity_score <= 2 else "Medium" if complexity_score <= 3 else "High"
    urgency = "High" if (timeline or "").lower().startswith("as soon") else "Normal"
    return {"project_type": project_type, "complexity": complexity, "likely_services": services or ["Discovery call"], "urgency": urgency, "budget_range": budget or "undisclosed", "method": "keyword rules v1"}


def create_submission(db: Session, data: dict) -> ContactSubmission:
    text = " ".join(str(data.get(k) or "") for k in ("problem", "current_system", "desired_outcome", "additional"))
    row = ContactSubmission(
        name=data["name"].strip()[:120],
        email=data["email"].strip().lower(),
        company=(data.get("company") or "")[:160] or None,
        project_type=data["project_type"],
        problem=data["problem"].strip(),
        current_system=data.get("current_system") or None,
        desired_outcome=data.get("desired_outcome") or None,
        timeline=data.get("timeline") or None,
        budget_range=data.get("budget_range") or None,
        additional=data.get("additional") or None,
        website=data.get("website") or None,
        classification=classify(data["project_type"], text, data.get("budget_range"), data.get("timeline")),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    delivered = notify(f"[LRACDIMENSION] New project inquiry: {row.project_type} — {row.name}", {"id": row.id, "name": row.name, "email": row.email, "company": row.company, "project_type": row.project_type, "problem": row.problem, "current_system": row.current_system, "desired_outcome": row.desired_outcome, "timeline": row.timeline, "budget_range": row.budget_range, "website": row.website, "classification": row.classification})
    row.notified = 1 if any(delivered.values()) else 0
    db.commit()
    return row
