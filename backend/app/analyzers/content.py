from __future__ import annotations

import re

from .base import Analyzer, AnalyzerResult, Finding, PageContext


class ContentAnalyzer(Analyzer):
    category = "content"

    def run(self, ctx: PageContext) -> AnalyzerResult:
        soup = ctx.soup
        for t in soup(["script", "style", "noscript", "template"]):
            t.decompose()
        body = soup.body or soup
        text = re.sub(r"\s+", " ", body.get_text(" ", strip=True))
        words = text.split()
        word_count = len(words)
        html_len = max(1, len(ctx.fetched.body))
        ratio = round(len(text) / html_len, 3)
        headings = {f"h{i}": len(soup.find_all(f"h{i}")) for i in range(1, 7)}
        paragraphs = soup.find_all("p")
        long_paras = [p for p in paragraphs if len(p.get_text(" ", strip=True).split()) > 150]
        sentences = [s for s in re.split(r"[.!?]+\s", text) if s.strip()]
        avg_sentence = round(word_count / max(1, len(sentences)), 1)
        placeholder = bool(re.search(r"lorem ipsum|coming soon|under construction", text, re.I))
        lists = len(soup.find_all(["ul", "ol"]))
        metrics = {
            "word_count": word_count,
            "text_to_html_ratio": ratio,
            "headings": headings,
            "paragraphs": len(paragraphs),
            "long_paragraphs": len(long_paras),
            "avg_sentence_words": avg_sentence,
            "lists": lists,
            "placeholder_text": placeholder,
        }
        findings: list[Finding] = []
        if word_count < 120:
            findings.append(Finding("thin_content", "high", "Very little text content", f"{word_count} words of visible text.", "Search engines and visitors have almost nothing to evaluate the page by.", "Write the page: what it is, who it is for, what to do next.", "The page can rank and convert on its own merits."))
        elif word_count < 300:
            findings.append(Finding("light_content", "medium", "Light text content", f"{word_count} words of visible text.", "Short pages compete poorly for informational searches.", "Expand the page with specific, useful detail.", "More queries the page can answer."))
        if ratio < 0.08 and word_count > 0:
            findings.append(Finding("low_text_ratio", "low", "Low text-to-markup ratio", f"Visible text is {ratio:.0%} of the document.", "Most of the download is markup and code rather than content.", "Trim wrappers and inline code; keep content in the document.", "Leaner page for the same content."))
        if sum(headings.values()) == 0 and word_count > 200:
            findings.append(Finding("no_headings", "medium", "No headings", "No h1 to h6 elements.", "Long text without structure is hard to scan and to outline.", "Break content into sections with headings.", "Scannable, navigable content."))
        if long_paras:
            findings.append(Finding("long_paragraphs", "low", "Very long paragraphs", f"{len(long_paras)} paragraphs exceed 150 words.", "Dense blocks are skipped on screens.", "Split paragraphs; use lists where the content is a list.", "Higher reading completion."))
        if placeholder:
            findings.append(Finding("placeholder_text", "high", "Placeholder text is live", "Text such as lorem ipsum, coming soon, or under construction was found.", "The page publishes unfinished content.", "Replace placeholders or unpublish the page.", "No unfinished content in production."))
        return AnalyzerResult(self.category, findings, metrics)
