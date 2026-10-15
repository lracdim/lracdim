"""Seed the studio workflow with sample data for local development.

    cd api
    .venv\\Scripts\\python scripts/seed_studio.py

Everything it writes is obviously fictional: example.com addresses and made-up
company names. Run it against a development database only; it refuses to touch
one that is not SQLite unless --force is passed.
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models.core import ContactSubmission  # noqa: E402
from app.models.studio import Client, Deliverable, Lead, Message, Project  # noqa: E402
from app.services import studio_service  # noqa: E402

SUBMISSIONS = [
    # (name, email, company, project_type, problem, budget, timeline, website, stages to advance through)
    ("Dana Ruiz", "dana@kestrelfreight.example.com", "Kestrel Freight", "Automation", "Quotes are typed twice: once in email, once in a spreadsheet. We lose two a week.", "$5,000 – $15,000", "Within 1 month", "https://kestrelfreight.example.com/", []),
    ("Marcus Hale", "marcus@alderclinic.example.com", "Alder Street Clinic", "Website", "The site is five years old and the booking form does not work on a phone.", "$2,000 – $5,000", "1 to 3 months", "https://alderclinic.example.com/", ["lead_review"]),
    ("Priya Nandakumar", "priya@northwindsecurity.example.com", "Northwind Security", "Business System", "Guard scheduling lives in three spreadsheets and a group chat.", "$15,000+", "As soon as possible", "https://northwindsecurity.example.com/", ["lead_review", "discovery_call"]),
    ("Tom Whitfield", "tom@brightpathtutors.example.com", "Brightpath Tutors", "Web Application", "Parents book lessons by email and we invoice by hand afterwards.", "$5,000 – $15,000", "1 to 3 months", "https://brightpathtutors.example.com/", ["lead_review", "discovery_call", "proposal"]),
    ("Sofia Marchetti", "sofia@harborbakery.example.com", "Harbor Bakery", "Website", "We want online ordering for pickup, nothing complicated.", "Under $2,000", "Exploring for now", "https://harborbakery.example.com/", ["lead_review", "declined"]),
    ("Owen Baptiste", "owen@ridgelineaccounting.example.com", "Ridgeline Accounting", "Data / Analytics", "Month-end reporting takes three days of copying numbers between systems.", "$5,000 – $15,000", "Within 1 month", "https://ridgelineaccounting.example.com/", ["lead_review", "discovery_call", "proposal", "contract_deposit"]),
]

# Leads that become clients with a project in flight.
QUALIFIED = [
    ("Imogen Clarke", "imogen@verdantlandscapes.example.com", "Verdant Landscapes", "Business System", "Job sheets are printed, filled in by hand, and photographed at the end of the day.", "$15,000+", "Within 1 month", "https://verdantlandscapes.example.com/", "Verdant field operations system", "development"),
    ("Felix Osei", "felix@meridiancourier.example.com", "Meridian Courier", "Web Application", "Dispatchers rekey every booking into the driver app.", "$15,000+", "1 to 3 months", "https://meridiancourier.example.com/", "Meridian dispatch portal", "design"),
]


def submission(db, name, email, company, project_type, problem, budget, timeline, website) -> ContactSubmission:
    row = ContactSubmission(
        name=name,
        email=email,
        company=company,
        project_type=project_type,
        problem=problem,
        budget_range=budget,
        timeline=timeline,
        website=website,
        classification={"project_type": project_type, "complexity": "Medium", "urgency": "Normal", "method": "seed"},
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def main(force: bool = False) -> int:
    if not settings.is_sqlite and not force:
        print("Refusing to seed a non-SQLite database. Pass --force if you really mean it.")
        return 1

    db = SessionLocal()
    try:
        if db.query(Lead).count():
            print(f"Leads already exist ({db.query(Lead).count()}). Nothing seeded.")
            return 0

        for name, email, company, kind, problem, budget, timeline, website, stages in SUBMISSIONS:
            lead = studio_service.open_lead_from_submission(db, submission(db, name, email, company, kind, problem, budget, timeline, website))
            for stage in stages:
                studio_service.advance_lead(db, lead, stage, note=f"Seed: moved to {stage}")

        for name, email, company, kind, problem, budget, timeline, website, project_name, stage in QUALIFIED:
            lead = studio_service.open_lead_from_submission(db, submission(db, name, email, company, kind, problem, budget, timeline, website))
            for step in ("lead_review", "discovery_call", "proposal", "contract_deposit"):
                studio_service.advance_lead(db, lead, step, note="Seed")
            client, project = studio_service.qualify_lead(db, lead, project_name=project_name)
            project.stage = stage
            # Complete the milestones up to the current stage.
            reached = {"onboarding": 1, "strategy": 2, "design": 3, "development": 4, "qa_approval": 5, "launch": 6}.get(stage, 1)
            for milestone in project.milestones[:reached]:
                milestone.completed_at = datetime.now(timezone.utc) - timedelta(days=7 * (reached - milestone.position))
            db.add(Deliverable(project_id=project.id, title="Discovery notes", kind="file", status="delivered", url="/images/placeholder.png"))
            db.add(Deliverable(project_id=project.id, title="Staging site", kind="link", status="delivered", url="https://staging.example.com/"))
            db.add(Message(project_id=project.id, sender="admin", body=f"Welcome aboard. {project.name} is set up and the first milestone is underway."))
            db.add(Message(project_id=project.id, sender="client", body="Thanks. I have sent the logo files and brand colours."))
            db.commit()
            print(f"client {client.email}: project {project.name} ({stage}) · client key {client.access_key}")

        print(f"\nseeded {db.query(Lead).count()} leads, {db.query(Client).count()} clients, {db.query(Project).count()} projects")
        print("The client keys above are what the dashboard's client area uses as X-Client-Key.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main(force="--force" in sys.argv))
