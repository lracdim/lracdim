# LRACDIMENSION API

FastAPI service behind the Vector, Signal, Forge, and intake dimensions.

## Setup

```bash
cd backend
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

Interactive docs: http://localhost:8000/api/docs

## Test

```bash
pytest -q
```

The suite is offline: fetches, DNS-dependent checks, and SSL are stubbed. It covers the SSRF policy, every analyzer, the scoring engine, the audit lifecycle (queued → running → completed/failed), monitoring status transitions and incidents, server tools, intake validation and the honeypot, rate limiting, and the body-size limit.

## Layout

```text
app/
  main.py            FastAPI app, CORS, body limit, error envelope
  core/config.py     environment settings
  core/ssrf.py       outbound URL policy (every fetch, every redirect)
  core/security.py   rate limiter (in-process or Redis), admin key
  db.py, models.py   SQLAlchemy engine and entities
  schemas.py         request/response contracts
  services/fetcher.py        safe HTTP client
  services/audit_service.py  Vector pipeline with stage updates
  services/monitor_service.py Signal checks, SSL, transitions, alerts
  services/notify.py         email (SMTP) and webhook channels
  services/contact_service.py intake storage and rule-based classification
  services/forge_tools.py    robots, sitemap, metadata, canonical, redirect tools
  analyzers/         technical, seo, performance, accessibility, security, links, content
  scoring/engine.py  documented scoring methodology
  workers/queue.py   RQ on Redis, or in-process pool (single instance)
  workers/scheduler.py APScheduler sweep for Signal
  api/routes/        vector, signal, forge, contact
alembic/             migrations
tests/
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

The static site lives on Vercel; this service runs separately. Railway, Render, or Fly all work:

- Build: `pip install -r requirements.txt`
- Release: `alembic upgrade head`
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Provide PostgreSQL as `DATABASE_URL` (`postgresql+psycopg://…`) and, if you run more than one instance, Redis as `REDIS_URL` with an `rq worker vector` process.
- Set `CORS_ORIGINS` to the site origin and `ADMIN_KEY` to a long random string.

Then set `LRACDIM_API_BASE=https://<api host>` in the Vercel project so the frontend build points at it.
