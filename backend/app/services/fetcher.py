"""Safe HTTP fetching. One place enforces: SSRF policy on the first request
and on every redirect, a response-size ceiling, a timeout, a bounded
redirect chain, and an honest User-Agent."""
from __future__ import annotations

import time
from dataclasses import dataclass, field

import httpx

from ..core.config import settings
from ..core.ssrf import UnsafeURL, validate

USER_AGENT = "LRACDIMENSION-Vector/1.0 (+https://lracdimension.vercel.app/vector/)"


class FetchError(Exception):
    """User-presentable fetch failure. `reason` is safe to display."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass
class Fetched:
    url: str
    final_url: str
    status: int
    headers: dict[str, str]
    body: bytes
    elapsed_ms: int
    redirects: list[dict] = field(default_factory=list)
    truncated: bool = False
    https: bool = False

    @property
    def text(self) -> str:
        for enc in ("utf-8", "latin-1"):
            try:
                return self.body.decode(enc)
            except UnicodeDecodeError:
                continue
        return self.body.decode("utf-8", errors="replace")


def _read_limited(resp: httpx.Response, limit: int) -> tuple[bytes, bool]:
    chunks: list[bytes] = []
    size = 0
    for chunk in resp.iter_bytes():
        chunks.append(chunk)
        size += len(chunk)
        if size > limit:
            return b"".join(chunks)[:limit], True
    return b"".join(chunks), False


def fetch(url: str, *, method: str = "GET", max_redirects: int = 5, timeout: float | None = None, max_bytes: int | None = None) -> Fetched:
    """Fetch a public URL. Redirects are followed manually so each hop is
    re-validated against the SSRF policy."""
    timeout = timeout or settings.fetch_timeout_seconds
    max_bytes = max_bytes or settings.fetch_max_bytes
    target = validate(url)
    current = target.url
    redirects: list[dict] = []
    started = time.perf_counter()

    with httpx.Client(follow_redirects=False, timeout=httpx.Timeout(timeout, connect=min(timeout, 8)), headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}) as client:
        for _ in range(max_redirects + 1):
            try:
                with client.stream(method, current) as resp:
                    if resp.is_redirect and resp.headers.get("location"):
                        location = str(resp.next_request.url) if resp.next_request else resp.headers["location"]
                        redirects.append({"from": current, "to": location, "status": resp.status_code})
                        try:
                            current = validate(location).url
                        except UnsafeURL as e:
                            raise FetchError(f"A redirect pointed at an address that cannot be examined ({e}).")
                        continue
                    body, truncated = _read_limited(resp, max_bytes) if method == "GET" else (b"", False)
                    elapsed = int((time.perf_counter() - started) * 1000)
                    return Fetched(
                        url=target.url,
                        final_url=current,
                        status=resp.status_code,
                        headers={k.lower(): v for k, v in resp.headers.items()},
                        body=body,
                        elapsed_ms=elapsed,
                        redirects=redirects,
                        truncated=truncated,
                        https=current.startswith("https://"),
                    )
            except httpx.ConnectTimeout:
                raise FetchError("The connection timed out before the server answered.")
            except httpx.ReadTimeout:
                raise FetchError("The server started answering but did not finish in time.")
            except httpx.ConnectError:
                raise FetchError("The server could not be reached.")
            except httpx.TooManyRedirects:
                raise FetchError("The address redirects too many times.")
            except httpx.HTTPError as e:  # pragma: no cover - other transport errors
                raise FetchError(f"The request failed ({e.__class__.__name__}).")
    raise FetchError("The address redirects too many times.")


def head_or_get(url: str, timeout: float = 8) -> tuple[int | None, str | None, list[dict]]:
    """Cheap link check: HEAD, falling back to GET without a body read.
    Returns (status, final_url, redirects) or (None, None, []) on failure."""
    try:
        r = fetch(url, method="HEAD", timeout=timeout, max_bytes=1)
        if r.status in (405, 403, 501):
            r = fetch(url, method="GET", timeout=timeout, max_bytes=1024)
        return r.status, r.final_url, r.redirects
    except (FetchError, UnsafeURL):
        return None, None, []
