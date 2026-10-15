"""CMS routes: list, read, create, update, delete content, and add images.

Every route is admin-only. Writes go through the configured adapter: the
local one edits the working tree, the GitHub one opens a pull request. The
API never commits to the production branch itself.

These handlers are async and push the blocking file and network work to a
worker thread. That is deliberate: in Litestar 2.24, three or more sync
handlers (`sync_to_thread=True`) sharing one path corrupt the first one's
response, which this module hit with GET, PUT, and DELETE on
/api/cms/{type}/{slug}. test_cms.py pins the behaviour.
"""
from __future__ import annotations

import base64
import binascii
from collections.abc import Callable
from typing import TypeVar

from anyio.to_thread import run_sync
from litestar import delete, get, post, put

from ..cms import ContentError, Document, get_adapter
from ..cms.adapters import CONTENT_TYPES
from ..core.security import ApiError, require_admin
from ..schemas.cms import ContentDetail, ContentIn, ContentSummary, ContentUpdateIn, ImageIn, WriteResult


def _adapter():
    return get_adapter()


T = TypeVar("T")


async def _run(call: Callable[[], T]) -> T:
    """Run blocking adapter work off the event loop and turn its errors into
    the API's error envelope, never a stack trace."""
    try:
        return await run_sync(call)
    except ContentError as e:
        raise ApiError(422, "invalid_content", str(e))
    except FileNotFoundError:
        raise ApiError(404, "not_found", "No content with that type and slug.")


@get("/api/cms/types", guards=[require_admin])
async def types() -> dict:
    adapter = _adapter()
    return {"types": list(CONTENT_TYPES), "adapter": adapter.name}


@get("/api/cms/{content_type:str}", guards=[require_admin])
async def list_content(content_type: str) -> list[ContentSummary]:
    docs = await _run(lambda: _adapter().list(content_type))
    return [ContentSummary.model_validate(d.summary()) for d in docs]


@get("/api/cms/{content_type:str}/{slug:str}", guards=[require_admin])
async def get_content(content_type: str, slug: str) -> ContentDetail:
    doc = await _run(lambda: _adapter().get(content_type, slug))
    return ContentDetail.model_validate(doc.detail())


@post("/api/cms/{content_type:str}", status_code=201, guards=[require_admin])
async def create_content(content_type: str, data: ContentIn) -> WriteResult:
    adapter = _adapter()
    try:
        await _run(lambda: adapter.get(content_type, data.slug))
    except ApiError as e:
        if e.status_code != 404:
            raise  # a bad type or slug, not "it does not exist yet"
    else:
        raise ApiError(409, "already_exists", f"{content_type}/{data.slug} already exists.")
    doc = Document(type=content_type, slug=data.slug, front_matter=data.front_matter, body=data.body)
    result = await _run(lambda: adapter.save(doc, data.message or f"Add {content_type}/{data.slug}"))
    return WriteResult.model_validate(result)


@put("/api/cms/{content_type:str}/{slug:str}", guards=[require_admin])
async def update_content(content_type: str, slug: str, data: ContentUpdateIn) -> WriteResult:
    adapter = _adapter()
    existing = await _run(lambda: adapter.get(content_type, slug))
    doc = Document(type=content_type, slug=slug, front_matter=data.front_matter, body=data.body, sha=existing.sha)
    result = await _run(lambda: adapter.save(doc, data.message or f"Update {content_type}/{slug}"))
    return WriteResult.model_validate(result)


@delete("/api/cms/{content_type:str}/{slug:str}", status_code=200, guards=[require_admin])
async def delete_content(content_type: str, slug: str) -> WriteResult:
    result = await _run(lambda: _adapter().delete(content_type, slug, f"Remove {content_type}/{slug}"))
    return WriteResult.model_validate(result)


@post("/api/cms/images", status_code=201, guards=[require_admin])
async def upload_image(data: ImageIn) -> WriteResult:
    try:
        content = base64.b64decode(data.content_base64, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError(422, "invalid_content", "The image content must be base64.")
    if not content:
        raise ApiError(422, "invalid_content", "The image is empty.")
    result = await _run(lambda: _adapter().save_image(data.filename, content, data.message or f"Add image {data.filename}"))
    return WriteResult.model_validate(result)


routes = [types, list_content, get_content, create_content, update_content, delete_content, upload_image]
