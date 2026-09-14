from __future__ import annotations

from .base import Analyzer, AnalyzerResult, Finding, PageContext


class TechnicalAnalyzer(Analyzer):
    category = "technical"

    def run(self, ctx: PageContext) -> AnalyzerResult:
        f = ctx.fetched
        soup = ctx.soup
        findings: list[Finding] = []
        html = soup.find("html")
        lang = (html.get("lang") if html else None) or ""
        viewport = soup.find("meta", attrs={"name": "viewport"})
        canonical = soup.find("link", rel=lambda v: v and "canonical" in v)
        doctype = ctx.fetched.text.lstrip()[:15].lower().startswith("<!doctype")
        h1s = soup.find_all("h1")
        headings = [int(t.name[1]) for t in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"])]
        skips = sum(1 for a, b in zip(headings, headings[1:]) if b - a > 1)
        content_type = f.headers.get("content-type", "")

        metrics = {
            "status": f.status,
            "final_url": f.final_url,
            "redirect_count": len(f.redirects),
            "https": f.https,
            "content_type": content_type,
            "doctype": doctype,
            "lang": lang,
            "viewport": bool(viewport),
            "canonical": canonical.get("href") if canonical else None,
            "h1_count": len(h1s),
            "heading_skips": skips,
            "truncated": f.truncated,
        }

        if f.status >= 500:
            findings.append(Finding("http_5xx", "critical", "Server error on the home page", f"The server answered {f.status}.", "Visitors and crawlers receive an error instead of the page.", "Check application logs and hosting status; fix the failing request.", "The page becomes reachable again."))
        elif f.status >= 400:
            findings.append(Finding("http_4xx", "critical", "Home page returns an error status", f"The server answered {f.status}.", "Search engines drop pages that return client errors.", "Make sure the address serves a 200 response.", "The page can be indexed and visited."))
        if len(f.redirects) > 2:
            findings.append(Finding("redirect_chain", "medium", "Long redirect chain", f"{len(f.redirects)} redirects before the final page: " + " → ".join(r["to"] for r in f.redirects), "Each hop adds a round trip and dilutes link signals.", "Point links and DNS at the final address directly.", "Faster first load and cleaner link equity."))
        if not f.https:
            findings.append(Finding("no_https", "critical", "Page is served without HTTPS", f"Final address: {f.final_url}", "Browsers flag the page as not secure and search engines prefer HTTPS.", "Install a certificate and redirect all http traffic to https.", "Secure padlock, no warnings, ranking parity restored."))
        if "text/html" not in content_type:
            findings.append(Finding("content_type", "high", "Response is not HTML", f"Content-Type: {content_type or 'missing'}", "Browsers and crawlers cannot treat the response as a page.", "Serve text/html with a charset.", "The document is parsed as a page."))
        if not doctype:
            findings.append(Finding("no_doctype", "low", "Missing doctype", "The document does not begin with <!DOCTYPE html>.", "Browsers fall back to quirks mode, which changes layout rules.", "Add <!DOCTYPE html> as the first line.", "Consistent standards-mode rendering."))
        if not lang:
            findings.append(Finding("no_lang", "medium", "No document language", "The <html> element has no lang attribute.", "Screen readers and translation tools guess the language.", "Add lang=\"en\" or the correct code to <html>.", "Correct pronunciation and language handling."))
        if not viewport:
            findings.append(Finding("no_viewport", "high", "No viewport meta tag", "No <meta name=\"viewport\"> found.", "Mobile browsers render the page at desktop width and shrink it.", "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.", "Readable mobile layout without zooming."))
        if len(h1s) == 0:
            findings.append(Finding("no_h1", "medium", "No H1 heading", "The page has no <h1>.", "The main topic of the page is not declared to assistive technology or search engines.", "Add one H1 that names the page.", "Clear page topic for readers and crawlers."))
        elif len(h1s) > 1:
            findings.append(Finding("multi_h1", "low", "Multiple H1 headings", f"{len(h1s)} <h1> elements found.", "Several competing headings blur what the page is about.", "Keep one H1; demote the others.", "Cleaner outline."))
        if skips:
            findings.append(Finding("heading_skips", "low", "Heading levels skipped", f"{skips} place(s) where the heading level jumps by more than one.", "Outline navigation in screen readers relies on consecutive levels.", "Use H2 under H1, H3 under H2, and so on.", "Navigable document outline."))
        if f.truncated:
            findings.append(Finding("oversized_document", "medium", "Document exceeds the read limit", f"Only the first {len(f.body):,} bytes were read.", "Very large HTML delays rendering and this examination read only part of it.", "Reduce inline scripts, styles, and markup in the initial document.", "Faster parse and complete examinations."))
        return AnalyzerResult(self.category, findings, metrics)
