"""LRACDIMENSION API (Litestar).

Public engine: Vector (audits), Signal (monitoring), Forge (server tools),
Contact (intake). Studio: the delivery workflow behind the dashboard, and the
Git-backed CMS. The marketing site is served separately by Eleventy.

Every error response has the same shape: {"error": {"code", "message"}}.
"""
from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from litestar import Litestar, MediaType, Request, Response, get
from litestar.config.cors import CORSConfig
from litestar.exceptions import HTTPException, ValidationException

from .core.config import settings
from .core.security import ApiError
from .routes import cms, contact, forge, signal, studio, vector
from .workers import scheduler
from .workers.queue import queue

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("api")

MAX_BODY = 64 * 1024


@get("/api/health", sync_to_thread=False)
def health() -> dict:
    return {"ok": True, "queue": queue.backend, "database": "sqlite" if settings.is_sqlite else "postgresql"}


def error_response(status_code: int, code: str, message: str, **extra) -> Response:
    return Response({"error": {"code": code, "message": message, **extra}}, status_code=status_code, media_type=MediaType.JSON)


def handle_api_error(request: Request, exc: ApiError) -> Response:
    envelope = dict(exc.envelope)
    return error_response(exc.status_code, envelope.pop("code"), envelope.pop("message"), **envelope)


def handle_http_error(request: Request, exc: HTTPException) -> Response:
    detail = exc.extra if isinstance(exc.extra, dict) and "code" in exc.extra else {"code": "error", "message": exc.detail}
    return error_response(exc.status_code, detail.get("code", "error"), detail.get("message", exc.detail))


def handle_validation_error(request: Request, exc: ValidationException) -> Response:
    """Pydantic and Litestar both report a list of field errors; the first one
    becomes the message so a form can show something useful immediately."""
    raw = exc.extra if isinstance(exc.extra, list) else []
    fields = []
    for item in raw:
        if isinstance(item, dict):
            key = str(item.get("key") or ".".join(str(p) for p in item.get("loc", []) if p != "body"))
            fields.append({"field": key, "message": item.get("message") or item.get("msg") or "invalid"})
    message = f"{fields[0]['field']}: {fields[0]['message']}" if fields else (exc.detail or "Invalid request.")
    # 422, not Litestar's default 400: the published API has always used 422 for
    # a well-formed request whose values fail validation.
    return error_response(422, "validation", message, fields=fields)


def handle_unexpected(request: Request, exc: Exception) -> Response:
    log.exception("unhandled error on %s %s", request.method, request.url.path)
    return error_response(500, "internal", "Something went wrong on our side. It has been logged.")


@asynccontextmanager
async def lifespan(app: Litestar) -> AsyncGenerator[None, None]:
    scheduler.start()
    log.info("queue backend: %s · db: %s", queue.backend, "sqlite" if settings.is_sqlite else "postgresql")
    yield
    scheduler.stop()


class BodyLimit:
    """Reject oversized bodies before they are read. Litestar versions differ
    in where this setting lives, so the check stays explicit here."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] == "http":
            length = dict((k.decode().lower(), v.decode()) for k, v in scope.get("headers", [])).get("content-length")
            if length and length.isdigit() and int(length) > MAX_BODY:
                body = json.dumps({"error": {"code": "too_large", "message": "Request body is too large."}}).encode()
                await send({"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
                await send({"type": "http.response.body", "body": body})
                return
        await self.app(scope, receive, send)


def security_headers(response: Response) -> Response:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


app = Litestar(
    route_handlers=[health, *vector.routes, *signal.routes, *forge.routes, *contact.routes, *studio.routes, *cms.routes],
    cors_config=CORSConfig(
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Content-Type", "X-Admin-Key"],
        max_age=600,
    ),
    middleware=[BodyLimit],
    after_request=security_headers,
    exception_handlers={
        ApiError: handle_api_error,
        ValidationException: handle_validation_error,
        HTTPException: handle_http_error,
        Exception: handle_unexpected,
    },
    lifespan=[lifespan],
    debug=False,
)
