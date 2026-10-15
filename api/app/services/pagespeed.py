"""Core Web Vitals from Google PageSpeed Insights.

Two kinds of data come back:
  field  — real-user measurements from the Chrome UX Report, for URLs and
           origins with enough traffic. These are what Google uses.
  lab    — a single Lighthouse run on Google's servers, available for any
           public page. Useful, but not what visitors experienced.

Runs only when PAGESPEED_API_KEY is set. Anonymous calls share a tiny quota
and fail often, which would make reports inconsistent, so without a key the
performance analyzer states that Core Web Vitals were not measured.
"""
from __future__ import annotations

import logging

import httpx

from ..core.config import settings

log = logging.getLogger("pagespeed")

ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"

# Google's published thresholds: (good upper bound, poor lower bound).
THRESHOLDS = {
    "lcp_ms": (2500, 4000),
    "inp_ms": (200, 500),
    "cls": (0.1, 0.25),
    "tbt_ms": (200, 600),  # lab proxy for INP
}


def rate(metric: str, value: float | None) -> str | None:
    if value is None or metric not in THRESHOLDS:
        return None
    good, poor = THRESHOLDS[metric]
    return "good" if value <= good else "poor" if value > poor else "needs improvement"


def measure(url: str, *, strategy: str = "mobile", client: httpx.Client | None = None) -> dict | None:
    """Returns {source, strategy, lcp_ms, inp_ms, cls, tbt_ms, lighthouse_score,
    ratings} or None when not configured or the call fails."""
    if not settings.pagespeed_api_key:
        return None
    params = {"url": url, "strategy": strategy, "category": "performance", "key": settings.pagespeed_api_key}
    own = client is None
    client = client or httpx.Client(timeout=httpx.Timeout(60, connect=10))
    try:
        r = client.get(ENDPOINT, params=params)
        if r.status_code != 200:
            log.warning("pagespeed returned %s for %s", r.status_code, url)
            return None
        return parse(r.json(), strategy)
    except (httpx.HTTPError, ValueError):
        log.exception("pagespeed failed for %s", url)
        return None
    finally:
        if own:
            client.close()


def parse(data: dict, strategy: str = "mobile") -> dict:
    field = (data.get("loadingExperience") or {}).get("metrics") or {}
    origin_field = (data.get("originLoadingExperience") or {}).get("metrics") or {}
    audits = (data.get("lighthouseResult") or {}).get("audits") or {}
    categories = (data.get("lighthouseResult") or {}).get("categories") or {}

    def p75(metrics: dict, key: str):
        m = metrics.get(key) or {}
        return m.get("percentile")

    source = "field" if field else "origin field" if origin_field else "lab"
    fm = field or origin_field
    lcp = p75(fm, "LARGEST_CONTENTFUL_PAINT_MS")
    inp = p75(fm, "INTERACTION_TO_NEXT_PAINT")
    cls_raw = p75(fm, "CUMULATIVE_LAYOUT_SHIFT_SCORE")
    cls = cls_raw / 100 if cls_raw is not None else None  # CrUX reports CLS multiplied by 100

    lab_lcp = (audits.get("largest-contentful-paint") or {}).get("numericValue")
    lab_cls = (audits.get("cumulative-layout-shift") or {}).get("numericValue")
    lab_tbt = (audits.get("total-blocking-time") or {}).get("numericValue")
    score = (categories.get("performance") or {}).get("score")

    if lcp is None and lab_lcp is not None:
        lcp = round(lab_lcp)
    if cls is None and lab_cls is not None:
        cls = round(lab_cls, 3)
    tbt = round(lab_tbt) if lab_tbt is not None else None

    out = {
        "source": source,
        "strategy": strategy,
        "lcp_ms": lcp,
        "inp_ms": inp,
        "cls": cls,
        "tbt_ms": tbt,
        "lighthouse_score": round(score * 100) if isinstance(score, (int, float)) else None,
    }
    out["ratings"] = {k: rate(k, out[k]) for k in ("lcp_ms", "inp_ms", "cls", "tbt_ms") if out[k] is not None}
    return out
