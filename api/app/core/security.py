"""Rate limiting, admin-key checks, and the API's error type.

The limiter is a fixed-window counter keyed by client IP and bucket. It is
in-process by default and backed by Redis when REDIS_URL is set, so several
API instances share one budget.

Both checks are Litestar guards: they run before the handler and raise
ApiError, which the app renders as {"error": {code, message}}.
"""
from __future__ import annotations

import threading
import time
from typing import Any

from litestar.connection import ASGIConnection
from litestar.exceptions import HTTPException
from litestar.handlers.base import BaseRouteHandler

from .config import settings


class ApiError(HTTPException):
    """Every error the API returns carries a machine-readable code and a
    sentence a person can act on."""

    def __init__(self, status_code: int, code: str, message: str, fields: list[dict] | None = None) -> None:
        detail: dict[str, Any] = {"code": code, "message": message}
        if fields:
            detail["fields"] = fields
        super().__init__(status_code=status_code, detail=message, extra=detail)
        self.envelope = detail


def _parse(spec: str) -> tuple[int, int]:
    count, _, window = spec.partition("/")
    seconds = {"minute": 60, "hour": 3600, "day": 86400}.get(window.strip(), 3600)
    return max(1, int(count)), seconds


class RateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._hits: dict[str, tuple[int, float]] = {}
        self._redis = None
        if settings.redis_url:
            try:
                import redis

                self._redis = redis.Redis.from_url(settings.redis_url)
                self._redis.ping()
            except Exception:  # pragma: no cover - depends on environment
                self._redis = None

    def check(self, key: str, spec: str) -> None:
        limit, window = _parse(spec)
        now = time.time()
        bucket = f"rl:{key}:{int(now // window)}"
        if self._redis is not None:
            count = self._redis.incr(bucket)
            if count == 1:
                self._redis.expire(bucket, window)
        else:
            with self._lock:
                count, expires = self._hits.get(bucket, (0, now + window))
                count += 1
                self._hits[bucket] = (count, expires)
                if len(self._hits) > 5000:
                    self._hits = {k: v for k, v in self._hits.items() if v[1] > now}
        if count > limit:
            raise ApiError(429, "rate_limited", "Too many requests. Try again later.")


limiter = RateLimiter()


def client_ip(connection: ASGIConnection) -> str:
    forwarded = connection.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return connection.client.host if connection.client else "unknown"


def rate_limit(bucket: str, spec: str):
    """Returns a guard that counts one hit per request against `bucket`."""

    def guard(connection: ASGIConnection, _: BaseRouteHandler) -> None:
        limiter.check(f"{bucket}:{client_ip(connection)}", spec)

    return guard


def require_admin(connection: ASGIConnection, _: BaseRouteHandler) -> None:
    """TODO: temporary authentication. A shared admin key is enough while the
    dashboard is local; replace with signed sessions and per-user roles before
    the client area is exposed publicly."""
    key = connection.headers.get("x-admin-key", "")
    if not settings.admin_key or key != settings.admin_key:
        raise ApiError(401, "unauthorized", "An admin key is required.")
