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
        analyzer = cls(check_robots=False) if cls is SEOAnalyzer else cls(checker=lambda u: (200, u, [])) if cls is LinkAnalyzer else cls(check_remote=False) if cls.category == "ai" else cls(measure_vitals=None) if cls is PerformanceAnalyzer else cls()
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
    r = PerformanceAnalyzer(measure_vitals=None).run(ctx(html=html, elapsed_ms=3500, headers={"content-encoding": "", "cache-control": ""}))
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


def test_links_bot_blockers_are_unverifiable_not_broken():
    html = '<!DOCTYPE html><html lang="en"><head><title>T</title></head><body><a href="/">home</a><a href="https://www.linkedin.com/in/someone">li</a><a href="https://example.org/gone">dead</a></body></html>'

    def checker(url):
        if "linkedin" in url:
            return (999, url, [])
        if url.endswith("/gone"):
            return (404, url, [])
        return (200, url, [])

    r = LinkAnalyzer(checker=checker, max_checked=10, concurrency=2).run(ctx(html=html))
    assert r.metrics["unverifiable"] == ["https://www.linkedin.com/in/someone"]
    assert r.metrics["broken"] == ["https://example.org/gone"]
    codes = {f.code: f.severity for f in r.findings}
    assert codes["unverifiable_links"] == "low"
    assert codes["broken_links"] == "medium"  # the dead link is external; the LinkedIn block does not count


def test_seo_empty_alt_is_decorative_not_missing():
    html = '<!DOCTYPE html><html lang="en"><head><title>A fine title for the page</title><meta name="description" content="' + "x" * 80 + '"><link rel="canonical" href="https://example.com/"></head><body><h1>x</h1><img src="a.png" alt=""><img src="b.png" alt="A chart"><img src="c.png"></body></html>'
    r = SEOAnalyzer(check_robots=False).run(ctx(html=html))
    assert r.metrics["images_missing_alt"] == 1


# ---- AI visibility --------------------------------------------------------

from app.analyzers.ai_visibility import AIVisibilityAnalyzer, is_blocked, parse_robots_groups


class _Resp:
    def __init__(self, text, status=200, ctype="text/plain"):
        self.text, self.status, self.headers = text, status, {"content-type": ctype}


def test_robots_groups_share_rules_and_specific_group_wins():
    robots = "User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n\nUser-agent: PerplexityBot\nAllow: /\nDisallow: /\n"
    groups = parse_robots_groups(robots)
    assert is_blocked(groups, "GPTBot") and is_blocked(groups, "CCBot")
    assert not is_blocked(groups, "OAI-SearchBot")  # falls to * which only blocks /admin
    assert not is_blocked(groups, "PerplexityBot")  # Allow: / overrides Disallow: / in its own group


def test_ai_visibility_flags_blocked_answer_crawlers_but_not_training_ones():
    def fetcher(url, **kw):
        if url.endswith("/robots.txt"):
            return _Resp("User-agent: GPTBot\nDisallow: /\n\nUser-agent: OAI-SearchBot\nUser-agent: PerplexityBot\nUser-agent: Claude-SearchBot\nDisallow: /\n")
        return _Resp("<!doctype html><p>not found</p>", status=404, ctype="text/html")

    r = AIVisibilityAnalyzer(fetcher=fetcher).run(ctx())
    codes = {f.code: f.severity for f in r.findings}
    assert codes["ai_answer_crawlers_blocked"] == "high"
    assert len(r.metrics["training_crawlers_blocked"]) == 1
    assert "ai_no_llms_txt" in codes and "ai_no_structured_data" in codes


def test_ai_visibility_reads_structured_data_and_llms_txt():
    html = SAMPLE_HTML.replace("</head>", '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"X"},{"@type":["WebSite"]}]}</script><script type="application/ld+json">{bad json,}</script></head>')

    def fetcher(url, **kw):
        return _Resp("# Example\nA site." if url.endswith("/llms.txt") else "User-agent: *\nAllow: /\n")

    r = AIVisibilityAnalyzer(fetcher=fetcher).run(ctx(html=html))
    assert r.metrics["structured_data_types"] == ["Organization", "WebSite"]
    assert r.metrics["structured_data_invalid_blocks"] == 1
    assert r.metrics["llms_txt"] == "present"
    assert {f.code for f in r.findings} == {"ai_invalid_structured_data"}


# ---- Core Web Vitals ------------------------------------------------------

from app.services import pagespeed


def test_pagespeed_parse_prefers_field_data_and_rates_thresholds():
    data = {
        "loadingExperience": {"metrics": {"LARGEST_CONTENTFUL_PAINT_MS": {"percentile": 4300}, "INTERACTION_TO_NEXT_PAINT": {"percentile": 180}, "CUMULATIVE_LAYOUT_SHIFT_SCORE": {"percentile": 15}}},
        "lighthouseResult": {"audits": {"total-blocking-time": {"numericValue": 350.4}, "largest-contentful-paint": {"numericValue": 1900}}, "categories": {"performance": {"score": 0.62}}},
    }
    v = pagespeed.parse(data)
    assert v["source"] == "field" and v["lcp_ms"] == 4300 and v["cls"] == 0.15 and v["tbt_ms"] == 350 and v["lighthouse_score"] == 62
    assert v["ratings"] == {"lcp_ms": "poor", "inp_ms": "good", "cls": "needs improvement", "tbt_ms": "needs improvement"}


def test_performance_turns_vitals_into_findings_with_source_aware_severity():
    field = {"source": "field", "strategy": "mobile", "lcp_ms": 4300, "inp_ms": 600, "cls": 0.05, "tbt_ms": 900, "lighthouse_score": 40, "ratings": {"lcp_ms": "poor", "inp_ms": "poor", "cls": "good", "tbt_ms": "poor"}}
    r = PerformanceAnalyzer(measure_vitals=lambda url: field).run(ctx())
    codes = {f.code: f.severity for f in r.findings}
    assert codes["cwv_lcp"] == "high" and codes["cwv_inp"] == "high"
    assert "cwv_cls" not in codes and "cwv_tbt" not in codes  # TBT only reported when there is no field data

    lab = dict(field, source="lab", inp_ms=None, ratings={"lcp_ms": "poor", "tbt_ms": "poor"})
    codes = {f.code: f.severity for f in PerformanceAnalyzer(measure_vitals=lambda url: lab).run(ctx()).findings}
    assert codes["cwv_lcp"] == "medium" and codes["cwv_tbt"] == "medium"

    none = PerformanceAnalyzer(measure_vitals=lambda url: None).run(ctx())
    assert none.metrics["vitals"] is None and "not measured" in none.metrics["vitals_note"]


def test_analyzers_do_not_mutate_the_shared_document():
    from app.analyzers.content import ContentAnalyzer

    html = SAMPLE_HTML.replace("</head>", '<script type="application/ld+json">{"@type":"Organization"}</script></head>')
    c = ctx(html=html)
    ContentAnalyzer().run(c)  # strips scripts for its word count; must do so on a copy
    r = AIVisibilityAnalyzer(check_remote=False).run(c)
    assert r.metrics["structured_data_types"] == ["Organization"]
