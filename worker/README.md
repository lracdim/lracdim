# API Worker (Cloudflare)

The public site's API, on the Cloudflare Workers **free plan** with a D1
database: <https://lracdim-api.lracdim.workers.dev>. It replaced the Python
API on Railway on 2026-10-19 and serves every endpoint the site calls, with
the same request and response shapes, so the site only needed a different
`LRACDIM_API_BASE`.

| Area | Endpoints | Source in the Python API |
| --- | --- | --- |
| Intake | `POST /api/contact`, `GET /api/contact/project-types`, `GET /api/contact/submissions` (admin) | `routes/contact.py` |
| Vector | `POST /api/vector/audits`, `GET /api/vector/audits/{id}`, `…/{id}/results`, `GET /api/vector/recent`, `GET /api/vector/websites/{host}/audits` | `routes/vector.py`, `services/audit_service.py`, `analyzers/` |
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
npx wrangler secret put NOTIFY_EMAIL      # where alerts go (the Resend account address until a domain is verified)
npx wrangler secret put NOTIFY_WEBHOOK    # Google Sheets web app URL, optional
npx wrangler secret put ADMIN_KEY         # guards the admin endpoints
npx wrangler secret put RATE_LIMIT_SALT   # any long random string
npx wrangler secret list                  # names only
```

Plain settings (`CORS_ORIGINS`, `RESEND_FROM`, `RESEND_AUTOREPLY`, the
`RATE_LIMIT_*` limits, `SIGNAL_RESPONSE_WARN_MS`) live in `wrangler.jsonc`.

## Reading data

```bash
npx wrangler d1 execute lracdim-api --remote --command "SELECT created_at, name, email, project_type FROM contact_submissions ORDER BY created_at DESC LIMIT 20"
npx wrangler d1 execute lracdim-api --remote --command "SELECT host, status, last_checked_at FROM monitoring_targets"
```

## Not served here

The studio dashboard's endpoints (`/api/studio/*`) and the CMS endpoints stay
in the Python API, which the dashboard uses locally. The public site never
calls them; the Worker answers them with 404.
