from __future__ import annotations

from .base import Analyzer, AnalyzerResult, Finding, PageContext

LANDMARKS = ("header", "nav", "main", "footer")


class AccessibilityAnalyzer(Analyzer):
    """Static accessibility checks on the document. Contrast is not measured
    because it requires computed styles; the metrics say so."""

    category = "accessibility"

    def run(self, ctx: PageContext) -> AnalyzerResult:
        soup = ctx.soup
        findings: list[Finding] = []
        imgs = soup.find_all("img")
        missing_alt = [i for i in imgs if i.get("alt") is None]
        inputs = [i for i in soup.find_all(["input", "select", "textarea"]) if (i.get("type") or "").lower() not in ("hidden", "submit", "button", "reset", "image")]
        labelled_ids = {lab.get("for") for lab in soup.find_all("label") if lab.get("for")}
        unlabelled = [i for i in inputs if not (i.get("id") in labelled_ids or i.get("aria-label") or i.get("aria-labelledby") or i.find_parent("label") or i.get("title"))]
        empty_buttons = [b for b in soup.find_all("button") if not (b.get_text(strip=True) or b.get("aria-label") or b.find("img", alt=True))]
        empty_links = [a for a in soup.find_all("a", href=True) if not (a.get_text(strip=True) or a.get("aria-label") or a.find("img", alt=True))]
        landmarks = [t for t in LANDMARKS if soup.find(t) or soup.find(attrs={"role": {"header": "banner", "nav": "navigation", "main": "main", "footer": "contentinfo"}[t]})]
        skip_link = any("skip" in (a.get_text(strip=True) or "").lower() for a in soup.find_all("a", href=lambda h: h and h.startswith("#")))
        html = soup.find("html")
        lang = (html.get("lang") if html else None) or ""
        generic_links = [a for a in soup.find_all("a", href=True) if (a.get_text(strip=True) or "").lower() in ("click here", "read more", "here", "more", "learn more")]

        metrics = {
            "images": len(imgs),
            "images_missing_alt": len(missing_alt),
            "form_controls": len(inputs),
            "unlabelled_controls": len(unlabelled),
            "empty_buttons": len(empty_buttons),
            "empty_links": len(empty_links),
            "landmarks": landmarks,
            "skip_link": skip_link,
            "lang": lang,
            "generic_link_text": len(generic_links),
            "note": "Static checks only. Colour contrast and keyboard behaviour need a rendered page and are not measured.",
        }

        if missing_alt:
            findings.append(Finding("a11y_missing_alt", "high" if len(missing_alt) > 3 else "medium", "Images with no alt attribute", f"{len(missing_alt)} of {len(imgs)} images have no alt attribute at all.", "Screen readers announce the file name or nothing.", "Add alt text, or alt=\"\" for purely decorative images.", "Images become meaningful to non-visual users."))
        if unlabelled:
            findings.append(Finding("unlabelled_controls", "high", "Form controls without labels", f"{len(unlabelled)} of {len(inputs)} inputs have no associated label.", "Assistive technology cannot say what the field is for.", "Add a <label for> or aria-label to each control.", "Forms become usable with a screen reader."))
        if empty_buttons:
            findings.append(Finding("empty_buttons", "medium", "Buttons with no accessible name", f"{len(empty_buttons)} buttons contain no text or aria-label.", "Icon-only buttons are announced as just \"button\".", "Add visually hidden text or an aria-label.", "Every control is announced by purpose."))
        if empty_links:
            findings.append(Finding("empty_links", "medium", "Links with no accessible name", f"{len(empty_links)} links contain no text or labelled image.", "The link is announced without a destination.", "Add link text or an aria-label.", "Links make sense out of context."))
        missing_landmarks = [t for t in LANDMARKS if t not in landmarks]
        if len(missing_landmarks) >= 2:
            findings.append(Finding("few_landmarks", "medium", "Missing page landmarks", f"Missing: {', '.join(missing_landmarks)}.", "Landmarks let keyboard and screen-reader users jump between regions.", "Wrap regions in header, nav, main, and footer elements.", "Direct navigation to content."))
        if not lang:
            findings.append(Finding("a11y_no_lang", "medium", "No document language", "The <html> element has no lang attribute.", "Screen readers may read the page with the wrong pronunciation rules.", "Add lang to the <html> element.", "Correct speech output."))
        if len(generic_links) > 3:
            findings.append(Finding("generic_links", "low", "Generic link text", f"{len(generic_links)} links read \"click here\", \"read more\", or similar.", "Link lists in screen readers lose all meaning.", "Make link text describe the destination.", "Links are understandable in isolation."))
        return AnalyzerResult(self.category, findings, metrics)
