# LRACDIMENSION API

Litestar service behind the Vector, Signal, Forge, and intake dimensions.

## Setup

```bash
cd api
python -m venv .venv
.venv/Scripts/activate        # Windows   |   source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
cp .env.example .env          # fill in DATABASE_URL, ADMIN_KEY, CORS_ORIGINS
alembic upgrade head
```

## Run

```bash
uvicorn app.main:app --reload --port 8000          # API + scheduler + in-process worker
rq worker vector                                    # only when REDIS_URL is set
```

Health check: http://localhost:8000/api/health

Sample workflow data for development:

```bash
python scripts/seed_studio.py
```

## Test

```bash
pytest -q
```

The suite is offline: fetches, DNS-dependent checks, and SSL are stubbed. It covers the SSRF policy, every analyzer, the scoring engine, the audit lifecycle (queued → running → completed/failed), monitoring status transitions and incidents, server tools, intake validation and the honeypot, rate limiting, the body-size limit, the studio workflow (transitions, qualifying, client scoping, messages), and the CMS (front matter, slug and image-name rules, adapter behaviour).

Lint with `ruff check app tests`. `ruff format` is not part of the gate; see
docs/local-development.md for why.

## Layout

```text
app/
  main.py            Litestar app, CORS, body limit, error envelope
  core/config.py     environment settings
  core/ssrf.py       outbound URL policy (every fetch, every redirect)
  core/security.py   rate limiter (in-process or Redis), admin key
  db.py              SQLAlchemy engine and the request-scoped session
  models/core.py     websites, audits, monitoring, tool runs, submissions
  models/studio.py   leads, clients, projects, milestones, deliverables, messages
  schemas/           request and response contracts (core, studio, cms)
  services/fetcher.py        safe HTTP client
  services/audit_service.py  Vector pipeline with stage updates
  services/monitor_service.py Signal checks, SSL, transitions, alerts
  services/notify.py         email (SMTP) and webhook channels
  services/contact_service.py intake storage and rule-based classification
  services/forge_tools.py    robots, sitemap, metadata, canonical, redirect tools
  services/studio_service.py the delivery workflow: stages, qualifying, scoping
  services/pagespeed.py      Core Web Vitals through PageSpeed Insights
  analyzers/         technical, seo, performance, accessibility, security,
                     links, content, ai visibility
  scoring/engine.py  documented scoring methodology
  workers/queue.py   RQ on Redis, or in-process pool (single instance)
  workers/scheduler.py APScheduler sweep for Signal
  routes/            vector, signal, forge, contact, studio, cms
  integrations/zoho/ CRM and WorkDrive scaffold (off by default)
  cms/               Git-backed CMS: documents, local and GitHub adapters
alembic/             migrations
scripts/             seed_studio.py
tests/
index.py             Vercel entry point (see docs/vercel-deployment.md)
```

## Endpoints

```text
POST /api/vector/audits                      start an examination (202, returns id)
GET  /api/vector/audits/{id}                 status and stages
GET  /api/vector/audits/{id}/results         scores, issues, prescription, methodology
GET  /api/vector/websites/{host}/audits      completed audits for one host (history)

POST /api/signal/targets                     register a target   (X-Admin-Key)
GET  /api/signal/targets                     public dashboard data
GET  /api/signal/targets/{id}                one target
GET  /api/signal/targets/{id}/events         checks and events
POST /api/signal/targets/{id}/check          run a check now     (X-Admin-Key)
GET  /api/signal/events                      recent non-check events

GET  /api/forge/tools
POST /api/forge/{tool}/run                   robots-validator, sitemap-validator, metadata-checker, canonical-checker, redirect-checker

GET  /api/contact/project-types
POST /api/contact                            structured intake
GET  /api/contact/submissions                (X-Admin-Key)

GET  /api/health
```

Errors always look like `{"error": {"code": "...", "message": "..."}}`; validation errors add `fields`.

## Deploy

The static site lives on Vercel. To run this service in production instead of the Worker, any long-running host (Render, Fly, a VM) works:

- Build: `pip install -r requirements.txt`
- Release: `alembic upgrade head`
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Provide PostgreSQL as `DATABASE_URL` (`postgresql+psycopg://…`) and, if you run more than one instance, Redis as `REDIS_URL` with an `rq worker vector` process.
- Set `CORS_ORIGINS` to the site origin and `ADMIN_KEY` to a long random string.
- Optional: set `PAGESPEED_API_KEY` (Google Cloud, PageSpeed Insights API enabled) to add Core Web Vitals to Vector reports. Without it, reports state that Core Web Vitals were not measured. Anonymous PageSpeed calls share a quota that is routinely exhausted, so the key is required rather than best-effort.

Then set `LRACDIM_API_BASE=https://<api host>` in the Vercel project so the frontend build points at it.

### Current production

Nothing. On 2026-10-19 the public site's API moved to the Cloudflare Worker in
[`worker/`](../worker/README.md), which serves the same endpoints and response
shapes from a D1 database on the Workers free plan. The Railway service and its
Postgres held no data at the time of the move (every table was empty). This
Python service stays the reference implementation, runs the studio dashboard
locally, and can be deployed again with the steps above if a long-running host
is ever needed.

`DATABASE_URL` accepts the plain `postgresql://` form hosted databases hand
out; `app.db.normalize_url` adds the psycopg driver. Until a Postgres service
is attached and referenced as `DATABASE_URL=${{Postgres.DATABASE_URL}}`, the
service falls back to SQLite on the container disk, which resets on every
deploy.
