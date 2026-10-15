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


def notify(subject: str, payload: dict) -> dict:
    """Returns which channels delivered. Failures are logged, not raised."""
    delivered = {"email": False, "webhook": False}
    body = json.dumps(payload, indent=2, default=str)
    for name, fn, args in (("email", _email, (subject, body)), ("webhook", _webhook, (subject, payload))):
        try:
            delivered[name] = fn(*args)
        except Exception:
            log.exception("%s notification failed", name)
    return delivered
