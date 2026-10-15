# Local development

Every command below is Windows PowerShell, run from the repository root unless
the snippet changes directory. Each application is installed and run on its
own: there is no root install step and no workspace tool.

## Prerequisites

| Tool | Version | Used by |
| --- | --- | --- |
| Node.js | 20 or newer | marketing, dashboard |
| npm | bundled with Node | marketing, dashboard |
| Python | 3.11 or newer | api |
| Chrome | current | marketing browser QA only |

## 1. API (Litestar)

```powershell
cd api
python -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Open `.env` and set at least `ADMIN_KEY` to a long random string. SQLite is
the default database, so nothing else is required to start.

```powershell
$env:DATABASE_URL = "sqlite:///./studio-dev.db"
.venv\Scripts\python -m alembic upgrade head
.venv\Scripts\python scripts\seed_studio.py      # sample leads, clients, projects
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

Check it: <http://localhost:8000/api/health> returns
`{"ok":true,"queue":"thread","database":"sqlite"}`.

The seed script prints a client access key per seeded client. That key is what
the client area sends as `X-Client-Key` while the temporary authentication is
in place.

Tests and lint:

```powershell
cd api
.venv\Scripts\python -m pytest -q
.venv\Scripts\python -m ruff check app tests
```

`ruff format` is deliberately **not** part of the gate. The ported code uses
long single-line findings and schema definitions on purpose; reformatting
would churn them without making them clearer.

## 2. Marketing site (Eleventy)

```powershell
cd apps\marketing
npm install
npx @11ty/eleventy --serve --port=8099
```

The site reads `/content` through a mirror step that runs before every build,
so editing a file in `content/blog` or `content/pages` reloads the browser.

With the API running on port 8000, Vector, Signal, Forge's server tools, and
the intake popup work end to end; without it, each one degrades to its stated
offline behaviour.

**The intake popup.** Every "Hire me" and "Start a project" control opens a
three-step modal (`src/_includes/partials/start-modal.njk`, behaviour in
`src/assets/js/start-modal.js`) instead of navigating anywhere. To open it
without clicking, visit `http://localhost:8099/?start=1`; the parameter is
removed from the address bar once the modal is open. What a visitor has typed
is kept as a draft in `sessionStorage` until the intake is sent or the tab
closes. There is no `/start/` page: that address, and `/contact/`, redirect to
`/?start=1` (see `vercel.json` and `src/_redirects`). To add a new trigger, give
any link or button the `data-open-start` attribute.

Checks:

```powershell
cd apps\marketing
npm run lint     # markup, JS syntax, formatting rules
npm test         # browser QA; the site must be served first
```

## 3. Dashboard (SolidJS)

```powershell
cd apps\dashboard
npm install
npm run dev          # http://localhost:5173
npm run build        # typecheck, then production build
```

The dashboard ships with mock data (`src/api/mock/`) and a mock sign-in, so it
runs with no API at all. To point it at the local API, copy `.env.example` to
`.env.local`, set `VITE_API_BASE=http://localhost:8000`, and switch the `MOCK`
flag in `src/api/client.ts`.

## Running everything at once

The repository ships a preview configuration at `.claude/launch.json` with
both web apps. Started by hand, the three commands are:

```powershell
# terminal 1
cd api;            .venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
# terminal 2
cd apps\marketing; npx @11ty/eleventy --serve --port=8099
# terminal 3
cd apps\dashboard; npm run dev
```

## Database changes

Models live in `api/app/models/`. After editing one:

```powershell
cd api
.venv\Scripts\python -m alembic revision --autogenerate -m "what changed"
# read the generated file in alembic\versions and correct it by hand
.venv\Scripts\python -m alembic upgrade head
```

Autogenerate is a first draft, not an answer: check the column types and any
index or constraint it invented before committing.

## Environment variables

`api/.env.example` lists every name the API reads, grouped by purpose:
database, CORS, admin key, rate limits, notifications, PageSpeed, Zoho, and
the CMS. Values belong in `.env` (ignored) or in the host's environment
settings. No secret belongs in this repository.
