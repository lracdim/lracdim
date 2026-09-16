from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlsplit

from ..core.config import settings
from ..services.fetcher import head_or_get
from .base import Analyzer, AnalyzerResult, Finding, PageContext

SKIP_SCHEMES = ("mailto:", "tel:", "javascript:", "data:", "#")

# Hosts that answer automated requests with a block (LinkedIn's 999, 403 or
# 429 challenges). A block is not evidence the link is dead, so these are
# reported as unverifiable rather than broken.
BOT_BLOCKERS = {"linkedin.com", "facebook.com", "instagram.com", "x.com", "twitter.com", "tiktok.com", "threads.net", "pinterest.com"}
BLOCK_STATUSES = {None, 403, 429, 999}


def _is_unverifiable(url: str, status) -> bool:
    if status == 999:
        return True
    host = (urlsplit(url).hostname or "").lower()
    host = host[4:] if host.startswith("www.") else host
    return host in BOT_BLOCKERS and status in BLOCK_STATUSES


class LinkAnalyzer(Analyzer):
    """Checks a bounded sample of the page's links. Internal links first,
    then external, up to AUDIT_MAX_LINKS_CHECKED, with limited concurrency."""

    category = "links"

    def __init__(self, checker=head_or_get, max_checked: int | None = None, concurrency: int | None = None):
        self.checker = checker
        self.max_checked = max_checked or settings.audit_max_links_checked
        self.concurrency = concurrency or settings.audit_link_concurrency

    def run(self, ctx: PageContext) -> AnalyzerResult:
        base = ctx.fetched.final_url
        internal: list[str] = []
        external: list[str] = []
        seen: set[str] = set()
        for a in ctx.soup.find_all("a", href=True):
            href = str(a["href"]).strip()
            if not href or href.startswith(SKIP_SCHEMES):
                continue
            absolute = urljoin(base, href).split("#")[0]
            if not absolute.startswith(("http://", "https://")) or absolute in seen:
                continue
            seen.add(absolute)
            (internal if ctx.is_internal(absolute) else external).append(absolute)

        to_check = (internal + external)[: self.max_checked]
        results: dict[str, tuple] = {}
        with ThreadPoolExecutor(max_workers=self.concurrency) as pool:
            for url, res in zip(to_check, pool.map(self.checker, to_check)):
                results[url] = res

        unverifiable = [u for u, (status, _, _) in results.items() if _is_unverifiable(u, status)]
        broken = [u for u, (status, _, _) in results.items() if (status is None or status >= 400) and u not in unverifiable]
        chains = [u for u, (_, _, redirects) in results.items() if len(redirects) > 1]
        redirected_internal = [u for u in internal if u in results and results[u][2]]
        insecure_internal = [u for u in internal if u.startswith("http://")] if ctx.scheme == "https" else []
        nofollow_external = sum(1 for a in ctx.soup.find_all("a", href=True) if "nofollow" in (a.get("rel") or []))

        metrics = {
            "internal_links": len(internal),
            "external_links": len(external),
            "checked": len(to_check),
            "broken": broken[:20],
            "unverifiable": unverifiable[:20],
            "redirect_chains": chains[:20],
            "redirected_internal": len(redirected_internal),
            "note": f"Up to {self.max_checked} unique links are checked per examination; the counts above cover that sample.",
        }
        findings: list[Finding] = []
        if broken:
            sev = "high" if any(ctx.is_internal(u) for u in broken) else "medium"
            findings.append(Finding("broken_links", sev, "Broken links", f"{len(broken)} of {len(to_check)} checked links failed, e.g. {broken[0]}", "Visitors hit dead ends and crawlers waste budget on errors.", "Fix or remove each failing link; add redirects for moved pages.", "No dead ends; crawl budget spent on live pages."))
        if unverifiable:
            findings.append(Finding("unverifiable_links", "low", "Links that could not be verified", f"{len(unverifiable)} links point at sites that block automated checks, e.g. {unverifiable[0]}", "Social networks answer bots with a block, so the check proves nothing either way; the link is probably fine.", "Open each one in a browser to confirm it resolves; no change is needed if it does.", "Confidence that profile links work, without a false alarm."))
        if chains:
            findings.append(Finding("link_redirect_chains", "low", "Links that redirect more than once", f"{len(chains)} links pass through two or more redirects.", "Each hop costs a round trip before the destination loads.", "Link directly to the final address.", "Faster navigation and cleaner link signals."))
        if len(redirected_internal) > 3:
            findings.append(Finding("internal_redirects", "low", "Internal links that redirect", f"{len(redirected_internal)} internal links point at addresses that redirect.", "The site sends its own visitors through unnecessary hops.", "Update internal links to their final addresses.", "Direct internal navigation."))
        if insecure_internal:
            findings.append(Finding("insecure_internal_links", "medium", "Internal links use http", f"{len(insecure_internal)} internal links use http on an https site.", "Each one forces a redirect or, if none exists, drops the visitor to an insecure page.", "Use https or root-relative internal links.", "Consistent secure navigation."))
        if not internal:
            findings.append(Finding("no_internal_links", "medium", "No internal links found", "The page links to no other page on the same site.", "Crawlers cannot discover the rest of the site from here.", "Add navigation and contextual links to key pages.", "Discoverable site structure."))
        metrics["nofollow_external"] = nofollow_external
        return AnalyzerResult(self.category, findings, metrics)


def internal_hosts(url: str) -> str:
    return (urlsplit(url).hostname or "").lower()
