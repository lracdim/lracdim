"""Signal public scan: a visitor enters a domain and gets a measured
snapshot: availability, response time, SSL, SEO and technical scores from
the same analyzers Vector uses, and which analytics tools the page loads.
The domain is registered as a public monitoring target (capped) so the
scheduled checks keep measuring it afterwards."""
from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..analyzers import PageContext
from ..analyzers.content import ContentAnalyzer
from ..analyzers.performance import PerformanceAnalyzer
from ..analyzers.seo import SEOAnalyzer
from ..analyzers.technical import TechnicalAnalyzer
from ..core.config import settings
from ..core.ssrf import validate
from ..models import MonitoringTarget, SignalEvent
from ..scoring import category_score
from .fetcher import fetch
from .monitor_service import check_target

ANALYTICS_SIGNATURES = {
    "Google Analytics 4": (r"googletagmanager\.com/gtag/js\?id=G-", r"gtag\('config',\s*'G-"),
    "Universal Analytics (retired)": (r"google-analytics\.com/analytics\.js", r"gtag\('config',\s*'UA-"),
    "Google Tag Manager": (r"googletagmanager\.com/gtm\.js", r"GTM-[A-Z0-9]+"),
    "Meta Pixel": (r"connect\.facebook\.net/[a-z_]+/fbevents\.js", r"fbq\('init'"),
    "Microsoft Clarity": (r"clarity\.ms/tag/",),
    "Hotjar": (r"static\.hotjar\.com/c/hotjar-",),
    "Plausible": (r"plausible\.io/js/",),
    "Fathom": (r"cdn\.usefathom\.com/script\.js",),
    "Matomo": (r"matomo\.js", r"_paq\.push"),
    "LinkedIn Insight": (r"snap\.licdn\.com/li\.lms-analytics",),
    "TikTok Pixel": (r"analytics\.tiktok\.com/i18n/pixel",),
    "HubSpot": (r"js\.hs-scripts\.com/",),
    "Vercel Analytics": (r"/_vercel/insights/script\.js", r"va\.vercel-scripts\.com"),
    "Cloudflare Web Analytics": (r"static\.cloudflareinsights\.com/beacon",),
}

PUBLIC_TARGET_CAP = 300


def detect_analytics(html: str) -> list[str]:
    found = []
    for name, patterns in ANALYTICS_SIGNATURES.items():
        if any(re.search(p, html) for p in patterns):
            found.append(name)
    return found


def get_or_register_public_target(db: Session, raw_url: str) -> tuple[MonitoringTarget | None, bool]:
    """Returns (target, persisted). Public targets are capped; beyond the cap
    the scan still runs but nothing is registered."""
    safe = validate(raw_url)
    existing = db.query(MonitoringTarget).filter(MonitoringTarget.host == safe.host).one_or_none()
    if existing is not None:
        return existing, True
    count = db.query(MonitoringTarget).filter(MonitoringTarget.source == "public", MonitoringTarget.enabled == 1).count()
    if count >= PUBLIC_TARGET_CAP:
        return None, False
    target = MonitoringTarget(name=safe.host, url=safe.url, host=safe.host, source="public")
    db.add(target)
    db.commit()
    db.refresh(target)
    db.add(SignalEvent(target_id=target.id, kind="registered", level="info", message="Registered by public scan"))
    db.commit()
    return target, True


def snapshot(db: Session, target: MonitoringTarget | None, url: str) -> dict:
    """Fetch once, run the four document analyzers, detect analytics, and
    store the result as a snapshot event when a target exists."""
    fetched = fetch(url)
    ctx = PageContext.from_fetched(fetched)
    results = {a.category: a.run(ctx) for a in (TechnicalAnalyzer(), SEOAnalyzer(), PerformanceAnalyzer(), ContentAnalyzer())}
    scores = {cat: category_score(r.findings) for cat, r in results.items()}
    seo_m = results["seo"].metrics
    tech_m = results["technical"].metrics
    perf_m = results["performance"].metrics
    analytics = detect_analytics(fetched.text)
    indexable = not ("noindex" in (seo_m.get("robots_meta") or "") or "noindex" in (seo_m.get("x_robots_tag") or "") or seo_m.get("robots_txt") == "blocks_all" or tech_m.get("status", 200) >= 400)
    data = {
        "scores": scores,
        "analytics_score": min(100, 40 + 30 * min(2, len(analytics))) if analytics else 0,
        "analytics": analytics,
        "seo": {
            "title": seo_m.get("title"),
            "title_length": seo_m.get("title_length"),
            "description_length": seo_m.get("description_length"),
            "canonical": seo_m.get("canonical"),
            "indexable": indexable,
            "robots_txt": seo_m.get("robots_txt"),
            "sitemap": seo_m.get("sitemap"),
            "open_graph": seo_m.get("open_graph"),
            "images_missing_alt": seo_m.get("images_missing_alt"),
        },
        "technical": {"status": tech_m.get("status"), "https": tech_m.get("https"), "redirects": tech_m.get("redirect_count"), "viewport": tech_m.get("viewport"), "lang": tech_m.get("lang"), "h1_count": tech_m.get("h1_count")},
        "performance": {"response_ms": perf_m.get("response_ms"), "document_bytes": perf_m.get("document_bytes"), "scripts": perf_m.get("scripts"), "images": perf_m.get("images"), "compressed": bool(perf_m.get("content_encoding"))},
        "top_findings": [{"category": cat, "severity": f.severity, "title": f.title, "recommendation": f.recommendation} for cat, r in results.items() for f in r.findings][:12],
        "final_url": fetched.final_url,
        "measured_at": datetime.now(timezone.utc).isoformat(),
        "note": "SEO, technical, performance, and content scores use Vector's analyzers and scoring. Analytics score reflects detected tracking tools only; it does not read any analytics account.",
    }
    if target is not None:
        db.add(SignalEvent(target_id=target.id, kind="snapshot", level="info", message=f"Snapshot: SEO {scores['seo']}, technical {scores['technical']}, {len(analytics)} analytics tool(s)", status_code=fetched.status, response_ms=fetched.elapsed_ms, data=data))
        db.commit()
    return data


def public_scan(db: Session, raw_url: str) -> dict:
    target, persisted = get_or_register_public_target(db, raw_url)
    url = target.url if target else validate(raw_url).url
    if target is not None:
        check_target(db, target)
        db.refresh(target)
    snap = snapshot(db, target, url)
    return {"target": target, "persisted": persisted, "snapshot": snap}


def latest_snapshot(db: Session, target_id: str) -> SignalEvent | None:
    return db.query(SignalEvent).filter(SignalEvent.target_id == target_id, SignalEvent.kind == "snapshot").order_by(SignalEvent.created_at.desc()).first()
