from __future__ import annotations

from ..services import pagespeed
from .base import Analyzer, AnalyzerResult, Finding, PageContext


class PerformanceAnalyzer(Analyzer):
    """Document-level performance indicators. This reads the HTML and the
    response timing only; it does not run a browser, so it reports resource
    counts and document weight, not Core Web Vitals, and says so."""

    category = "performance"

    def __init__(self, measure_vitals=pagespeed.measure):
        # Injected so tests and Signal's quick snapshot can skip the network call.
        self.measure_vitals = measure_vitals

    def run(self, ctx: PageContext) -> AnalyzerResult:
        soup, f = ctx.soup, ctx.fetched
        findings: list[Finding] = []
        scripts = soup.find_all("script", src=True)
        inline_scripts = [s for s in soup.find_all("script") if not s.get("src")]
        styles = soup.find_all("link", rel=lambda v: v and "stylesheet" in v)
        inline_style_bytes = sum(len(s.get_text() or "") for s in soup.find_all("style"))
        imgs = soup.find_all("img")
        lazy = [i for i in imgs if (i.get("loading") or "").lower() == "lazy"]
        unsized = [i for i in imgs if not (i.get("width") and i.get("height"))]
        blocking_scripts = [s for s in scripts if not (s.has_attr("defer") or s.has_attr("async") or s.get("type") == "module")]
        third_party = [s for s in scripts if s.get("src", "").startswith("http") and ctx.host not in s.get("src", "")]
        size = len(f.body)
        cache = f.headers.get("cache-control", "")
        encoding = f.headers.get("content-encoding", "")

        metrics = {
            "response_ms": f.elapsed_ms,
            "document_bytes": size,
            "scripts": len(scripts),
            "inline_scripts": len(inline_scripts),
            "blocking_scripts": len(blocking_scripts),
            "third_party_scripts": len(third_party),
            "stylesheets": len(styles),
            "inline_style_bytes": inline_style_bytes,
            "images": len(imgs),
            "images_lazy": len(lazy),
            "images_unsized": len(unsized),
            "content_encoding": encoding,
            "cache_control": cache,
            "note": "Document indicators come from the HTML and response timing of a single fetch, so the score can move by a few points between runs.",
        }

        vitals = self.measure_vitals(f.final_url) if self.measure_vitals else None
        metrics["vitals"] = vitals
        metrics["vitals_note"] = (
            "Core Web Vitals from Google PageSpeed Insights: " + {"field": "real-user data for this page from the Chrome UX Report.", "origin field": "real-user data for the whole site, since this page has too little traffic of its own.", "lab": "a single Lighthouse lab run; this site has too little traffic for real-user data."}[vitals["source"]]
            if vitals else "Core Web Vitals were not measured on this run."
        )
        if vitals:
            self._vital_findings(vitals, findings)

        if f.elapsed_ms > 3000:
            findings.append(Finding("slow_response", "high", "Slow server response", f"The document took {f.elapsed_ms} ms to arrive.", "Everything else waits for the first byte; this is the floor under every load.", "Cache the page at the edge or origin; check hosting and database queries.", "Faster first paint on every visit."))
        elif f.elapsed_ms > 1200:
            findings.append(Finding("moderate_response", "medium", "Server response could be faster", f"{f.elapsed_ms} ms to receive the document.", "Above about a second, delay becomes visible to visitors.", "Add page caching or a CDN in front of the origin.", "Sub-second delivery of the document."))
        if size > 500_000:
            findings.append(Finding("heavy_document", "medium", "Large HTML document", f"{size:,} bytes of HTML.", "Big documents delay parsing and push scripts and styles later.", "Move inline CSS and JavaScript to cached files; trim markup.", "Faster parse and render."))
        if len(blocking_scripts) > 3:
            findings.append(Finding("blocking_scripts", "high", "Render-blocking scripts", f"{len(blocking_scripts)} external scripts load without defer or async.", "The browser pauses HTML parsing for each one.", "Add defer to scripts that do not need to run before render.", "Earlier first render and interaction."))
        if len(scripts) > 20:
            findings.append(Finding("many_scripts", "medium", "High script count", f"{len(scripts)} external scripts.", "Each script is a request and a parse; totals compound on slow devices.", "Bundle, remove unused scripts, and audit third-party tags.", "Fewer requests, less main-thread work."))
        if len(third_party) > 6:
            findings.append(Finding("third_party", "low", "Many third-party scripts", f"{len(third_party)} scripts load from other domains.", "Each third party is a connection and code you do not control.", "Remove tags that no longer earn their cost; load the rest late.", "Less variance in load time."))
        if imgs and len(unsized) > len(imgs) // 2:
            findings.append(Finding("unsized_images", "medium", "Images without dimensions", f"{len(unsized)} of {len(imgs)} images lack width and height.", "The layout shifts as each image arrives.", "Set width and height attributes on every image.", "Stable layout while loading."))
        if len(imgs) > 12 and len(lazy) == 0:
            findings.append(Finding("no_lazy_loading", "low", "No lazy-loaded images", f"{len(imgs)} images, none with loading=\"lazy\".", "Every image downloads at once, including those below the fold.", "Add loading=\"lazy\" to images outside the first screen.", "Lower initial page weight."))
        if not encoding:
            findings.append(Finding("no_compression", "medium", "Document is not compressed", "No Content-Encoding header on the HTML response.", "Uncompressed HTML is typically three to five times larger over the wire.", "Enable gzip or Brotli on the server or CDN.", "Smaller transfers and faster loads."))
        if not cache:
            findings.append(Finding("no_cache_control", "low", "No Cache-Control on the document", "The HTML response has no Cache-Control header.", "Browsers and CDNs cannot tell how long the page may be reused.", "Set an explicit Cache-Control policy for HTML.", "Predictable caching behaviour."))
        return AnalyzerResult(self.category, findings, metrics)

    @staticmethod
    def _vital_findings(v: dict, findings: list[Finding]) -> None:
        real = v["source"] != "lab"
        who = "real visitors" if real else "a lab test"
        label = f"{v['source']} data, {v['strategy']}"
        # Lab numbers are one simulated run, so they carry one severity step less weight.
        sev = (lambda poor: ("high" if poor else "medium")) if real else (lambda poor: ("medium" if poor else "low"))
        r = v.get("ratings", {})
        if r.get("lcp_ms") in ("poor", "needs improvement"):
            findings.append(Finding("cwv_lcp", sev(r["lcp_ms"] == "poor"), "Largest Contentful Paint is slow", f"LCP {v['lcp_ms'] / 1000:.1f} s at the 75th percentile ({label}); good is 2.5 s or less.", f"For {who}, the main content takes this long to appear. LCP is one of Google's Core Web Vitals.", "Serve the hero image or heading faster: compress and preload the LCP image, cut render-blocking CSS and scripts, and cache the HTML at the edge.", "The page looks ready sooner, and the page moves toward Google's good threshold."))
        if r.get("inp_ms") in ("poor", "needs improvement"):
            findings.append(Finding("cwv_inp", sev(r["inp_ms"] == "poor"), "Interaction to Next Paint is slow", f"INP {v['inp_ms']} ms at the 75th percentile ({label}); good is 200 ms or less.", "Taps and clicks take visibly long to respond for real visitors. INP is one of Google's Core Web Vitals.", "Break up long JavaScript tasks, defer third-party scripts, and avoid heavy work in input handlers.", "Interactions feel immediate."))
        if r.get("cls") in ("poor", "needs improvement"):
            findings.append(Finding("cwv_cls", sev(r["cls"] == "poor"), "Layout shifts while the page loads", f"CLS {v['cls']} ({label}); good is 0.1 or less.", f"Content moves under {who} as images, fonts, or embeds arrive. CLS is one of Google's Core Web Vitals.", "Set width and height on images and embeds, reserve space for ads and banners, and use font-display with matched fallback fonts.", "A stable page that does not jump while loading."))
        if not real and r.get("tbt_ms") in ("poor", "needs improvement"):
            findings.append(Finding("cwv_tbt", sev(r["tbt_ms"] == "poor"), "Main thread is blocked during load", f"Total Blocking Time {v['tbt_ms']} ms in the lab run; good is 200 ms or less.", "Long JavaScript tasks block input while the page loads. It is the lab stand-in for INP.", "Split and defer JavaScript, and remove unused third-party scripts.", "The page responds to input sooner."))
