"""Zoho OAuth and HTTP transport.

Nothing here runs unless ZOHO_ENABLED is true AND credentials are present.
With the flag off, `enabled()` is False and every service in this package
returns a skipped result, so local development and tests never touch Zoho.

Credentials live only in environment variables (see .env.example). They are
never logged: `redact()` is applied to anything that reaches the logger.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from typing import Any

import httpx

from ...core.config import settings

log = logging.getLogger("zoho")

# Zoho is region-partitioned; the data centre decides both hostnames.
DATA_CENTRES = {
    "com": ("https://accounts.zoho.com", "https://www.zohoapis.com"),
    "eu": ("https://accounts.zoho.eu", "https://www.zohoapis.eu"),
    "in": ("https://accounts.zoho.in", "https://www.zohoapis.in"),
    "com.au": ("https://accounts.zoho.com.au", "https://www.zohoapis.com.au"),
    "jp": ("https://accounts.zoho.jp", "https://www.zohoapis.jp"),
    "ca": ("https://accounts.zohocloud.ca", "https://www.zohoapis.ca"),
}

SECRET_KEYS = ("client_secret", "refresh_token", "access_token", "code", "authorization")


def redact(data: Any) -> Any:
    """Recursively replace secret values before anything is logged."""
    if isinstance(data, dict):
        return {k: ("***" if k.lower() in SECRET_KEYS else redact(v)) for k, v in data.items()}
    if isinstance(data, list):
        return [redact(v) for v in data]
    return data


def enabled() -> bool:
    return bool(settings.zoho_enabled and settings.zoho_client_id and settings.zoho_client_secret and settings.zoho_refresh_token)


@dataclass
class ZohoResult:
    """Every service call returns one of these, so callers never branch on
    exceptions to find out whether the integration was even switched on."""

    ok: bool
    skipped: bool = False
    reason: str | None = None
    data: dict | None = None

    @classmethod
    def disabled(cls) -> ZohoResult:
        return cls(ok=True, skipped=True, reason="Zoho integration is disabled.")


class ZohoError(RuntimeError):
    pass


class ZohoClient:
    """Refresh-token grant with a cached access token.

    TODO: the token lives in process memory. With more than one API instance,
    move it to Redis or a small table so instances share one refresh.
    """

    def __init__(self, http: httpx.Client | None = None) -> None:
        self._lock = threading.Lock()
        self._token: str | None = None
        self._expires_at: float = 0.0
        self._http = http

    @property
    def accounts_url(self) -> str:
        return DATA_CENTRES.get(settings.zoho_data_center, DATA_CENTRES["com"])[0]

    @property
    def api_url(self) -> str:
        return DATA_CENTRES.get(settings.zoho_data_center, DATA_CENTRES["com"])[1]

    def _client(self) -> httpx.Client:
        return self._http or httpx.Client(timeout=httpx.Timeout(20, connect=8))

    def access_token(self) -> str:
        if not enabled():
            raise ZohoError("Zoho is disabled or not configured.")
        with self._lock:
            if self._token and time.time() < self._expires_at - 60:
                return self._token
            params = {
                "refresh_token": settings.zoho_refresh_token,
                "client_id": settings.zoho_client_id,
                "client_secret": settings.zoho_client_secret,
                "grant_type": "refresh_token",
            }
            log.info("zoho token refresh: %s", redact({"data_center": settings.zoho_data_center, **params}))
            r = self._client().post(f"{self.accounts_url}/oauth/v2/token", params=params)
            if r.status_code != 200:
                raise ZohoError(f"token refresh returned {r.status_code}")
            body = r.json()
            if "access_token" not in body:
                raise ZohoError(f"token refresh failed: {body.get('error', 'unknown error')}")
            self._token = body["access_token"]
            self._expires_at = time.time() + int(body.get("expires_in", 3600))
            return self._token

    def request(self, method: str, path: str, *, json: dict | None = None, params: dict | None = None) -> dict:
        """One request against a Zoho API. Raises ZohoError; callers wrap it
        into a ZohoResult so a Zoho outage never fails a studio operation."""
        token = self.access_token()
        url = f"{self.api_url}{path}"
        log.info("zoho %s %s params=%s", method, path, redact(params or {}))
        r = self._client().request(method, url, headers={"Authorization": f"Zoho-oauthtoken {token}"}, json=json, params=params)
        if r.status_code >= 400:
            # Body may name the record; log the status only.
            raise ZohoError(f"{method} {path} returned {r.status_code}")
        return r.json() if r.content else {}


client = ZohoClient()
