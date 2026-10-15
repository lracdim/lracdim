# LRACDIMENSION

The studio platform of John Carl Dimatulac: a public marketing site, a studio
dashboard, and the API behind both. One repository, three independently
deployable applications, plain npm and a Python virtual environment. No
workspace tool, no monorepo orchestrator.

```
apps/marketing     Eleventy public site (lracdimension.online)
apps/dashboard     SolidJS studio dashboard (admin + client portal)
api                Litestar API: website engine, studio workflow, CMS
content            Git-backed CMS: Markdown with front matter
public/images      CMS-managed images, committed to this repository
docs               Local development and deployment guides
```

Each JavaScript app owns its `package.json` and `package-lock.json` and is
installed on its own. Nothing at the repository root installs or builds.

## What each part does

**Marketing** renders the public site: the five dimensions (Work, Vector,
Signal, Forge, Research), the free tools, and the project-intake popup behind
every "Hire me" button (a three-step modal; there is no separate intake page).
Pages, projects, services, and articles come from `/content`.

**API** runs the engine behind the public site (website audits, monitoring,
server-side tools, intake) and the studio workflow behind the dashboard
(leads, clients, projects, milestones, deliverables, messages), plus the CMS
read and write endpoints.

**Dashboard** is the private workspace: an admin area for the pipeline and a
client area where a client sees only their own project.

## Quick start (Windows PowerShell)

Three terminals, one per app.

```powershell
# 1. API
cd api
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env          # then edit .env
$env:DATABASE_URL = "sqlite:///./studio-dev.db"
.venv\Scripts\python -m alembic upgrade head
.venv\Scripts\python scripts/seed_studio.py
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

```powershell
# 2. Marketing site
cd apps\marketing
npm install
npx @11ty/eleventy --serve --port=8099
```

```powershell
# 3. Dashboard
cd apps\dashboard
npm install
npm run dev
```

Then: site at <http://localhost:8099>, dashboard at <http://localhost:5173>,
API at <http://localhost:8000/api/health>.

Full instructions, including the test and lint commands, are in
[docs/local-development.md](docs/local-development.md).

## Checks

```powershell
cd api;              .venv\Scripts\python -m pytest -q      # 89 tests
cd api;              .venv\Scripts\python -m ruff check app tests
cd apps\marketing;   npm run lint                           # markup and JS checks
cd apps\marketing;   npm test                               # browser QA (needs the site served)
cd apps\dashboard;   npm run build                          # typecheck + build
```

In PowerShell, run `$env:QA_SKIP_API = '1'; npm test` when browser QA must not
call the configured API or create an intake submission.

## Deployment

Three Vercel projects from this one repository, each with its own root
directory. See [docs/vercel-deployment.md](docs/vercel-deployment.md) for the
settings and environment variables, including why the API is better suited to
a long-running host than to serverless functions.

## Content

Editing the site is editing Markdown in `/content` and committing it. The
dashboard's Content area does the same thing through the API: the local
adapter writes the working tree, and the GitHub adapter opens a pull request.
Merging is what publishes. See [docs/cms.md](docs/cms.md).

## Conventions

- Secrets live in environment variables. `.env.example` files list the names
  with no values; `.env` is never committed.
- Database changes are Alembic migrations, generated and reviewed by hand.
- Temporary choices are marked `TODO:` in code with what should replace them.
  Authentication is the main one; see the dashboard and studio route modules.
