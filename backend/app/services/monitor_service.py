"""Signal: scheduled HTTP checks, SSL inspection, status transitions,
threshold rules, and stored events. Notification channels are pluggable."""
from __future__ import annotations

import logging
import socket
import ssl
import time
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.ssrf import UnsafeURL, validate
from ..models import MonitoringTarget, SignalEvent
from .fetcher import USER_AGENT
from .notify import notify

log = logging.getLogger("signal")


def inspect_ssl(host: str, port: int = 443, timeout: float = 6) -> dict:
    ctx = ssl.create_default_context()
    with socket.create_connection((host, port), timeout=timeout) as sock:
        with ctx.wrap_socket(sock, server_hostname=host) as tls:
            cert = tls.getpeercert()
    expires = datetime.strptime(cert["notAfter"], "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
    issuer = ", ".join(v for part in cert.get("issuer", ()) for k, v in part if k in ("organizationName", "commonName"))
    return {"valid": True, "expires_at": expires, "issuer": issuer}


def create_target(db: Session, name: str, raw_url: str) -> MonitoringTarget:
    target = validate(raw_url)  # SSRF policy applies to monitoring too
    row = MonitoringTarget(name=name.strip()[:120], url=target.url, host=target.host)
    db.add(row)
    db.commit()
    db.refresh(row)
    db.add(SignalEvent(target_id=row.id, kind="registered", level="info", message="Target registered"))
    db.commit()
    return row


def _looks_like_bot_challenge(r: httpx.Response) -> bool:
    """Cloudflare and similar edges answer automated clients with 403/429/503
    plus a challenge page. That is not an outage."""
    h = {k.lower(): v.lower() for k, v in r.headers.items()}
    if "cf-mitigated" in h or "cf-chl-bypass" in h or h.get("server", "").startswith("cloudflare") or "akamai" in h.get("server", "") or "x-sucuri-id" in h:
        return True
    body = r.text[:20000].lower()
    return any(m in body for m in ("challenge-platform", "cf-browser-verification", "just a moment", "attention required", "captcha", "access denied"))


def check_target(db: Session, target: MonitoringTarget) -> SignalEvent:
    started = time.perf_counter()
    status_code: int | None = None
    error: str | None = None
    protected = False
    try:
        validate(target.url)
        with httpx.Client(follow_redirects=True, timeout=httpx.Timeout(settings.fetch_timeout_seconds, connect=6), headers={"User-Agent": USER_AGENT}) as client:
            r = client.get(target.url)
            status_code = r.status_code
            protected = status_code in (403, 429, 503) and _looks_like_bot_challenge(r)
    except UnsafeURL as e:
        error = str(e)
    except httpx.TimeoutException:
        error = "timeout"
    except httpx.HTTPError as e:
        error = e.__class__.__name__
    response_ms = int((time.perf_counter() - started) * 1000)

    if protected:
        new_status = "protected"  # a bot challenge answered, so the site is up but will not let a monitor read it
    elif error or status_code is None or status_code >= 500:
        new_status = "unavailable"
    elif status_code >= 400 or response_ms > settings.signal_response_warn_ms:
        new_status = "degraded"
    else:
        new_status = "operational"

    previous = target.status
    now = datetime.now(timezone.utc)
    target.last_status_code = status_code
    target.last_response_ms = response_ms
    target.last_checked_at = now
    target.status = new_status

    event = SignalEvent(target_id=target.id, kind="check", level="info", message=f"{new_status.capitalize()} · {status_code or error} · {response_ms} ms", status_code=status_code, response_ms=response_ms, data={"error": error})
    db.add(event)

    if new_status != previous and previous != "unknown":
        level = "critical" if new_status == "unavailable" else "warning" if new_status == "degraded" else "info"
        kind = "incident" if new_status == "unavailable" else "warning" if new_status == "degraded" else "recovered" if new_status == "operational" else "status_change"
        msg = {"unavailable": "Website unavailable", "degraded": "Website degraded", "operational": "Website recovered", "protected": "Website answers with a bot challenge; reachable, not readable by the monitor"}[new_status]
        db.add(SignalEvent(target_id=target.id, kind=kind, level=level, message=msg, status_code=status_code, response_ms=response_ms, data={"from": previous, "to": new_status}))
        if level != "info":
            notify(f"[Signal] {target.name}: {msg}", {"target": target.url, "from": previous, "to": new_status, "status_code": status_code, "response_ms": response_ms, "error": error})
    elif previous == "unknown":
        db.add(SignalEvent(target_id=target.id, kind="status_change", level="info", message=f"First check: {new_status}", status_code=status_code, response_ms=response_ms))

    if target.url.startswith("https://") and (target.ssl_expires_at is None or (now - (target.last_checked_at or now)).total_seconds() >= 0):
        _check_ssl(db, target, now)

    db.commit()
    return event


def _check_ssl(db: Session, target: MonitoringTarget, now: datetime) -> None:
    try:
        info = inspect_ssl(target.host)
        days_left = (info["expires_at"] - now).days
        was_valid = target.ssl_valid
        target.ssl_valid = 1
        target.ssl_expires_at = info["expires_at"]
        target.ssl_issuer = info["issuer"][:255]
        if was_valid is None:
            db.add(SignalEvent(target_id=target.id, kind="ssl", level="info", message=f"SSL valid, expires in {days_left} days", data={"expires_at": info["expires_at"].isoformat(), "issuer": info["issuer"]}))
        if days_left <= settings.signal_ssl_warn_days:
            db.add(SignalEvent(target_id=target.id, kind="ssl", level="warning", message=f"SSL certificate expires in {days_left} days", data={"expires_at": info["expires_at"].isoformat()}))
            notify(f"[Signal] {target.name}: SSL expires in {days_left} days", {"target": target.url, "expires_at": info["expires_at"].isoformat()})
    except Exception as e:  # certificate errors are findings, not crashes
        if target.ssl_valid != 0:
            target.ssl_valid = 0
            db.add(SignalEvent(target_id=target.id, kind="ssl", level="critical", message=f"SSL check failed: {e.__class__.__name__}", data={"error": str(e)[:200]}))
            notify(f"[Signal] {target.name}: SSL check failed", {"target": target.url, "error": str(e)[:200]})


def check_all(db: Session) -> int:
    targets = db.query(MonitoringTarget).filter(MonitoringTarget.enabled == 1).all()
    for target in targets:
        try:
            check_target(db, target)
        except Exception:
            log.exception("check failed for %s", target.url)
            db.rollback()
    return len(targets)
