# API Worker (Cloudflare)

The public site's API, on the Cloudflare Workers **free plan** with a D1
database: <https://lracdim-api.lracdim.workers.dev>. It replaced the Python
API on Railway on 2026-10-19 and serves every endpoint the site calls, with
the same request and response shapes, so the site only needed a different
`LRACDIM_API_BASE`.

| Area | Endpoints | Source in the Python API |
| --- | --- | --- |
| Intake | `POST /api/contact`, `GET /api/contact/project-types`, `GET /api/contact/submissions` (admin) | `routes/contact.py` |
| Vector | `POST /api/vector/audits`, `GET /api/vector/audits/{id}`, `…/{id}/results` (the summary; the full report with `X-Admin-Key`), `GET /api/vector/recent`, `GET /api/vector/websites/{host}/audits` | `routes/vector.py`, `services/audit_service.py`, `analyzers/` |
| Emailed reports | `POST /api/vector/audits/{id}/report-requests`, `GET /api/vector/report-requests/{id}`, `GET /api/vector/report`, `GET /api/vector/report/pdf`, `POST /api/vector/unsubscribe/{token}`, `POST /api/webhooks/resend`, admin: `GET /api/vector/report-requests`, `…/{id}/retry`, `…/{id}/revoke`, `…/erase`, `GET /api/vector/report-stats` | new in the Worker, see "Emailed full reports" below |
| Signal | `POST /api/signal/scan`, `GET /api/signal/targets`, `…/{id}`, `…/{id}/events`, `…/{id}/snapshot`, `GET /api/signal/events`, `GET /api/signal/lookup`, `POST /api/signal/targets` and `…/{id}/check` (admin) | `routes/signal.py`, `services/monitor_service.py`, `services/signal_scan.py` |
| Forge | `GET /api/forge/tools`, `POST /api/forge/{tool}/run` for the robots, sitemap, metadata, canonical and redirect tools | `routes/forge.py`, `services/forge_tools.py` |
| Health | `GET /api/health` | `main.py` |

The eight analyzers, the scoring and the SSRF policy are line-by-line ports.
On five real pages (577 B to 572 KB) both implementations produce identical
scores, findings, evidence and metrics.

## Differences the free plan forces

- **Background work.** An examination answers 202 and runs in `ctx.waitUntil`,
  which may keep working for 30 seconds after the response. One still running
  after 90 seconds is reported as failed, so the page never polls forever.
- **Budgets per request.** The free plan allows 50 outbound requests and 50
  database queries per invocation. Every outbound request, including redirect
  hops, is charged to a budget (`Budget` in `src/fetcher.js`); the link
  checker stops when it runs out and its note says so. An examination's
  results, issues and prescription are stored as JSON on the audit row.
- **Scheduled checks** run from the Cron Trigger every 5 minutes, at most 8
  targets per run. Operator targets are due every 5 minutes, public scan
  targets hourly (at most 100 of them), and check events older than 14 days
  are pruned. This keeps D1 far inside its daily free quota.
- **SSL.** A Worker cannot read a remote certificate. A successful https
  fetch sets `ssl_valid = 1`, a TLS failure sets `0`; the expiry date and
  issuer are not measured and stay null (the site shows "Valid").
- **Core Web Vitals** are not measured (a PageSpeed run outlasts the 30
  seconds). The Railway API had no PageSpeed key either.
- **DNS.** The address a visitor types is resolved over DNS-over-HTTPS and
  rejected if it points at a private network; redirect hops get the literal
  checks only (a Worker's egress cannot reach private networks).

## Emailed full reports

Anyone sees an examination's **summary**: the health score, the eight
category scores, severity counts and the top three issues without their
evidence or fixes (`/results`). The **full report** (every issue with
evidence, the fix list, raw measurements) is emailed, with the whole report
attached as a PDF: the visitor fills in the form under the summary, and the
report-delivery Workflow sends it.

```
site form ──POST report-requests──▶ validate · Turnstile · weekly limits · MX check · suppression list
                                     └─ store request (D1) ─▶ ReportDeliveryWorkflow
                                          prepare ─▶ summarize (Workers AI, rules fallback)
                                          ─▶ attach pdf (Browser Run; skipped on any failure)
                                          ─▶ send report (Resend, 5 retries, idempotent)
                                          ─▶ notify owner (NOTIFY_EMAIL, through Resend)
email link ─▶ /vector/report/#t=<token> ─GET /api/vector/report (Bearer)─▶ full report
                                         ─GET /api/vector/report/pdf (Bearer)─▶ the same PDF
```

- **Code**: `src/reports.js` (HTTP), `src/report-delivery.js` (the pipeline),
  `src/workflow.js` (the Workflow class), `src/report-email.js` (HTML and text
  email), `src/report-pdf.js` (the A4 PDF), `src/report-summary.js` (AI and
  rule-based summary), `src/turnstile.js`, `src/secure.js`; tables in
  `migrations/0003_report_delivery.sql` and `0004_report_limits_pdf.sql`;
  tests in `test/report.test.js`.
- **Senders.** The report comes from `REPORT_FROM` (John Carl Dimatulac
  <john@lracdimension.online>) with Reply-To `REPORT_REPLY_TO`; owner alerts
  and the project-inquiry acknowledgement come from `RESEND_FROM`
  (hello@lracdimension.online), Reply-To `INTAKE_REPLY_TO`. `NOTIFY_EMAIL` is
  the owner's private inbox: it receives alerts and is never a sender or a
  Reply-To on anything a visitor gets.
- **Replies (Resend Inbound).** Mail to any address at the domain is received
  by Resend once the domain's MX points at it, and the `email.received`
  webhook (same endpoint and secret as the delivery events) makes
  `src/inbound.js` fetch the message and forward it to `INBOUND_FORWARD_TO`
  (default `NOTIFY_EMAIL`), From "Sender via LRACDIMENSION", Reply-To the
  original sender, attachments by Resend's signed URLs, idempotency key
  `inbound-<id>`. Failed SPF and DKIM put "[unverified sender]" in the
  subject. Mail from the site's own addresses is dropped, so nothing loops.
  Each forward is one more send against Resend's daily quota.
- **PDF.** `src/report-pdf.js` builds a self-contained A4 page (no scripts or
  external requests, everything escaped) and prints it with Browser Run's
  `pdf` Quick Action (`BROWSER` binding): about 1 to 3 seconds and 250 KB for
  a typical report. The free plan allows 10 browser minutes a day and one
  Quick Action every 10 seconds; a 429 is waited out twice, then the email
  goes without the file and the owner alert says why. The PDF is stored in
  `report_files` only between rendering and sending, so every send retry
  attaches identical bytes under the same idempotency key, and deleted once
  Resend accepts the email (the hourly sweep removes any left after a day).
  The online report's "Download PDF" prints the same document on demand
  (10 per visitor an hour, 5 per link a day) and falls back to the browser's
  print dialog. `REPORT_PDF=off` turns both off. Locally, wrangler's Browser
  Run emulator lacks Quick Actions; add `"remote": true` to the binding to use
  the real service, or leave the PDF off.
- **Durable delivery.** Each step is a Workflow step with its own retries.
  Steps re-read D1 and return only ids, so no address or report is kept in
  Workflow state. If the binding is missing or refuses an instance, the same
  pipeline runs in `ctx.waitUntil`, and the 5-minute cron re-dispatches
  anything still queued after 30 minutes (at most 4 times, then `failed`).
  Resend idempotency keys (`report-<id>-<attempt>`) mean a retry never sends twice.
- **Links.** The report link carries an HMAC of the request id
  (`REPORT_SIGNING_KEY`, or `RATE_LIMIT_SALT` when that is unset). Only its
  SHA-256 is stored, with an expiry (`REPORT_LINK_DAYS`, 30) and a revoke flag.
  It travels in the URL fragment, so it never reaches a server log or a
  Referer header. Audit ids are not secrets (the recent list shows them), so
  they never unlock the full report.
- **Abuse protection.** Turnstile checked server-side (host and action too),
  5 requests per IP per hour, one report per address and one per website a
  week (`REPORT_EMAIL_COOLDOWN_DAYS`, `REPORT_SITE_COOLDOWN_DAYS`; the website
  is the examined host without `www.`, so any page of it counts), a daily cap
  (`REPORT_DAILY_CAP`, 40: each report is two emails and Resend's free plan
  allows 100 a day), an MX lookup, a honeypot, names containing links refused,
  and a suppression list fed by unsubscribes and Resend bounce and complaint
  webhooks. Only queued, sending and sent requests use up the week; a failed
  one does not. Asking again for the same report answers with the first
  request instead of an error. The limits apply to Vector reports only, not
  to the project-intake form.
- **AI summary.** Workers AI (`REPORT_AI_MODEL`) gets scores, counts and the
  analyzers' own issue titles and fixes, never text copied from the examined
  page. Its answer is stripped of links, addresses and markup and must state
  the real score, or the rule-based summary is used. About 32 of the 10,000
  free daily Neurons per report.
- **Email.** HTML (tables, inline styles, under Gmail's clipping size) plus
  plain text, reply-to `REPORT_REPLY_TO` or `NOTIFY_EMAIL`, RFC 8058 one-click
  `List-Unsubscribe` headers, and a footer link to `/vector/unsubscribe/`.
- **Privacy.** IPs and addresses are compared as salted hashes. After
  `REPORT_RETENTION_DAYS` (365) the hourly sweep erases a request's name,
  address, company and note; expired links are deleted after 30 more days.
  `POST /api/vector/report-requests/erase {"email"}` erases one person's
  requests at once. The site's `/privacy/` page describes all of this.

### Setting it up

1. Apply the migration, then deploy (the Workflow is created by the deploy):

   ```bash
   npm run db:migrate:remote
   npm run deploy
   ```

2. Turnstile: in the Cloudflare dashboard, Turnstile → Add widget, hostnames
   `www.lracdimension.online` and `lracdimension.online`, mode Managed. Then
   `npx wrangler secret put TURNSTILE_SECRET`, set `LRACDIM_TURNSTILE_SITE_KEY`
   on Vercel and redeploy the site, and set `TURNSTILE_REQUIRED` to `"true"` in
   `wrangler.jsonc` and deploy again.
3. Resend webhook: in Resend → Webhooks, add
   `https://lracdim-api.lracdim.workers.dev/api/webhooks/resend` for
   `email.received`, `email.delivered`, `email.bounced`, `email.complained`
   and `email.delivery_delayed`, then `npx wrangler secret put
   RESEND_WEBHOOK_SECRET` with its signing secret (`whsec_…`).
4. Receiving: in Resend → Domains → lracdimension.online, turn on receiving
   and copy the MX record it shows into the domain's DNS (Z.com) with the
   lowest priority number of all MX records; remove the old Titan MX records
   (`mx1.titan.email`, `mx2.titan.email`) once nothing is needed from that
   mailbox. Resend only receives when its MX has the lowest priority value.
5. Optional: `npx wrangler secret put REPORT_SIGNING_KEY` (a long random
   string) to sign links with a key of their own. Changing it invalidates every
   link already sent.

### Operating it

```bash
H="X-Admin-Key: $ADMIN_KEY"; API=https://lracdim-api.lracdim.workers.dev
curl -H "$H" $API/api/vector/report-stats                        # volumes, cap, suppressions, what is on
curl -H "$H" "$API/api/vector/report-requests?status=failed"     # what needs attention
curl -H "$H" $API/api/vector/report-requests/<id>                # one request and its audit trail
curl -H "$H" -X POST $API/api/vector/report-requests/<id>/retry  # deliver again (add -d '{"force":true}' if it was sent)
curl -H "$H" -X POST $API/api/vector/report-requests/<id>/revoke # withdraw a link
curl -H "$H" -H "Content-Type: application/json" -X POST -d '{"email":"a@b.com"}' $API/api/vector/report-requests/erase
npx wrangler d1 execute lracdim-api --remote --command "SELECT created_at, status, name, email, last_error FROM report_requests ORDER BY created_at DESC LIMIT 20"
```

Every pipeline event is also logged as JSON (`{"event":"report.sent",…}`) in
the Worker logs. Locally, `REPORT_EMAIL_DRY_RUN=true` renders and logs each
email instead of sending it.

## CPU time

The free plan's published limit is 10 ms of CPU per request. Light requests
(polling, health, intake) use 3 to 6 ms. A Vector examination measured 70 to
213 ms and a Signal scan about 80 ms on 2026-10-19, and Cloudflare completed
every one. If the limit is ever enforced strictly, heavy examinations are cut
off and reported as "took too long"; the fix is the Workers Paid plan
($5/month, 30 s of CPU), with no code change.

## Commands

```bash
npm install
npm test                      # node:test against real SQLite, no network
npm run db:migrate:local      # create the tables for `npm run dev`
npm run dev                   # http://127.0.0.1:8787, secrets from .dev.vars
npm run db:migrate:remote     # apply new migrations to the live database
npm run deploy
npx wrangler tail lracdim-api # live logs, with CPU time per request
```

Copy `.dev.vars.example` to `.dev.vars` for local secrets; it is git-ignored.
To run the cron locally, start `npx wrangler dev --test-scheduled` and open
`http://127.0.0.1:8787/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*`.

## Secrets

Set once per secret; the prompt reads the value without echoing it.

```bash
npx wrangler secret put RESEND_API_KEY    # Resend key
npx wrangler secret put NOTIFY_EMAIL      # where alerts go (any inbox: lracdimension.online is a verified Resend domain)
npx wrangler secret put ADMIN_KEY         # guards the admin endpoints
npx wrangler secret put RATE_LIMIT_SALT   # any long random string
npx wrangler secret put TURNSTILE_SECRET  # Turnstile widget secret, for the report form
npx wrangler secret put RESEND_WEBHOOK_SECRET  # Resend webhook signing secret (whsec_…)
npx wrangler secret put REPORT_SIGNING_KEY     # optional: signs report links (else RATE_LIMIT_SALT)
npx wrangler secret list                  # names only
```

Plain settings (`CORS_ORIGINS`, `RESEND_FROM`, `INTAKE_REPLY_TO`,
`RESEND_AUTOREPLY`, the `RATE_LIMIT_*` limits, `SIGNAL_RESPONSE_WARN_MS`,
`SITE_URL`, `API_URL` and the `REPORT_*` and `TURNSTILE_REQUIRED` report
settings) live in `wrangler.jsonc`.

## Reading data

```bash
npx wrangler d1 execute lracdim-api --remote --command "SELECT created_at, name, email, project_type FROM contact_submissions ORDER BY created_at DESC LIMIT 20"
npx wrangler d1 execute lracdim-api --remote --command "SELECT host, status, last_checked_at FROM monitoring_targets"
```

## Not served here

The studio dashboard's endpoints (`/api/studio/*`) and the CMS endpoints stay
in the Python API, which the dashboard uses locally. The public site never
calls them; the Worker answers them with 404.
