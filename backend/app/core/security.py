"""Rate limiting and admin-key checks.

The limiter is a fixed-window counter keyed by client IP and bucket. It is
in-process by default and backed by Redis when REDIS_URL is set, so several
API instances share one budget."""
from __future__ import annotations

import threading
import time

from fastapi import Header, HTTPException, Request

from .config import settings


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
            raise HTTPException(status_code=429, detail={"code": "rate_limited", "message": "Too many requests. Try again later."})


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(bucket: str, spec: str):
    async def dependency(request: Request) -> None:
        limiter.check(f"{bucket}:{client_ip(request)}", spec)

    return dependency


async def require_admin(x_admin_key: str = Header(default="")) -> None:
    if not settings.admin_key or x_admin_key != settings.admin_key:
        raise HTTPException(status_code=401, detail={"code": "unauthorized", "message": "An admin key is required."})
