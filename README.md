# LRACDIMENSION

The engineering environment of **John Carl Dimatulac**: web systems, automation, and the tools behind them, organised as five working dimensions.

```text
01 WORK      projects and systems            /work/
02 VECTOR    web clinic (examination)        /vector/
03 SIGNAL    analytics and monitoring        /signal/
04 FORGE     web and developer tools         /forge/
05 RESEARCH  engineering notes and studies   /research/
```

Two parts:

- **Site** — Eleventy 3, Nunjucks, vanilla JavaScript. Static, deployed on Vercel. Everything public is generated from `src/_data/` and markdown.
- **API** — Python, FastAPI, SQLAlchemy, PostgreSQL, RQ/Redis (optional), APScheduler. Runs Vector audits, Signal monitoring, Forge server tools, and intake. See [`backend/README.md`](backend/README.md).

The site works without the API (each dimension states what is unavailable). With `LRACDIM_API_BASE` set at build time, the dimensions run against the engine.

## Commands

```bash
npm install                  # site dependencies (+ puppeteer-core for QA)
npm run dev                  # http://localhost:8099 with live reload
npm run build                # static output to _site/
npm run lint                 # parse every script, catch merge markers and tabs
npm run format               # lint plus trailing-whitespace check
npm test                     # browser QA against a running site (and API if reachable)

npm run backend:install      # venv + requirements
npm run backend:migrate      # alembic upgrade head
npm run backend:dev          # API on :8000 (scheduler and in-process worker included)
npm run backend:test         # pytest
```

Local development: run `backend:dev` and `dev` together. `site.js` points the site at `http://localhost:8000` unless `LRACDIM_API_BASE` is set or the build runs on Vercel.

## Structure

```text
eleventy.config.js              build config, passthrough, filters
vercel.json                     redirects, rewrites (/vector/audit/:id, /signal/site/:id), headers
src/
  _data/
    dimensions.js               the five dimensions: index, name, identity, verbs, status
    site.js                     identity, nav, contact, apiBase
    projects.js                 project facts (source: résumé); portfolio.js adapts them for pages
    forgeTools.js               tool registry (client vs server)
    career.js services.js process.js industries.js method.js
  _includes/layouts/            base, post, demo
  _includes/partials/           header, footer, dimension-head, vector-body, forge/*, …
  assets/js/
    api.js                      API client, error envelope
    vector.js                   examination flow (engine mode + browser fallback)
    signal.js                   monitoring dashboard and target page
    forge.js                    client tools and server-tool runner
    start.js                    intake → /api/contact (fallback: lead webhook)
    studio.js                   nav, motion, dimension module loading
    system-scene.js             Three.js layer scene (home)
  index.njk work.njk project.njk vector.njk vector-audit.njk signal.njk signal-site.njk
  forge.njk forge-tool.njk research.njk research/*.md about.njk services.njk process.njk
  start.njk contact.njk resume.njk
backend/                        FastAPI service (see its README)
tests/                          browser-qa.mjs, lint.mjs
```

## Deploy

**Site (Vercel).** Import the repo. `vercel.json` sets the build command, output directory, trailing slashes, redirects for retired URLs, rewrites for addressable reports and targets, security headers, and `noindex` for `/demos/`. Set `LRACDIM_API_BASE` to the API origin.

**API.** Deployed from `backend/` to Railway at `https://api-production-6e09c.up.railway.app` (see `backend/README.md`). Any host works: Railway, Render, Fly. Provide `DATABASE_URL` (PostgreSQL), `ADMIN_KEY`, `CORS_ORIGINS`, optional `REDIS_URL`, SMTP or `NOTIFY_WEBHOOK` for notifications. The `Procfile` defines release (migrations), web, and worker processes.

## Content rules

- Every project fact traces to the résumé; labels keep client work, internal tools, demos, and concepts distinct.
- No metric appears anywhere unless it was measured: Vector prints its methodology with every report, Signal shows only stored checks, and empty states say so.
- Research entries carry `title`, `description`, `topic`, `category`, `technologies`, `date`, and `order`; reading time, Open Graph, and Article structured data are generated.

## SEO

Canonical, Open Graph, Twitter cards, JSON-LD (Person + WebSite; Article on posts; BreadcrumbList on posts and projects), sitemap of every public page, robots.txt. Report and target pages are `noindex`.
