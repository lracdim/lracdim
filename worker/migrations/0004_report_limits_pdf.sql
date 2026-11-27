-- 1. The PDF attached to the report email, held only between rendering and
--    sending. It is stored once so every retry of the send step attaches the
--    same bytes (Resend's idempotency key needs an identical request), and
--    deleted as soon as the email is accepted; the cron sweep removes any
--    left after a day.
-- 2. One full report per address and one per website a week
--    (REPORT_EMAIL_COOLDOWN_DAYS, REPORT_SITE_COOLDOWN_DAYS in wrangler.jsonc).

CREATE TABLE report_files (
  request_id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  content_b64 TEXT NOT NULL,               -- base64, as Resend takes attachments
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
-- site_key is the examined host in lower case without a leading "www.", so
-- www.example.com, example.com and any page on either count as one website.

ALTER TABLE report_requests ADD COLUMN site_key TEXT;

CREATE INDEX ix_report_requests_site ON report_requests (site_key, created_at);

-- Requests made before this migration: derive the key from the audit's URL.
UPDATE report_requests SET site_key = (
  SELECT CASE WHEN h LIKE 'www.%' THEN substr(h, 5) ELSE h END
  FROM (
    SELECT lower(CASE WHEN instr(rest, '/') > 0 THEN substr(rest, 1, instr(rest, '/') - 1) ELSE rest END) AS h
    FROM (SELECT substr(a.url, instr(a.url, '://') + 3) AS rest FROM audits a WHERE a.id = report_requests.audit_id)
  )
)
WHERE site_key IS NULL;
