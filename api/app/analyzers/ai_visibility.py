"""AI visibility: can AI search and answer engines read and cite this site?

Four checks, all from public files, no paid data:
  - robots.txt rules for the crawlers AI products use, split into answer /
    search crawlers (which fetch pages to cite them in answers) and training
    crawlers (which collect data for model training). Blocking training
    crawlers is a legitimate choice and is reported, not penalised. Blocking
    answer crawlers removes the site from those products' answers.
  - llms.txt, an emerging convention for a plain-language site summary. Few
    systems read it yet, so a missing file is a low finding.
  - JSON-LD structured data, which answer engines use to identify who and
    what a page is about.
  - Whether the page's text exists in the HTML, since most AI crawlers do not
    execute JavaScript.
"""
from __future__ import annotations

import copy
import json
from urllib.parse import urljoin

from ..services.fetcher import FetchError, fetch
from .base import Analyzer, AnalyzerResult, Finding, PageContext

# Crawlers that fetch pages so an AI product can cite them in answers.
ANSWER_CRAWLERS = {
    "OAI-SearchBot": "ChatGPT search",
    "ChatGPT-User": "ChatGPT browsing",
    "PerplexityBot": "Perplexity",
    "Claude-SearchBot": "Claude search",
    "Claude-User": "Claude browsing",
}
# Crawlers that collect training data. Blocking them does not remove a site from answers.
TRAINING_CRAWLERS = {
    "GPTBot": "OpenAI training",
    "ClaudeBot": "Anthropic training",
    "Google-Extended": "Google AI training",
    "CCBot": "Common Crawl",
    "Applebot-Extended": "Apple AI training",
}


def parse_robots_groups(text: str) -> list[tuple[list[str], list[tuple[str, str]]]]:
    """Split robots.txt into groups: consecutive user-agent lines share the
    rules that follow them, as the robots exclusion standard specifies."""
    groups: list[tuple[list[str], list[tuple[str, str]]]] = []
    agents: list[str] = []
    rules: list[tuple[str, str]] = []
    in_rules = False
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            if in_rules:
                groups.append((agents, rules))
                agents, rules, in_rules = [], [], False
            agents.append(value.lower())
        elif key in ("allow", "disallow"):
            in_rules = True
            rules.append((key, value))
    if agents:
        groups.append((agents, rules))
    return groups


def is_blocked(groups, agent: str) -> bool:
    """True when the group that applies to `agent` disallows the site root.
    A specific group replaces the wildcard group entirely."""
    name = agent.lower()
    specific = [rules for agents, rules in groups if name in agents]
    applicable = specific or [rules for agents, rules in groups if "*" in agents]
    for rules in applicable:
        disallow_root = any(k == "disallow" and v == "/" for k, v in rules)
        allow_root = any(k == "allow" and v == "/" for k, v in rules)
        if disallow_root and not allow_root:
            return True
    return False


class AIVisibilityAnalyzer(Analyzer):
    category = "ai"

    def __init__(self, check_remote: bool = True, fetcher=fetch):
        self.check_remote = check_remote
        self.fetcher = fetcher

    def run(self, ctx: PageContext) -> AnalyzerResult:
        findings: list[Finding] = []
        base = f"{ctx.scheme}://{ctx.host}/"

        robots_text = None
        llms_state = "not checked"
        if self.check_remote:
            robots_text = self._text(urljoin(base, "/robots.txt"))
            llms = self._text(urljoin(base, "/llms.txt"))
            llms_state = "present" if llms and llms.strip() and not llms.lstrip().lower().startswith("<!doctype") else "missing"

        groups = parse_robots_groups(robots_text or "")
        blocked_answer = [f"{ua} ({label})" for ua, label in ANSWER_CRAWLERS.items() if is_blocked(groups, ua)]
        blocked_training = [f"{ua} ({label})" for ua, label in TRAINING_CRAWLERS.items() if is_blocked(groups, ua)]

        types, invalid_blocks = self._structured_data(ctx)
        text_soup = copy.copy(ctx.soup)
        for t in text_soup(["script", "style", "noscript", "template"]):
            t.decompose()
        words = len((text_soup.body or text_soup).get_text(" ", strip=True).split())
        scripts = len(ctx.soup.find_all("script", src=True))

        metrics = {
            "robots_txt": "not checked" if not self.check_remote else ("present" if robots_text is not None else "missing"),
            "answer_crawlers_blocked": blocked_answer,
            "training_crawlers_blocked": blocked_training,
            "llms_txt": llms_state,
            "structured_data_types": types,
            "structured_data_invalid_blocks": invalid_blocks,
            "html_text_words": words,
            "note": "Reads robots.txt, llms.txt, JSON-LD, and the HTML text. Does not query any AI product, so it reports whether AI crawlers can read the site, not whether any answer mentions it.",
        }

        if blocked_answer:
            findings.append(Finding(
                "ai_answer_crawlers_blocked", "high" if len(blocked_answer) >= 3 else "medium",
                "robots.txt blocks AI answer crawlers",
                f"Blocked: {', '.join(blocked_answer)}.",
                "These crawlers fetch pages so AI assistants can cite them. A blocked site cannot appear as a source in those answers.",
                "Allow the answer crawlers you want to be cited by. Training crawlers can stay blocked separately.",
                "The site becomes eligible as a cited source in AI search answers.",
            ))
        if not types and not invalid_blocks:
            findings.append(Finding(
                "ai_no_structured_data", "medium", "No structured data",
                "No JSON-LD blocks found in the page.",
                "Answer engines and search features use structured data to identify the organisation, person, or product a page describes.",
                "Add JSON-LD for the site owner (Organization or Person) and the page type (WebSite, Article, Product, LocalBusiness).",
                "Clearer entity signals for AI answers and rich results.",
            ))
        if invalid_blocks:
            findings.append(Finding(
                "ai_invalid_structured_data", "medium", "Structured data does not parse",
                f"{invalid_blocks} JSON-LD block(s) are not valid JSON.",
                "Parsers discard invalid blocks entirely, so the markup has no effect.",
                "Validate the JSON-LD and fix the syntax error; a trailing comma is the usual cause.",
                "The structured data is read instead of ignored.",
            ))
        if words < 120 and scripts >= 1:
            findings.append(Finding(
                "ai_content_requires_js", "medium", "Page text may need JavaScript to appear",
                f"Only {words} words of text in the HTML, with {scripts} external scripts.",
                "Most AI crawlers read the HTML without running JavaScript, so text rendered by scripts is invisible to them.",
                "Render the main content on the server or at build time.",
                "AI crawlers can read and quote the page.",
            ))
        if self.check_remote and llms_state == "missing":
            findings.append(Finding(
                "ai_no_llms_txt", "low", "No llms.txt",
                "GET /llms.txt did not return a text file.",
                "llms.txt is an emerging convention for a plain-language summary of a site for language models. Few systems read it yet, so its absence costs little today.",
                "Publish /llms.txt with a one-paragraph description of the site and links to its most important pages.",
                "A ready summary for tools that adopt the convention.",
            ))
        return AnalyzerResult(self.category, findings, metrics)

    def _text(self, url: str) -> str | None:
        try:
            r = self.fetcher(url, timeout=6, max_bytes=200_000)
        except FetchError:
            return None
        if r.status != 200 or "html" in r.headers.get("content-type", ""):
            return None
        return r.text

    @staticmethod
    def _structured_data(ctx: PageContext) -> tuple[list[str], int]:
        types: set[str] = set()
        invalid = 0
        for tag in ctx.soup.find_all("script", attrs={"type": "application/ld+json"}):
            try:
                data = json.loads(tag.string or tag.get_text() or "")
            except (ValueError, TypeError):
                invalid += 1
                continue
            stack = [data]
            while stack:
                node = stack.pop()
                if isinstance(node, list):
                    stack.extend(node)
                elif isinstance(node, dict):
                    t = node.get("@type")
                    if isinstance(t, str):
                        types.add(t)
                    elif isinstance(t, list):
                        types.update(x for x in t if isinstance(x, str))
                    stack.extend(v for v in node.values() if isinstance(v, (dict, list)))
        return sorted(types), invalid
