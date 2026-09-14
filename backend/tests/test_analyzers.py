from app.analyzers import ANALYZERS, PageContext
from app.analyzers.accessibility import AccessibilityAnalyzer
from app.analyzers.links import LinkAnalyzer
from app.analyzers.performance import PerformanceAnalyzer
from app.analyzers.security import SecurityAnalyzer
from app.analyzers.seo import SEOAnalyzer
from app.analyzers.technical import TechnicalAnalyzer
from app.scoring import build_prescription, category_score, health_score, severity_counts
from tests.conftest import SAMPLE_HTML, FakeFetched


def ctx(**kw):
    return PageContext.from_fetched(FakeFetched(**kw))


def test_every_analyzer_returns_structured_result():
    c = ctx()
    for cls in ANALYZERS:
        analyzer = cls(check_robots=False) if cls is SEOAnalyzer else cls(checker=lambda u: (200, u, [])) if cls is LinkAnalyzer else cls()
        r = analyzer.run(c)
        assert r.category == cls.category
        assert isinstance(r.metrics, dict)
        for f in r.findings:
            assert f.code and f.title and f.evidence and f.explanation and f.recommendation and f.impact
            assert f.severity in ("critical", "high", "medium", "low")


def test_technical_flags_missing_viewport_and_lang():
    html = "<html><head><title>T</title></head><body><h1>a</h1><h1>b</h1><h3>c</h3></body></html>"
    r = TechnicalAnalyzer().run(ctx(html=html))
    codes = {f.code for f in r.findings}
    assert {"no_viewport", "no_lang", "multi_h1", "no_doctype"} <= codes


def test_technical_http_error_is_critical():
    r = TechnicalAnalyzer().run(ctx(status=503))
    assert any(f.code == "http_5xx" and f.severity == "critical" for f in r.findings)


def test_seo_missing_description_and_noindex():
    html = '<!DOCTYPE html><html lang="en"><head><title>Tiny</title><meta name="robots" content="noindex"></head><body><h1>x</h1></body></html>'
    r = SEOAnalyzer(check_robots=False).run(ctx(html=html))
    codes = {f.code for f in r.findings}
    assert {"no_description", "noindex", "no_canonical", "short_title"} <= codes
    assert r.metrics["title_length"] == 4


def test_seo_clean_page_has_only_alt_finding():
    r = SEOAnalyzer(check_robots=False).run(ctx())
    assert {f.code for f in r.findings} == {"images_missing_alt"}


def test_performance_detects_blocking_scripts_and_slow_response():
    html = "<!DOCTYPE html><html><head>" + "".join(f'<script src="/s{i}.js"></script>' for i in range(5)) + "</head><body></body></html>"
    r = PerformanceAnalyzer().run(ctx(html=html, elapsed_ms=3500, headers={"content-encoding": "", "cache-control": ""}))
    codes = {f.code for f in r.findings}
    assert {"blocking_scripts", "slow_response", "no_compression", "no_cache_control"} <= codes
    assert r.metrics["blocking_scripts"] == 5


def test_accessibility_finds_unlabelled_input():
    r = AccessibilityAnalyzer().run(ctx())
    assert any(f.code == "unlabelled_controls" for f in r.findings)
    assert r.metrics["unlabelled_controls"] == 1
    assert r.metrics["landmarks"] == ["header", "nav", "main", "footer"]


def test_security_no_https_is_critical_and_headers_reported():
    r = SecurityAnalyzer().run(ctx(url="http://example.com/", https=False, headers={"strict-transport-security": ""}))
    assert any(f.code == "sec_no_https" and f.severity == "critical" for f in r.findings)
    r2 = SecurityAnalyzer().run(ctx(headers={"content-security-policy": "default-src 'self'", "x-frame-options": "DENY", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer"}))
    assert not any(f.code in ("no_csp", "no_framing_protection", "no_nosniff", "no_referrer_policy", "no_hsts") for f in r2.findings)


def test_links_reports_broken_and_respects_limit():
    seen = []

    def checker(url):
        seen.append(url)
        return (404, url, []) if url.endswith("/about/") else (200, url, [])

    r = LinkAnalyzer(checker=checker, max_checked=2, concurrency=2).run(ctx())
    assert len(seen) == 2
    assert r.metrics["internal_links"] == 2 and r.metrics["external_links"] == 1
    assert any(f.code == "broken_links" and f.severity == "high" for f in r.findings)


def test_scoring_methodology():
    from app.analyzers.base import AnalyzerResult, Finding

    mk = lambda sev: Finding("c", sev, "t", "e", "x", "r", "i")
    assert category_score([]) == 100
    assert category_score([mk("critical"), mk("high")]) == 55
    assert category_score([mk("critical")] * 5) == 0
    assert health_score({"technical": 100, "seo": 100, "performance": 100, "accessibility": 100, "security": 100, "links": 100, "content": 100}) == 100
    assert health_score({"technical": 0, "seo": 100}) == 50
    results = [AnalyzerResult("seo", [mk("low"), mk("critical")]), AnalyzerResult("content", [Finding("d", "high", "t", "e", "x", "r", "i")])]
    plan = build_prescription(results)
    assert [p["severity"] for p in plan] == ["critical", "high"]  # de-duplicated by code, ranked by severity
    assert severity_counts(results) == {"critical": 1, "high": 1, "medium": 0, "low": 1}
