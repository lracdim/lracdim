# API Worker (Cloudflare)

The public site's API front door, on the Cloudflare Workers **free plan**:
<https://lracdim-api.lracdim.workers.dev>.

- **Served here:** `GET /api/health`, the project-intake form
  (`POST /api/contact`, `GET /api/contact/project-types`) and the admin list
  `GET /api/contact/submissions` (`X-Admin-Key`). Submissions are stored in the
  D1 database `lracdim-api`, then sent to the Google Sheets webhook and through
  Resend, exactly like the Python API.
- **Forwarded:** every other `/api/` route (Vector, Signal, Forge, studio) goes
  server-to-server to `LEGACY_API_ORIGIN`, the Python API on Railway, with the
  visitor's IP in `X-Forwarded-For` so its per-visitor rate limits still work.
  CORS is answered here, so the Python API's own `CORS_ORIGINS` no longer
  matters for browsers.
- **Without `LEGACY_API_ORIGIN`** those routes answer `503 not_available`, and
  Railway can be shut down.

Request and response shapes, validation, the honeypot, the 5-per-hour rate
limit, the triage classification and the email text all match the Python API,
so the site needs no code change, only a different `LRACDIM_API_BASE`.

## Why the free plan fits

Intake uses a few milliseconds of CPU per request (the free limit is 10 ms;
time spent waiting on D1, Resend or the webhook does not count) and at most
three outbound requests (the limit is 50). The free plan allows 100,000
requests a day. Cloudflare Containers, which could run the Python API
unchanged, need the Workers Paid plan.

## Commands

```bash
npm install
npm test                      # node:test, real SQLite, no network
npm run db:migrate:local      # create the tables for `npm run dev`
npm run dev                   # http://127.0.0.1:8787, secrets from .dev.vars
npm run db:migrate:remote     # apply new migrations to the live database
npm run deploy
```

Copy `.dev.vars.example` to `.dev.vars` for local secrets; it is git-ignored.

## Secrets

Set once per secret; the prompt reads the value without echoing it.

```bash
npx wrangler secret put RESEND_API_KEY    # Resend key
npx wrangler secret put NOTIFY_EMAIL      # where alerts go (the Resend account address until a domain is verified)
npx wrangler secret put NOTIFY_WEBHOOK    # Google Sheets web app URL, optional
npx wrangler secret put ADMIN_KEY         # guards /api/contact/submissions
npx wrangler secret put RATE_LIMIT_SALT   # any long random string
npx wrangler secret list                  # names only
```

Plain settings (`CORS_ORIGINS`, `LEGACY_API_ORIGIN`, `RESEND_FROM`,
`RESEND_AUTOREPLY`, `RATE_LIMIT_CONTACT`) live in `wrangler.jsonc`.

## Reading submissions

```bash
npx wrangler d1 execute lracdim-api --remote --command "SELECT created_at, name, email, project_type FROM contact_submissions ORDER BY created_at DESC LIMIT 20"
```

## Not ported yet

The studio lead the Python API opens for each submission, Vector audits,
Signal monitoring (its SSL-expiry check cannot run on Workers), and the Forge
tools. Until each is ported, it runs on Railway through the forwarding above.
