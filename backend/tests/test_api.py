import time

import pytest

from app.services import audit_service, monitor_service
from app.workers import queue as queue_module
from tests.conftest import SAMPLE_HTML, FakeFetched


@pytest.fixture(autouse=True)
def fake_network(monkeypatch):
    """No test touches the network: fetches return the sample page and
    link checks succeed."""
    monkeypatch.setattr(audit_service, "fetch", lambda url, **kw: FakeFetched(url=url))
    from app.analyzers import links, seo

    monkeypatch.setattr(links, "head_or_get", lambda url, timeout=8: (200, url, []))
    monkeypatch.setattr(seo.SEOAnalyzer, "_robots", lambda self, ctx: ("present", "present"))
    monkeypatch.setattr(monitor_service, "inspect_ssl", lambda host, port=443, timeout=6: {"valid": True, "expires_at": __import__("datetime").datetime(2030, 1, 1, tzinfo=__import__("datetime").timezone.utc), "issuer": "Test CA"})

    class R:
        status_code = 200

    class C:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url):
            return R()

    monkeypatch.setattr(monitor_service.httpx, "Client", C)
    monkeypatch.setattr(queue_module.queue, "enqueue_audit", lambda audit_id: queue_module.run_audit_job(audit_id))


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_audit_rejects_private_url(client):
    r = client.post("/api/vector/audits", json={"url": "http://127.0.0.1/"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_url"


def test_audit_validation_error_shape(client):
    r = client.post("/api/vector/audits", json={"url": "x"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation"


def test_audit_lifecycle_and_results(client):
    r = client.post("/api/vector/audits", json={"url": "example.com"})
    assert r.status_code == 202
    audit_id = r.json()["id"]
    for _ in range(50):
        a = client.get(f"/api/vector/audits/{audit_id}").json()
        if a["status"] in ("completed", "failed"):
            break
        time.sleep(0.05)
    assert a["status"] == "completed", a
    assert all(s["state"] == "done" for s in a["stages"])
    assert set(a["scores"]) == {"technical", "seo", "performance", "accessibility", "security", "links", "content"}
    res = client.get(f"/api/vector/audits/{audit_id}/results").json()
    assert res["audit"]["health_score"] == a["health_score"]
    assert len(res["results"]) == 7
    assert res["issues"] and all(k in res["issues"][0] for k in ("evidence", "explanation", "recommendation", "impact"))
    assert res["prescription"][0]["position"] == 1
    assert "Category score" in res["methodology"]
    history = client.get("/api/vector/websites/example.com/audits").json()
    assert history and history[-1]["id"] == audit_id


def test_results_not_ready_and_404(client):
    assert client.get("/api/vector/audits/nope/results").status_code == 404


def test_audit_failure_is_human_readable(client, monkeypatch):
    from app.services.fetcher import FetchError

    def boom(url, **kw):
        raise FetchError("The server could not be reached.")

    monkeypatch.setattr(audit_service, "fetch", boom)
    r = client.post("/api/vector/audits", json={"url": "example.com/down"})
    audit_id = r.json()["id"]
    for _ in range(50):
        a = client.get(f"/api/vector/audits/{audit_id}").json()
        if a["status"] in ("completed", "failed"):
            break
        time.sleep(0.05)
    assert a["status"] == "failed"
    assert a["error_message"] == "The server could not be reached."
    assert any(s["state"] == "failed" for s in a["stages"])
    assert client.get(f"/api/vector/audits/{audit_id}/results").status_code == 409


def test_signal_requires_admin_and_records_events(client):
    assert client.post("/api/signal/targets", json={"name": "Site", "url": "example.com"}).status_code == 401
    r = client.post("/api/signal/targets", json={"name": "Site", "url": "example.com"}, headers={"X-Admin-Key": "test-admin"})
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["status"] == "operational" and t["ssl_valid"] == 1
    events = client.get(f"/api/signal/targets/{t['id']}/events").json()
    kinds = {e["kind"] for e in events}
    assert {"registered", "check", "status_change", "ssl"} <= kinds
    assert client.get("/api/signal/targets").json()[0]["id"] == t["id"]
    assert client.post("/api/signal/targets", json={"name": "x", "url": "http://10.0.0.1/"}, headers={"X-Admin-Key": "test-admin"}).status_code == 422


def test_signal_status_transition_creates_incident(client, monkeypatch):
    from app.db import SessionLocal
    from app.models import MonitoringTarget, SignalEvent

    db = SessionLocal()
    target = db.query(MonitoringTarget).first()
    assert target is not None

    class Timeout(monitor_service.httpx.TimeoutException):
        pass

    class C:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url):
            raise monitor_service.httpx.TimeoutException("t")

    monkeypatch.setattr(monitor_service.httpx, "Client", C)
    sent = []
    monkeypatch.setattr(monitor_service, "notify", lambda subject, payload: sent.append(subject) or {"email": False, "webhook": False})
    monitor_service.check_target(db, target)
    assert target.status == "unavailable"
    incident = db.query(SignalEvent).filter(SignalEvent.target_id == target.id, SignalEvent.kind == "incident").first()
    assert incident is not None and incident.level == "critical"
    assert sent and "unavailable" in sent[0]
    db.close()


def test_forge_tool_run_and_unknown(client, monkeypatch):
    from app.services import forge_tools

    monkeypatch.setattr(forge_tools, "fetch", lambda url, **kw: FakeFetched(url=url))
    r = client.post("/api/forge/metadata-checker/run", json={"url": "example.com"})
    assert r.status_code == 200
    body = r.json()
    assert body["tool"] == "metadata-checker" and body["result"]["title"].startswith("Example Company")
    assert "Missing og:url." in body["result"]["problems"]
    assert client.post("/api/forge/nope/run", json={"url": "example.com"}).status_code == 404
    assert client.post("/api/forge/metadata-checker/run", json={"url": "http://localhost/"}).status_code == 422


def test_contact_validation_storage_and_honeypot(client, monkeypatch):
    from app.services import contact_service

    monkeypatch.setattr(contact_service, "notify", lambda s, p: {"email": False, "webhook": False})
    bad = client.post("/api/contact", json={"name": "A", "email": "no", "project_type": "Rocket", "problem": "short"})
    assert bad.status_code == 422 and bad.json()["error"]["fields"]
    good = client.post("/api/contact", json={"name": "Jane Doe", "email": "jane@example.com", "project_type": "Business System", "problem": "Our scheduling lives in a spreadsheet and the WordPress site has no portal for staff.", "timeline": "As soon as possible", "budget_range": "$5,000 – $15,000"})
    assert good.status_code == 201 and good.json()["received"] is True
    bot = client.post("/api/contact", json={"name": "Bot Bot", "email": "bot@example.com", "project_type": "Other", "problem": "buy now buy now buy now", "honeypot": "x"})
    assert bot.status_code == 201 and bot.json()["id"] == "0" * 32
    assert client.get("/api/contact/submissions").status_code == 401
    rows = client.get("/api/contact/submissions", headers={"X-Admin-Key": "test-admin"}).json()
    assert len(rows) == 1 and rows[0]["classification"]["complexity"] in ("Medium", "High")
    assert "Application Development" in rows[0]["classification"]["likely_services"]


def test_rate_limit_enforced(client):
    from app.core import security

    security.limiter._hits.clear()
    codes = [client.post("/api/contact", json={"honeypot": "x", "name": "Bot Bot", "email": "b@example.com", "project_type": "Other", "problem": "x" * 20}).status_code for _ in range(7)]
    assert 429 in codes


def test_body_size_limit(client):
    r = client.post("/api/contact", content=b"x" * 70000, headers={"content-type": "application/json", "content-length": "70000"})
    assert r.status_code == 413


def test_recent_list_respects_opt_out(client):
    def finish(url, listed):
        r = client.post("/api/vector/audits", json={"url": url, "listed": listed})
        assert r.status_code == 202
        audit_id = r.json()["id"]
        for _ in range(50):
            if client.get(f"/api/vector/audits/{audit_id}").json()["status"] in ("completed", "failed"):
                break
            time.sleep(0.05)
        return audit_id

    hidden = finish("www.example.com", False)
    shown = finish("example.com", True)
    recent = client.get("/api/vector/recent").json()
    ids = [it["id"] for it in recent]
    assert shown in ids and hidden not in ids
    assert all(set(it) == {"id", "host", "health_score", "completed_at"} for it in recent)
