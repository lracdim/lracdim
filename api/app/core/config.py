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
    # Every origin a visitor can end up on. lracdimension.vercel.app and the bare
    # domain both redirect to www, so the www origin is the one that matters.
    cors_origins: list[str] = field(default_factory=lambda: _list("CORS_ORIGINS", "https://www.lracdimension.online,https://lracdimension.online,https://lracdimension.vercel.app,http://localhost:8099"))
    admin_key: str = os.environ.get("ADMIN_KEY", "")

    smtp_host: str = os.environ.get("SMTP_HOST", "")
    smtp_port: int = _int("SMTP_PORT", 587)
    smtp_user: str = os.environ.get("SMTP_USER", "")
    smtp_password: str = os.environ.get("SMTP_PASSWORD", "")
    smtp_from: str = os.environ.get("SMTP_FROM", "")
    notify_email: str = os.environ.get("NOTIFY_EMAIL", "")
    notify_webhook: str = os.environ.get("NOTIFY_WEBHOOK", "")

    # Resend (https://resend.com) transactional email. With RESEND_API_KEY set,
    # every notification is also emailed to NOTIFY_EMAIL through Resend. Until a
    # sending domain is verified in Resend, keep the default sender and set
    # NOTIFY_EMAIL to the address the Resend account was created with: that is
    # the only recipient Resend accepts from onboarding@resend.dev.
    resend_api_key: str = os.environ.get("RESEND_API_KEY", "")
    resend_from: str = os.environ.get("RESEND_FROM", "") or "LRACDIMENSION <onboarding@resend.dev>"
    # Also email the person who submitted the intake form. Needs a verified
    # domain in RESEND_FROM; leave off if the Google Sheets script already
    # sends the acknowledgement, or visitors get two.
    resend_autoreply: bool = os.environ.get("RESEND_AUTOREPLY", "").lower() in ("1", "true", "yes")

    signal_interval_seconds: int = _int("SIGNAL_INTERVAL_SECONDS", 300)
    signal_response_warn_ms: int = _int("SIGNAL_RESPONSE_WARN_MS", 1500)
    signal_ssl_warn_days: int = _int("SIGNAL_SSL_WARN_DAYS", 14)

    # Zoho CRM and WorkDrive. Off unless explicitly enabled; see
    # app/integrations/zoho/README.md. Values come from the environment only.
    zoho_enabled: bool = os.environ.get("ZOHO_ENABLED", "").lower() in ("1", "true", "yes")
    zoho_client_id: str = os.environ.get("ZOHO_CLIENT_ID", "")
    zoho_client_secret: str = os.environ.get("ZOHO_CLIENT_SECRET", "")
    zoho_refresh_token: str = os.environ.get("ZOHO_REFRESH_TOKEN", "")
    zoho_data_center: str = os.environ.get("ZOHO_DATA_CENTER", "com")
    zoho_workdrive_parent_id: str = os.environ.get("ZOHO_WORKDRIVE_PARENT_ID", "")

    # Git-backed CMS: "local" writes to the working tree, "github" commits
    # through the API adapter. See app/cms/README.md.
    cms_adapter: str = os.environ.get("CMS_ADAPTER", "local")
    cms_content_dir: str = os.environ.get("CMS_CONTENT_DIR", "")
    cms_images_dir: str = os.environ.get("CMS_IMAGES_DIR", "")
    github_repo: str = os.environ.get("GITHUB_REPO", "")
    github_branch: str = os.environ.get("GITHUB_BRANCH", "main")
    github_token: str = os.environ.get("GITHUB_TOKEN", "")

    # Google PageSpeed Insights key for Core Web Vitals. Empty means not measured.
    pagespeed_api_key: str = os.environ.get("PAGESPEED_API_KEY", "")

    fetch_timeout_seconds: int = _int("FETCH_TIMEOUT_SECONDS", 12)
    fetch_max_bytes: int = _int("FETCH_MAX_BYTES", 3_000_000)
    audit_max_links_checked: int = _int("AUDIT_MAX_LINKS_CHECKED", 40)
    audit_link_concurrency: int = _int("AUDIT_LINK_CONCURRENCY", 6)

    rate_limit_audits: str = os.environ.get("RATE_LIMIT_AUDITS", "6/hour")
    rate_limit_tools: str = os.environ.get("RATE_LIMIT_TOOLS", "60/hour")
    rate_limit_contact: str = os.environ.get("RATE_LIMIT_CONTACT", "5/hour")
    rate_limit_signal: str = os.environ.get("RATE_LIMIT_SIGNAL", "10/hour")

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


settings = Settings()
