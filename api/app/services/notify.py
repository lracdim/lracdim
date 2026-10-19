"""Notification channels. Each channel is optional and configured by
environment; `notify` fans out to whichever are configured and never raises."""
from __future__ import annotations

import json
import logging
import smtplib
from email.message import EmailMessage

import httpx

from ..core.config import settings

log = logging.getLogger("notify")

RESEND_ENDPOINT = "https://api.resend.com/emails"

# Labels for the readable email body. Anything else in a payload is listed under its own key.
_LABELS = {
    "name": "Name",
    "email": "Email",
    "company": "Company",
    "website": "Website",
    "project_type": "Project type",
    "budget_range": "Budget",
    "timeline": "Timeline",
    "problem": "The problem",
    "current_system": "Current system",
    "desired_outcome": "Desired outcome",
    "classification": "Triage (internal)",
    "id": "Submission id",
}


def _email(subject: str, body: str) -> bool:
    if not (settings.smtp_host and settings.notify_email and settings.smtp_from):
        return False
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = settings.notify_email
    msg.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)
    return True


def _webhook(subject: str, payload: dict) -> bool:
    if not settings.notify_webhook:
        return False
    httpx.post(settings.notify_webhook, json={"subject": subject, **payload}, timeout=10)
    return True


def _readable(payload: dict) -> str:
    """Plain-text body a person can read in an inbox (the SMTP channel keeps raw JSON)."""
    lines = []
    keys = [k for k in _LABELS if k in payload] + [k for k in payload if k not in _LABELS]
    for key in keys:
        value = payload.get(key)
        if value in (None, "", [], {}):
            continue
        if isinstance(value, dict):
            value = ", ".join(f"{k}: {', '.join(v) if isinstance(v, list) else v}" for k, v in value.items())
        elif isinstance(value, list):
            value = ", ".join(str(v) for v in value)
        label = _LABELS.get(key, key.replace("_", " ").capitalize())
        text = str(value)
        lines.append(f"{label}:\n{text}\n" if "\n" in text or len(text) > 70 else f"{label}: {text}")
    return "\n".join(lines)


def send_resend(to: str, subject: str, text: str, *, reply_to: str | None = None, idempotency_key: str | None = None) -> bool:
    """Send one plain-text email through Resend. Returns False when Resend is not
    configured; raises on an HTTP error (callers decide whether that matters).
    The API key travels only in the Authorization header and is never logged."""
    if not (settings.resend_api_key and to):
        return False
    body = {"from": settings.resend_from, "to": [to], "subject": subject[:200], "text": text}
    if reply_to:
        body["reply_to"] = reply_to
    headers = {"Authorization": f"Bearer {settings.resend_api_key}", "Content-Type": "application/json"}
    if idempotency_key:
        # Resend drops a second request with the same key, so a retried submission
        # never produces a duplicate email.
        headers["Idempotency-Key"] = idempotency_key[:256]
    response = httpx.post(RESEND_ENDPOINT, headers=headers, json=body, timeout=10)
    if response.status_code >= 400:
        # The error body names the problem (unverified domain, wrong recipient) without echoing the key.
        try:
            reason = response.json().get("message", "")
        except ValueError:
            reason = ""
        raise RuntimeError(f"Resend returned {response.status_code}: {reason}"[:300])
    return True


def _resend(subject: str, payload: dict) -> bool:
    """Notify the owner. Reply-To is the submitter, so answering the email answers them."""
    submitter = payload.get("email") if isinstance(payload.get("email"), str) else None
    key = f"notify-{payload['id']}" if payload.get("id") else None
    return send_resend(settings.notify_email, subject, _readable(payload), reply_to=submitter, idempotency_key=key)


def notify(subject: str, payload: dict) -> dict:
    """Returns which channels delivered. Failures are logged, not raised."""
    delivered = {"email": False, "webhook": False, "resend": False}
    body = json.dumps(payload, indent=2, default=str)
    for name, fn, args in (
        ("email", _email, (subject, body)),
        ("webhook", _webhook, (subject, payload)),
        ("resend", _resend, (subject, payload)),
    ):
        try:
            delivered[name] = fn(*args)
        except Exception as exc:  # noqa: BLE001 - a failed channel must never fail the request
            log.warning("%s notification failed: %s", name, exc)
    return delivered


def acknowledge(to: str, name: str, project_type: str, submission_id: str) -> bool:
    """Optional confirmation email to the person who sent the intake form
    (RESEND_AUTOREPLY). Never raises."""
    if not (settings.resend_autoreply and settings.resend_api_key and to):
        return False
    if settings.resend_from.endswith("@resend.dev>") or settings.resend_from.endswith("@resend.dev"):
        log.warning("autoreply skipped: verify a sending domain in Resend and set RESEND_FROM first")
        return False
    first = (name or "").split()[0] if name else "there"
    text = (
        f"Hi {first},\n\n"
        f"Thanks — your {project_type.lower()} inquiry reached me. I read every one myself, and you will get "
        "a written reply within one business day with a straight answer on whether it is a fit.\n\n"
        "If anything changes in the meantime, just reply to this email.\n\n"
        "John Carl Dimatulac\nLRACDIMENSION"
    )
    try:
        return send_resend(
            to,
            "Your project inquiry is in — LRACDIMENSION",
            text,
            reply_to=settings.notify_email or None,
            idempotency_key=f"ack-{submission_id}",
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("autoreply failed: %s", exc)
        return False
