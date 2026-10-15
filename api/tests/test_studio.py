from __future__ import annotations

import pytest

from app.db import SessionLocal
from app.models.core import ContactSubmission
from app.models.studio import Client, Lead
from app.services import studio_service
from app.services.studio_service import WorkflowError

ADMIN = {"X-Admin-Key": "test-admin"}


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _submission(db, email="buyer@example.com") -> ContactSubmission:
    row = ContactSubmission(
        name="Dana Buyer",
        email=email,
        company="Kestrel Freight",
        project_type="Automation",
        problem="Quotes are typed twice, once in email and once in a spreadsheet.",
        website="https://kestrel.example.com/",
        budget_range="$5,000 – $15,000",
        timeline="Within 1 month",
        classification={},
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_submission_opens_a_lead_at_the_first_stage(db):
    lead = studio_service.open_lead_from_submission(db, _submission(db, "first@example.com"))
    assert lead.stage == "diagnostic_submitted"
    assert [e.to_stage for e in lead.events] == ["diagnostic_submitted"]
    assert lead.problem.startswith("Quotes are typed twice")


def test_lead_only_moves_along_allowed_transitions(db):
    lead = studio_service.open_lead_from_submission(db, _submission(db, "transitions@example.com"))
    with pytest.raises(WorkflowError) as e:
        studio_service.advance_lead(db, lead, "launch")
    assert "can move to" in str(e.value)

    for stage in ("lead_review", "discovery_call", "proposal", "contract_deposit"):
        lead = studio_service.advance_lead(db, lead, stage, note=f"moved to {stage}")
    assert lead.stage == "contract_deposit"
    assert [e.to_stage for e in lead.events][-1] == "contract_deposit"


def test_qualifying_creates_client_project_and_starter_milestones(db):
    lead = studio_service.open_lead_from_submission(db, _submission(db, "qualify@example.com"))
    client, project = studio_service.qualify_lead(db, lead, project_name="Kestrel quote automation")

    assert lead.stage == "qualified" and lead.client_id == client.id
    assert project.client_id == client.id and project.stage == "onboarding"
    assert [m.title for m in project.milestones] == list(studio_service.STARTER_MILESTONES)

    # A second lead from the same email reuses the client rather than duplicating it.
    second = studio_service.open_lead_from_submission(db, _submission(db, "qualify@example.com"))
    client_again, second_project = studio_service.qualify_lead(db, second, project_name="Phase two")
    assert client_again.id == client.id
    assert second_project.id != project.id


def test_declined_lead_cannot_be_qualified(db):
    lead = studio_service.open_lead_from_submission(db, _submission(db, "declined@example.com"))
    studio_service.advance_lead(db, lead, "declined", note="Out of scope")
    with pytest.raises(WorkflowError):
        studio_service.qualify_lead(db, lead)


def test_public_intake_creates_a_lead_the_admin_can_see(client):
    payload = {
        "name": "Rae Prospect",
        "email": "rae@example.com",
        "company": "Alder Clinic",
        "project_type": "Website",
        "problem": "The site is five years old and the booking form does not work on phones.",
        "website": "https://alder.example.com/",
        "budget_range": "$2,000 – $5,000",
        "timeline": "Within 1 month",
    }
    assert client.post("/api/contact", json=payload).status_code == 201

    leads = client.get("/api/studio/leads", headers=ADMIN).json()
    assert any(lead["email"] == "rae@example.com" and lead["stage"] == "diagnostic_submitted" for lead in leads)


def test_admin_routes_require_the_admin_key(client):
    assert client.get("/api/studio/leads").status_code == 401
    assert client.get("/api/studio/leads", headers=ADMIN).status_code == 200


def test_workflow_endpoint_describes_the_pipeline(client):
    body = client.get("/api/studio/workflow").json()
    assert body["stages"][0] == "diagnostic_submitted"
    assert "declined" in body["terminal"]
    assert body["transitions"]["lead_review"] == ["discovery_call", "declined"]


def test_client_area_is_scoped_to_one_client(client, db):
    lead = studio_service.open_lead_from_submission(db, _submission(db, "scoped@example.com"))
    mine_client, mine_project = studio_service.qualify_lead(db, lead, project_name="Mine")
    other_lead = studio_service.open_lead_from_submission(db, _submission(db, "other@example.com"))
    _, other_project = studio_service.qualify_lead(db, other_lead, project_name="Theirs")

    key = {"X-Client-Key": db.get(Client, mine_client.id).access_key}
    assert client.get("/api/studio/me/projects").status_code == 401  # no key at all

    ids = [p["id"] for p in client.get("/api/studio/me/projects", headers=key).json()]
    assert ids == [mine_project.id]

    assert client.get(f"/api/studio/me/projects/{mine_project.id}", headers=key).status_code == 200
    # Another client's project is "not found", never "forbidden": ids stay private.
    blocked = client.get(f"/api/studio/me/projects/{other_project.id}", headers=key)
    assert blocked.status_code == 404 and blocked.json()["error"]["code"] == "not_found"


def test_messages_flow_both_ways(client, db):
    lead = studio_service.open_lead_from_submission(db, _submission(db, "messages@example.com"))
    client_row, project = studio_service.qualify_lead(db, lead, project_name="Talks")
    key = {"X-Client-Key": client_row.access_key}

    assert client.post(f"/api/studio/projects/{project.id}/messages", json={"body": "Welcome aboard."}, headers=ADMIN).status_code == 201
    assert client.post(f"/api/studio/me/projects/{project.id}/messages", json={"body": "Thanks, here are our logos."}, headers=key).status_code == 201

    detail = client.get(f"/api/studio/me/projects/{project.id}", headers=key).json()
    assert [m["sender"] for m in detail["messages"]] == ["admin", "client"]
    assert detail["client"]["email"] == "messages@example.com"


def test_lead_advance_over_http_rejects_a_bad_transition(client, db):
    lead = studio_service.open_lead_from_submission(db, _submission(db, "http@example.com"))
    bad = client.post(f"/api/studio/leads/{lead.id}/advance", json={"to_stage": "launch"}, headers=ADMIN)
    assert bad.status_code == 409 and bad.json()["error"]["code"] == "bad_transition"

    ok = client.post(f"/api/studio/leads/{lead.id}/advance", json={"to_stage": "lead_review", "note": "Looks real"}, headers=ADMIN)
    assert ok.status_code == 200
    body = ok.json()
    assert body["lead"]["stage"] == "lead_review"
    assert body["next_stages"] == ["discovery_call", "declined"]
    db.expire_all()  # the request used its own session; drop this one's cached copy
    assert db.get(Lead, lead.id).stage == "lead_review"
