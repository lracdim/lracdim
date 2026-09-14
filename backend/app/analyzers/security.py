from __future__ import annotations

from .base import Analyzer, AnalyzerResult, Finding, PageContext


class SecurityAnalyzer(Analyzer):
    """Transport and response-header hygiene. This is a header review of the
    home page, not a vulnerability scan."""

    category = "security"

    def run(self, ctx: PageContext) -> AnalyzerResult:
        h = ctx.fetched.headers
        findings: list[Finding] = []
        https = ctx.fetched.https
        hsts = h.get("strict-transport-security", "")
        csp = h.get("content-security-policy", "")
        xcto = h.get("x-content-type-options", "").lower()
        xfo = h.get("x-frame-options", "")
        referrer = h.get("referrer-policy", "")
        permissions = h.get("permissions-policy", "")
        server = h.get("server", "")
        powered = h.get("x-powered-by", "")
        mixed = [t.get("src") for t in ctx.soup.find_all(["script", "img", "iframe"], src=True) if str(t.get("src")).startswith("http://")] if https else []
        forms_http = [f for f in ctx.soup.find_all("form", action=True) if str(f.get("action")).startswith("http://")]

        metrics = {
            "https": https,
            "hsts": bool(hsts),
            "csp": bool(csp),
            "x_content_type_options": xcto == "nosniff",
            "x_frame_options": xfo or None,
            "referrer_policy": referrer or None,
            "permissions_policy": bool(permissions),
            "server_header": server or None,
            "x_powered_by": powered or None,
            "mixed_content": len(mixed),
            "note": "Header review of the home page response. Not a vulnerability scan.",
        }

        if not https:
            findings.append(Finding("sec_no_https", "critical", "No HTTPS", "The page is served over plain http.", "Traffic can be read and altered in transit; browsers warn visitors.", "Serve everything over HTTPS and redirect http.", "Encrypted, trusted connections."))
        else:
            if not hsts:
                findings.append(Finding("no_hsts", "medium", "No HTTP Strict Transport Security", "No Strict-Transport-Security header.", "First visits and downgraded links can still be sent over http.", "Add Strict-Transport-Security: max-age=31536000; includeSubDomains.", "Browsers refuse insecure connections to the site."))
        if not csp:
            findings.append(Finding("no_csp", "medium", "No Content Security Policy", "No Content-Security-Policy header.", "Injected scripts run with full access to the page.", "Add a policy, starting with default-src 'self' and a report-only phase.", "Injected content is blocked or reported."))
        if xcto != "nosniff":
            findings.append(Finding("no_nosniff", "low", "No X-Content-Type-Options", "Header missing or not nosniff.", "Browsers may guess a file type and execute what should be inert.", "Add X-Content-Type-Options: nosniff.", "Files are treated as declared."))
        if not xfo and "frame-ancestors" not in csp:
            findings.append(Finding("no_framing_protection", "medium", "Page can be framed by other sites", "No X-Frame-Options and no frame-ancestors directive.", "The page can be embedded in a hostile page for click-jacking.", "Add X-Frame-Options: SAMEORIGIN or a frame-ancestors directive.", "The page cannot be framed elsewhere."))
        if not referrer:
            findings.append(Finding("no_referrer_policy", "low", "No Referrer-Policy", "Header missing.", "Full URLs, including query strings, leak to other sites in the Referer header.", "Add Referrer-Policy: strict-origin-when-cross-origin.", "Less information leaks on outbound links."))
        if powered or (server and any(ch.isdigit() for ch in server)):
            findings.append(Finding("version_disclosure", "low", "Server software disclosed", f"Server: {server or '-'}; X-Powered-By: {powered or '-'}", "Version strings help attackers pick known exploits.", "Remove X-Powered-By and hide the Server version.", "Less reconnaissance information."))
        if mixed:
            findings.append(Finding("mixed_content", "high", "Mixed content", f"{len(mixed)} resources load over http on an https page, e.g. {mixed[0]}", "Browsers block or warn on these resources.", "Load every resource over https.", "No mixed-content warnings or blocked assets."))
        if forms_http:
            findings.append(Finding("insecure_form", "high", "Form posts over http", f"{len(forms_http)} forms submit to an http address.", "Submitted data travels unencrypted.", "Point form actions at https endpoints.", "Form data is protected in transit."))
        return AnalyzerResult(self.category, findings, metrics)
