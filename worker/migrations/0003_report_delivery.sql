-- Gated Vector reports. Anyone sees the summary of an examination; the full
-- report is emailed to whoever asks for it with the report form, by the
-- report-delivery Workflow (src/report-delivery.js).
--
-- Email addresses are kept in plain text only on report_requests, which the
-- retention sweep anonymises. Limits and suppressions use `email_hash`, a
-- salted SHA-256 of the lower-cased address, so they keep working after that.

CREATE TABLE report_requests (
  id TEXT PRIMARY KEY,                     -- also the Workflow instance id
  audit_id TEXT NOT NULL REFERENCES audits (id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  company TEXT,
  note TEXT,                               -- "the biggest problem with the site", optional
  source TEXT NOT NULL DEFAULT 'vector',   -- vector | diagnostic | report-link
  consent_version TEXT NOT NULL,           -- the consent wording the requester accepted
  ip_key TEXT NOT NULL,                    -- salted hash, never the IP
  status TEXT NOT NULL DEFAULT 'queued',   -- queued | sending | sent | failed | suppressed | skipped
  attempts INTEGER NOT NULL DEFAULT 0,
  summary TEXT,                            -- plain-English summary, stored so a retry never regenerates it
  summary_source TEXT,                     -- 'ai:<model>' or 'rules'
  email_id TEXT,                           -- Resend's id for the sent email
  last_error TEXT,
  owner_notified INTEGER NOT NULL DEFAULT 0,
  anonymized INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX ix_report_requests_email ON report_requests (email_hash, created_at);
CREATE INDEX ix_report_requests_audit ON report_requests (audit_id, email_hash);
CREATE INDEX ix_report_requests_status ON report_requests (status, updated_at);
CREATE INDEX ix_report_requests_created ON report_requests (created_at);
CREATE INDEX ix_report_requests_email_id ON report_requests (email_id);

-- Links to the full report. The token is an HMAC of the request id, so it is
-- never stored; only its SHA-256 is, for lookup, expiry and revocation.
CREATE TABLE report_tokens (
  token_hash TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES report_requests (id),
  audit_id TEXT NOT NULL REFERENCES audits (id),
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX ix_report_tokens_request ON report_tokens (request_id);
CREATE INDEX ix_report_tokens_expires ON report_tokens (expires_at);

-- Addresses that must not be emailed again: unsubscribed, hard-bounced,
-- marked as spam, or blocked by the operator.
CREATE TABLE email_suppressions (
  email_hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL,                    -- unsubscribed | bounced | complained | manual
  detail TEXT,
  created_at TEXT NOT NULL
);

-- Audit trail for every report request: requested, summarized, sent,
-- delivered, bounced, viewed, unsubscribed, failed, retried, ...
CREATE TABLE report_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX ix_report_events_request ON report_events (request_id, id);
CREATE INDEX ix_report_events_created ON report_events (created_at);
