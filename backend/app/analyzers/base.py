"""Shared analyzer contract.

Each analyzer receives a PageContext (the fetched document, parsed once) and
returns an AnalyzerResult: a category, a list of Findings, and metrics. The
score is NOT computed here; the scoring engine derives it from findings so
the methodology lives in one documented place."""
from __future__ import annotations

from dataclasses import dataclass, field
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

from ..services.fetcher import Fetched

SEVERITIES = ("critical", "high", "medium", "low")


@dataclass
class Finding:
    code: str
    severity: str
    title: str
    evidence: str
    explanation: str
    recommendation: str
    impact: str

    def __post_init__(self) -> None:
        if self.severity not in SEVERITIES:
            raise ValueError(f"bad severity {self.severity}")


@dataclass
class AnalyzerResult:
    category: str
    findings: list[Finding] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)


@dataclass
class PageContext:
    fetched: Fetched
    soup: BeautifulSoup
    host: str
    scheme: str

    @classmethod
    def from_fetched(cls, fetched: Fetched) -> "PageContext":
        parts = urlsplit(fetched.final_url)
        return cls(fetched=fetched, soup=BeautifulSoup(fetched.text, "lxml"), host=(parts.hostname or "").lower(), scheme=parts.scheme)

    def is_internal(self, href: str) -> bool:
        parts = urlsplit(href)
        return not parts.netloc or (parts.hostname or "").lower().lstrip("www.") == self.host.lstrip("www.")


class Analyzer:
    category: str = "base"

    def run(self, ctx: PageContext) -> AnalyzerResult:  # pragma: no cover - abstract
        raise NotImplementedError
