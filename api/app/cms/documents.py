"""Content documents: Markdown with YAML front matter.

A document is identified by its type and slug, which is also its path:
    content/<type>/<slug>.md

Parsing and serialising live here so both adapters agree on the format, and
so the dashboard never has to assemble front matter by hand.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

import yaml

CONTENT_TYPES = ("pages", "projects", "services", "blog")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
FRONT_MATTER_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n?(.*)\Z", re.S)


class ContentError(ValueError):
    """Bad type, bad slug, or unreadable front matter."""


def check_type(content_type: str) -> str:
    if content_type not in CONTENT_TYPES:
        raise ContentError(f"Content type must be one of: {', '.join(CONTENT_TYPES)}.")
    return content_type


def check_slug(slug: str) -> str:
    """Slugs become file paths and URLs, so they are deliberately strict:
    lowercase words joined by single hyphens. This also blocks traversal."""
    if not SLUG_RE.match(slug or ""):
        raise ContentError("A slug is lowercase letters, numbers, and single hyphens, for example my-first-post.")
    if len(slug) > 120:
        raise ContentError("A slug is at most 120 characters.")
    return slug


@dataclass
class Document:
    type: str
    slug: str
    front_matter: dict[str, Any] = field(default_factory=dict)
    body: str = ""
    sha: str | None = None  # GitHub blob sha, when the adapter knows it

    @property
    def path(self) -> str:
        return f"content/{self.type}/{self.slug}.md"

    @property
    def title(self) -> str:
        return str(self.front_matter.get("title") or self.slug)

    @property
    def status(self) -> str:
        """Drafts are front matter, not a separate folder: `draft: true` keeps
        a document out of the published site."""
        return "draft" if self.front_matter.get("draft") else "published"

    def to_markdown(self) -> str:
        return serialise(self.front_matter, self.body)

    def summary(self) -> dict:
        return {
            "type": self.type,
            "slug": self.slug,
            "title": self.title,
            "status": self.status,
            "description": self.front_matter.get("description"),
            "date": _as_text(self.front_matter.get("date")),
            "path": self.path,
        }

    def detail(self) -> dict:
        return {**self.summary(), "front_matter": {k: _as_text(v) for k, v in self.front_matter.items()}, "body": self.body}


def _as_text(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return [_as_text(v) for v in value]
    return value


def parse(content_type: str, slug: str, raw: str, sha: str | None = None) -> Document:
    match = FRONT_MATTER_RE.match(raw.lstrip("﻿"))
    if not match:
        return Document(type=content_type, slug=slug, front_matter={}, body=raw, sha=sha)
    try:
        data = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError as e:
        raise ContentError(f"The front matter in {slug}.md is not valid YAML: {e}") from e
    if not isinstance(data, dict):
        raise ContentError(f"The front matter in {slug}.md must be a mapping of keys to values.")
    return Document(type=content_type, slug=slug, front_matter=data, body=match.group(2), sha=sha)


def serialise(front_matter: dict[str, Any], body: str) -> str:
    """Front matter first, then the body, with exactly one blank line between
    them: the same shape a person writing the file by hand would produce."""
    clean = {k: v for k, v in (front_matter or {}).items() if v is not None}
    yaml_text = yaml.safe_dump(clean, sort_keys=False, allow_unicode=True, default_flow_style=False).strip()
    body_text = (body or "").strip("\n")
    return f"---\n{yaml_text}\n---\n\n{body_text}\n" if body_text else f"---\n{yaml_text}\n---\n"
