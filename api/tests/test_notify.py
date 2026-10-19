"""Resend notifications: off unless configured, correct request shape, failures never raise,
and the optional visitor acknowledgement. No test talks to the real Resend API."""
from __future__ import annotations

from dataclasses import replace

import pytest

from app.core.config import settings as base_settings
from app.services import notify


class Recorder:
    def __init__(self, status=200, body=None):
        self.calls = []
        self.status = status
        self.body = body if body is not None else {"id": "email_123"}

    def __call__(self, url, headers=None, json=None, timeout=None):
        self.calls.append({"url": url, "headers": headers or {}, "json": json})
        rec = self

        class Response:
            status_code = rec.status

            def json(self):
                return rec.body

        return Response()


@pytest.fixture
def configure(monkeypatch):
    def apply(**overrides):
        monkeypatch.setattr(notify, "settings", replace(base_settings, **overrides))

    return apply


@pytest.fixture
def recorder(monkeypatch):
    rec = Recorder()
    monkeypatch.setattr(notify.httpx, "post", rec)
    return rec


INTAKE = {
    "id": "abc123",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "company": "Acme",
    "project_type": "Automation",
    "problem": "Leads arrive by email and someone retypes them into a spreadsheet.",
    "budget_range": None,
    "classification": {"complexity": "Medium", "likely_services": ["Automation"]},
}


def test_resend_is_off_without_an_api_key(configure, recorder):
    configure(resend_api_key="", notify_email="owner@example.com", smtp_host="", notify_webhook="")
    delivered = notify.notify("[LRACDIMENSION] New project inquiry", INTAKE)
    assert delivered == {"email": False, "webhook": False, "resend": False}
    assert recorder.calls == []


def test_resend_needs_a_recipient(configure, recorder):
    configure(resend_api_key="re_test", notify_email="", smtp_host="", notify_webhook="")
    assert notify.notify("subject", INTAKE)["resend"] is False
    assert recorder.calls == []


def test_owner_notification_request_shape(configure, recorder):
    configure(resend_api_key="re_test", notify_email="owner@example.com", smtp_host="", notify_webhook="")
    delivered = notify.notify("[LRACDIMENSION] New project inquiry: Automation — Jane Doe", INTAKE)
    assert delivered["resend"] is True
    (call,) = recorder.calls
    assert call["url"] == "https://api.resend.com/emails"
    assert call["headers"]["Authorization"] == "Bearer re_test"
    assert call["headers"]["Idempotency-Key"] == "notify-abc123"
    body = call["json"]
    assert body["from"] == "LRACDIMENSION <onboarding@resend.dev>"
    assert body["to"] == ["owner@example.com"]
    assert body["reply_to"] == "jane@example.com"  # replying to the alert answers the visitor
    assert body["subject"].startswith("[LRACDIMENSION] New project inquiry")
    # A readable body, not a JSON dump; empty fields are left out.
    assert "Name: Jane Doe" in body["text"] and "Project type: Automation" in body["text"]
    assert "Budget" not in body["text"] and "{" not in body["text"]


def test_a_resend_failure_is_reported_not_raised(configure, monkeypatch):
    configure(resend_api_key="re_test", notify_email="owner@example.com", smtp_host="", notify_webhook="")
    monkeypatch.setattr(notify.httpx, "post", Recorder(status=403, body={"message": "domain not verified"}))
    delivered = notify.notify("subject", INTAKE)
    assert delivered["resend"] is False


def test_network_error_is_reported_not_raised(configure, monkeypatch):
    configure(resend_api_key="re_test", notify_email="owner@example.com", smtp_host="", notify_webhook="")

    def boom(*a, **k):
        raise notify.httpx.ConnectError("offline")

    monkeypatch.setattr(notify.httpx, "post", boom)
    assert notify.notify("subject", INTAKE)["resend"] is False


def test_signal_alerts_go_through_resend_too(configure, recorder):
    configure(resend_api_key="re_test", notify_email="owner@example.com", smtp_host="", notify_webhook="")
    notify.notify("[Signal] example.com: unavailable", {"target": "https://example.com", "status_code": 503})
    (call,) = recorder.calls
    assert "reply_to" not in call["json"] and "Idempotency-Key" not in call["headers"]
    assert "Target: https://example.com" in call["json"]["text"]


def test_acknowledgement_is_off_by_default(configure, recorder):
    configure(resend_api_key="re_test", notify_email="owner@example.com", resend_autoreply=False)
    assert notify.acknowledge("jane@example.com", "Jane Doe", "Automation", "abc123") is False
    assert recorder.calls == []


def test_acknowledgement_waits_for_a_verified_domain(configure, recorder):
    configure(resend_api_key="re_test", notify_email="owner@example.com", resend_autoreply=True)
    # Default sender is onboarding@resend.dev, which cannot email visitors.
    assert notify.acknowledge("jane@example.com", "Jane Doe", "Automation", "abc123") is False
    assert recorder.calls == []


def test_acknowledgement_with_a_verified_domain(configure, recorder):
    configure(
        resend_api_key="re_test",
        notify_email="owner@example.com",
        resend_autoreply=True,
        resend_from="John Carl <hello@lracdimension.online>",
    )
    assert notify.acknowledge("jane@example.com", "Jane Doe", "Automation", "abc123") is True
    (call,) = recorder.calls
    body = call["json"]
    assert body["to"] == ["jane@example.com"] and body["reply_to"] == "owner@example.com"
    assert body["text"].startswith("Hi Jane,") and "automation inquiry" in body["text"]
    assert call["headers"]["Idempotency-Key"] == "ack-abc123"


def test_intake_submission_triggers_owner_email_and_acknowledgement(client, configure, recorder):
    configure(
        resend_api_key="re_test",
        notify_email="owner@example.com",
        smtp_host="",
        notify_webhook="",
        resend_autoreply=True,
        resend_from="John Carl <hello@lracdimension.online>",
    )
    r = client.post(
        "/api/contact",
        json={
            "name": "Jane Doe",
            "email": "jane@example.com",
            "project_type": "Automation",
            "problem": "Leads arrive by email and someone retypes them into a spreadsheet every day.",
        },
    )
    assert r.status_code == 201 and r.json()["notified"] is True
    recipients = [c["json"]["to"][0] for c in recorder.calls]
    assert recipients == ["owner@example.com", "jane@example.com"]


def test_honeypot_submissions_send_nothing(client, configure, recorder):
    configure(resend_api_key="re_test", notify_email="owner@example.com", smtp_host="", notify_webhook="")
    r = client.post(
        "/api/contact",
        json={"name": "Bot Bot", "email": "bot@example.com", "project_type": "Other", "problem": "buy now buy now buy now", "honeypot": "x"},
    )
    assert r.status_code == 201
    assert recorder.calls == []
