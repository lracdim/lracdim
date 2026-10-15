"""CMS request and response schemas."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ContentSummary(BaseModel):
    type: str
    slug: str
    title: str
    status: str
    description: str | None = None
    date: Any = None
    path: str


class ContentDetail(ContentSummary):
    front_matter: dict[str, Any]
    body: str


class ContentIn(BaseModel):
    slug: str = Field(min_length=1, max_length=120)
    front_matter: dict[str, Any] = Field(default_factory=dict)
    body: str = ""
    message: str | None = Field(default=None, max_length=200)


class ContentUpdateIn(BaseModel):
    front_matter: dict[str, Any] = Field(default_factory=dict)
    body: str = ""
    message: str | None = Field(default=None, max_length=200)


class ImageIn(BaseModel):
    """Base64 so the dashboard can post JSON like every other call. The
    adapter writes the bytes and returns the path to put in Markdown."""

    filename: str = Field(min_length=3, max_length=120)
    content_base64: str = Field(min_length=4)
    message: str | None = Field(default=None, max_length=200)


class WriteResult(BaseModel):
    adapter: str
    path: str
    action: str | None = None
    url: str | None = None
    bytes: int | None = None
    committed: bool = False
    branch: str | None = None
    pull_request: dict | None = None
    message: str | None = None
