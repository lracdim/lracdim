-- Vector, Signal and Forge. Column names follow the Python API's tables.
-- An examination's results, issues and prescription are JSON on the audit
-- row (the Python API used three child tables): one row write instead of
-- dozens keeps an examination inside the free plan's per-request query limit.

CREATE TABLE websites (
  id TEXT PRIMARY KEY,
  host TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE audits (
  id TEXT PRIMARY KEY,
  website_id TEXT NOT NULL REFERENCES websites (id),
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  stage TEXT NOT NULL DEFAULT 'queued',
  stages TEXT NOT NULL DEFAULT '[]',
  error_message TEXT,
  health_score INTEGER,
  listed INTEGER NOT NULL DEFAULT 1,
  scores TEXT NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL DEFAULT '{}',
  results TEXT,
  issues TEXT,
  prescription TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX ix_audits_website ON audits (website_id, status, completed_at);
CREATE INDEX ix_audits_recent ON audits (status, listed, completed_at);

CREATE TABLE monitoring_targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  host TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'admin',
  status TEXT NOT NULL DEFAULT 'unknown',
  last_status_code INTEGER,
  last_response_ms INTEGER,
  last_checked_at TEXT,
  ssl_valid INTEGER,
  ssl_expires_at TEXT,
  ssl_issuer TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX ix_monitoring_targets_host ON monitoring_targets (host);
CREATE INDEX ix_monitoring_targets_due ON monitoring_targets (enabled, last_checked_at);

CREATE TABLE signal_events (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL REFERENCES monitoring_targets (id),
  kind TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  status_code INTEGER,
  response_ms INTEGER,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX ix_signal_events_target ON signal_events (target_id, created_at);
CREATE INDEX ix_signal_events_kind ON signal_events (kind, created_at);

CREATE TABLE tool_runs (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  status TEXT NOT NULL,
  processing_ms INTEGER NOT NULL DEFAULT 0,
  result_meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX ix_tool_runs_tool ON tool_runs (tool, created_at);
