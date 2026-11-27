-- Studio dashboard (admin + client portal), served under /api/studio by
-- src/studio/. Ported from the Python engine's JSON-file store
-- (backend/engine/app/store.py), one table per collection that holds real
-- data. Collections the engine filled with generated demo data (traffic,
-- keywords, AI prompts, client leads, uptime history) have no table: the
-- dashboard reads uptime from Signal and website scores from Vector instead.
--
-- Conventions: ids are 32 hex characters (newId), timestamps are ISO 8601 UTC
-- strings, calendar dates are YYYY-MM-DD, JSON lives in TEXT columns.

-- ---------------------------------------------------------------- accounts

CREATE TABLE studio_clients (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'Essentials',      -- Essentials | Growth | Scale (src/studio/plans.js)
  mrr REAL NOT NULL DEFAULT 0,                   -- copied from the plan when it is set
  included_hours REAL NOT NULL DEFAULT 0,        -- copied from the plan when it is set
  status TEXT NOT NULL DEFAULT 'onboarding',     -- active | onboarding | paused | churned
  industry TEXT NOT NULL DEFAULT '',
  since TEXT NOT NULL,                           -- date
  renewal_date TEXT,                             -- date
  notes TEXT NOT NULL DEFAULT '',                -- private to the studio
  nps INTEGER,                                   -- 0-10, entered by the studio after a survey
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX ix_studio_clients_status ON studio_clients (status);

-- Admins and client portal users. Admins are created only with
-- scripts/studio-create-admin.mjs. A client user starts disabled with no
-- password and becomes active when the invite is accepted.
CREATE TABLE studio_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,                    -- stored lower-cased
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'client')),
  client_id TEXT REFERENCES studio_clients (id),
  password_hash TEXT,                            -- pbkdf2$100000$<salt b64>$<hash b64>
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE INDEX ix_studio_users_client ON studio_users (client_id);

-- Bearer sessions. Only the SHA-256 of the token is stored. A session with
-- impersonator_id is an admin's "view as client" session.
CREATE TABLE studio_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES studio_users (id),
  impersonator_id TEXT REFERENCES studio_users (id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ip_key TEXT NOT NULL                           -- salted hash, never the IP
);

CREATE INDEX ix_studio_sessions_user ON studio_sessions (user_id);
CREATE INDEX ix_studio_sessions_expires ON studio_sessions (expires_at);

-- Portal invites (also used to reset a client's password). Only the SHA-256
-- of the token is stored; the link is shown to the admin once.
CREATE TABLE studio_invites (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES studio_users (id),
  created_by TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ix_studio_invites_user ON studio_invites (user_id);

-- ---------------------------------------------------------------- websites

-- A client website. Uptime comes from its Signal target (monitoring_targets,
-- signal_events); health and category scores from the latest completed
-- Vector audit whose website host equals `host`.
CREATE TABLE studio_sites (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES studio_clients (id),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  host TEXT NOT NULL,                            -- lower case, as Vector's websites.host
  platform TEXT NOT NULL DEFAULT 'Unknown',
  hosting TEXT NOT NULL DEFAULT 'Unknown',
  notes TEXT NOT NULL DEFAULT '',
  target_id TEXT REFERENCES monitoring_targets (id),
  created_at TEXT NOT NULL
);

CREATE INDEX ix_studio_sites_client ON studio_sites (client_id);
CREATE INDEX ix_studio_sites_host ON studio_sites (host);
CREATE INDEX ix_studio_sites_target ON studio_sites (target_id);

-- Daily uptime per Signal target, rolled up hourly by the cron from
-- signal_events (which keeps raw checks for 14 days only), so 30- and 90-day
-- uptime and monthly reports have data.
CREATE TABLE studio_uptime_days (
  target_id TEXT NOT NULL,
  day TEXT NOT NULL,                             -- YYYY-MM-DD (UTC)
  checks INTEGER NOT NULL DEFAULT 0,
  down INTEGER NOT NULL DEFAULT 0,               -- checks that found the site unavailable
  response_ms_total INTEGER NOT NULL DEFAULT 0,
  response_samples INTEGER NOT NULL DEFAULT 0,
  incidents INTEGER NOT NULL DEFAULT 0,          -- transitions to unavailable
  updated_at TEXT NOT NULL,
  PRIMARY KEY (target_id, day)
);

-- ---------------------------------------------------------------- pipeline

-- The studio's own fields on a lead. The lead itself is a contact_submissions
-- row (source 'contact') or a report_requests row (source 'report'); nothing
-- about the person is copied here.
CREATE TABLE studio_prospects (
  source TEXT NOT NULL CHECK (source IN ('contact', 'report')),
  source_id TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'new',             -- new | reviewing | call_booked | proposal | won | lost
  value REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  client_id TEXT REFERENCES studio_clients (id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, source_id)
);

-- ---------------------------------------------------------------- delivery

CREATE TABLE studio_projects (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES studio_clients (id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Project',
  phase TEXT NOT NULL DEFAULT 'discovery',       -- discovery | strategy | design | development | qa | launch | maintenance
  start_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  budget REAL NOT NULL DEFAULT 0,
  hours_budget REAL NOT NULL DEFAULT 0,
  hours_logged REAL NOT NULL DEFAULT 0,
  health TEXT NOT NULL DEFAULT 'on_track',       -- on_track | at_risk | late | complete
  created_at TEXT NOT NULL
);

CREATE INDEX ix_studio_projects_client ON studio_projects (client_id);

CREATE TABLE studio_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES studio_projects (id),
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming',       -- upcoming | in_progress | awaiting_approval | done
  needs_approval INTEGER NOT NULL DEFAULT 0,
  approved_at TEXT,
  approved_by TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX ix_studio_milestones_project ON studio_milestones (project_id, due_date);

CREATE TABLE studio_worklog (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES studio_clients (id),
  site_id TEXT REFERENCES studio_sites (id),
  date TEXT NOT NULL,
  category TEXT NOT NULL,                        -- maintenance | security | seo | aeo | geo | performance | content | feature
  title TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  by_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ix_studio_worklog_client ON studio_worklog (client_id, date);
CREATE INDEX ix_studio_worklog_date ON studio_worklog (date);

-- ---------------------------------------------------------------- support

CREATE TABLE studio_tickets (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES studio_clients (id),
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'question',     -- bug | content | feature | question | billing | incident
  priority TEXT NOT NULL DEFAULT 'normal',       -- low | normal | high | urgent
  status TEXT NOT NULL DEFAULT 'open',           -- open | in_progress | waiting | resolved
  sla_hours INTEGER NOT NULL,                    -- first-reply target, fixed when the ticket is opened
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX ix_studio_tickets_client ON studio_tickets (client_id, updated_at);
CREATE INDEX ix_studio_tickets_updated ON studio_tickets (updated_at);

CREATE TABLE studio_ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES studio_tickets (id),
  author TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'client')),
  body TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE INDEX ix_studio_ticket_messages_ticket ON studio_ticket_messages (ticket_id, at);

-- ---------------------------------------------------------------- billing

-- Invoice records only: nothing here takes or reconciles payments.
CREATE TABLE studio_invoices (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES studio_clients (id),
  kind TEXT NOT NULL DEFAULT 'one_off',          -- retainer | project | one_off
  issued_at TEXT NOT NULL,                       -- date
  due_at TEXT NOT NULL,                          -- date
  status TEXT NOT NULL DEFAULT 'draft',          -- draft | sent | paid | overdue | void ('sent' past due is shown as overdue)
  paid_at TEXT,                                  -- date
  items TEXT NOT NULL DEFAULT '[]',              -- [{description, quantity, unitPrice}]
  amount REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ix_studio_invoices_client ON studio_invoices (client_id, issued_at);
CREATE INDEX ix_studio_invoices_status ON studio_invoices (status, due_at);

-- ---------------------------------------------------------------- audit trail

CREATE TABLE studio_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT ''
);

CREATE INDEX ix_studio_activity_at ON studio_activity (at);
