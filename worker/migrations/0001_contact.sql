-- Project intake submissions. Same columns as the Python API's
-- contact_submissions table, so rows can move between the two.
CREATE TABLE contact_submissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  project_type TEXT NOT NULL,
  problem TEXT NOT NULL,
  current_system TEXT,
  desired_outcome TEXT,
  timeline TEXT,
  budget_range TEXT,
  additional TEXT,
  website TEXT,
  classification TEXT NOT NULL DEFAULT '{}',
  notified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX ix_contact_submissions_email ON contact_submissions (email);
CREATE INDEX ix_contact_submissions_created_at ON contact_submissions (created_at);

-- Fixed-window rate-limit counters. `ip_key` is a salted SHA-256 of the
-- client IP, never the IP itself.
CREATE TABLE rate_hits (
  bucket TEXT NOT NULL,
  ip_key TEXT NOT NULL,
  slot INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, ip_key, slot)
);
