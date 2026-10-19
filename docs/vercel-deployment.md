# Deploying from this repository

Three applications, three Vercel projects, one repository. Each project sets a
different **Root Directory**, so a push only rebuilds the projects whose files
changed.

| Project | Root directory | Build | Output |
| --- | --- | --- | --- |
| Marketing site | `apps/marketing` | `npm run build` | `_site` |
| Dashboard | `apps/dashboard` | `npm run build` | `dist` |
| API | `api` | Python runtime, entry `index.py` | serverless function |

Each directory already contains the `vercel.json` with those settings, so the
import flow mostly needs the root directory and the environment variables.

## 1. Marketing site

1. New Project, pick this repository, set Root Directory to `apps/marketing`.
2. Environment variables:

   | Name | Value |
   | --- | --- |
   | `LRACDIM_API_BASE` | the API's public origin: the Cloudflare Worker, `https://lracdim-api.lracdim.workers.dev` (see `worker/README.md`). It must also appear in `connect-src` in `apps/marketing/vercel.json` |
   | `LRACDIM_GA_ID` | Google Analytics measurement id, optional |

3. Deploy. The build mirrors `/content` into the Eleventy input, so content
   committed anywhere in the repository is published by this project.

Because the content lives outside `apps/marketing`, set **Ignored Build Step**
to rebuild when either the app or the content changes:

```bash
git diff --quiet HEAD^ HEAD -- apps/marketing content public || exit 1
```

Vercel builds when that command exits non-zero.

## 2. Dashboard

1. New Project, same repository, Root Directory `apps/dashboard`.
2. Environment variable `VITE_API_BASE` pointing at the API origin.
3. Deploy. `vercel.json` rewrites every path to `index.html` so the client
   router handles deep links.

The dashboard is private in intent but public in reach: anyone with the URL
loads it. Until real authentication replaces the mock session, put Vercel
password protection (Project, Settings, Deployment Protection) in front of it.

## 3. API

The public site's API is the Cloudflare Worker in `worker/` (free plan, D1
database, a 5-minute Cron Trigger for Signal), deployed with `npm run deploy`
from that folder; see [worker/README.md](../worker/README.md). It is not a
Vercel project.

The Python API in `api/` is the reference implementation and the dashboard's
local backend. It does not fit Vercel's serverless functions (APScheduler needs
a long-lived process and an audit outlasts the free function limit), so if it
ever serves production again it belongs on a long-running host, with the
`Procfile` there: migrations first, then uvicorn.

Environment variables the Python API expects when it runs as a server:

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `ADMIN_KEY` | long random string guarding the admin routes |
| `CORS_ORIGINS` | comma-separated list: the marketing and dashboard origins. Include `https://www.lracdimension.online`: the bare domain and `lracdimension.vercel.app` redirect there, and a missing origin makes every form POST fail the CORS preflight |
| `PAGESPEED_API_KEY` | Core Web Vitals in Vector reports, optional |
| `NOTIFY_WEBHOOK` / `SMTP_*` | where intake and monitoring alerts go, optional |
| `RESEND_API_KEY`, `NOTIFY_EMAIL` | intake and monitoring alerts by email through Resend, optional |
| `RESEND_FROM`, `RESEND_AUTOREPLY` | sender address (needs a verified Resend domain) and visitor confirmation emails, optional |
| `CMS_ADAPTER` | `local` or `github` |
| `GITHUB_REPO`, `GITHUB_BRANCH`, `GITHUB_TOKEN` | the GitHub CMS adapter |
| `ZOHO_*` | Zoho integration, off unless `ZOHO_ENABLED=true` |

## Order of deployment

The marketing site bakes the API origin into its HTML at build time, so deploy
the API first, then set `LRACDIM_API_BASE` and deploy the site. Changing the
API origin later means rebuilding the marketing project.

## What is not automated

Nothing in this repository deploys itself, creates projects, or changes DNS.
Domains, Vercel projects, and the production database are set up by hand once.
