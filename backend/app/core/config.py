"""Runtime configuration. Everything comes from environment variables; see
.env.example. Secrets never live in code."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _list(name: str, default: str) -> list[str]:
    return [x.strip() for x in os.environ.get(name, default).split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    database_url: str = os.environ.get("DATABASE_URL", "sqlite:///./lracdim.db")
    redis_url: str = os.environ.get("REDIS_URL", "")
    cors_origins: list[str] = field(default_factory=lambda: _list("CORS_ORIGINS", "http://localhost:8099,https://lracdimension.vercel.app"))
    admin_key: str = os.environ.get("ADMIN_KEY", "")

    smtp_host: str = os.environ.get("SMTP_HOST", "")
    smtp_port: int = _int("SMTP_PORT", 587)
    smtp_user: str = os.environ.get("SMTP_USER", "")
    smtp_password: str = os.environ.get("SMTP_PASSWORD", "")
    smtp_from: str = os.environ.get("SMTP_FROM", "")
    notify_email: str = os.environ.get("NOTIFY_EMAIL", "")
    notify_webhook: str = os.environ.get("NOTIFY_WEBHOOK", "")

    signal_interval_seconds: int = _int("SIGNAL_INTERVAL_SECONDS", 300)
    signal_response_warn_ms: int = _int("SIGNAL_RESPONSE_WARN_MS", 1500)
    signal_ssl_warn_days: int = _int("SIGNAL_SSL_WARN_DAYS", 14)

    fetch_timeout_seconds: int = _int("FETCH_TIMEOUT_SECONDS", 12)
    fetch_max_bytes: int = _int("FETCH_MAX_BYTES", 3_000_000)
    audit_max_links_checked: int = _int("AUDIT_MAX_LINKS_CHECKED", 40)
    audit_link_concurrency: int = _int("AUDIT_LINK_CONCURRENCY", 6)

    rate_limit_audits: str = os.environ.get("RATE_LIMIT_AUDITS", "6/hour")
    rate_limit_tools: str = os.environ.get("RATE_LIMIT_TOOLS", "60/hour")
    rate_limit_contact: str = os.environ.get("RATE_LIMIT_CONTACT", "5/hour")

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


settings = Settings()
