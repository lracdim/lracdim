import pytest

from app.services import monitor_service, signal_scan
from tests.conftest import SAMPLE_HTML, FakeFetched

ANALYTICS_HTML = SAMPLE_HTML.replace("</head>", '<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script><script>gtag("config", "G-ABC123")</script><script src="https://static.hotjar.com/c/hotjar-1.js"></script></head>')


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.setattr(signal_scan, "fetch", lambda url, **kw: FakeFetched(html=ANALYTICS_HTML, url=url))
    from app.analyzers import seo

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


def test_detect_analytics():
    found = signal_scan.detect_analytics(ANALYTICS_HTML)
    assert "Google Analytics 4" in found and "Hotjar" in found
    assert signal_scan.detect_analytics("<html></html>") == []


def test_public_scan_registers_and_snapshots(client):
    r = client.post("/api/signal/scan", json={"url": "www.example.com"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["persisted"] is True
    assert body["target"]["source"] == "public" and body["target"]["status"] == "operational"
    snap = body["snapshot"]
    assert set(snap["scores"]) == {"technical", "seo", "performance", "content"}
    assert snap["analytics"] == ["Google Analytics 4", "Hotjar"] and snap["analytics_score"] == 100
    assert snap["seo"]["indexable"] is True
    assert "note" in snap
    # public targets are not on the public board, but are addressable
    assert all(t["source"] == "admin" for t in client.get("/api/signal/targets").json())
    assert client.get("/api/signal/lookup", params={"host": "www.example.com"}).json()["id"] == body["target"]["id"]
    latest = client.get(f"/api/signal/targets/{body['target']['id']}/snapshot").json()
    assert latest["data"]["scores"] == snap["scores"]
    # scanning again reuses the target and adds a second snapshot
    again = client.post("/api/signal/scan", json={"url": "https://www.example.com/"}).json()
    assert again["target"]["id"] == body["target"]["id"]
    kinds = [e["kind"] for e in client.get(f"/api/signal/targets/{body['target']['id']}/events?kind=snapshot").json()]
    assert kinds == ["snapshot", "snapshot"]


def test_public_scan_rejects_private(client):
    assert client.post("/api/signal/scan", json={"url": "http://192.168.0.1/"}).status_code == 422


def test_public_scan_fetch_failure_is_readable(client, monkeypatch):
    from app.services.fetcher import FetchError

    def boom(url, **kw):
        raise FetchError("The server could not be reached.")

    monkeypatch.setattr(signal_scan, "fetch", boom)
    r = client.post("/api/signal/scan", json={"url": "example.com"})
    assert r.status_code == 502 and r.json()["error"]["message"] == "The server could not be reached."


def test_detect_ga4_measurement_id_in_config():
    html = '<html><head><script type="application/json" id="cfg">{"apiBase":"","gaId":"G-HRK6B357GM"}</script></head></html>'
    assert "Google Analytics 4" in signal_scan.detect_analytics(html)
    assert signal_scan.detect_analytics('<p>Model G-SHOCK</p>') == []
