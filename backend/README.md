# Studio dashboard

`dashboard/` is the studio's admin and client portal (React 19, TypeScript,
TanStack Router/Query/Table, Vite). Its API is the Cloudflare Worker in
`../worker`, under `/api/studio` (code in `worker/src/studio/`, tables in
`worker/migrations/0005_studio.sql`). It was built against a Python engine
with generated demo data; that engine is no longer used, and nothing in the
dashboard is generated or seeded.

## What it shows, and where each number comes from

**Admin**

| Page | Shows | Source |
| --- | --- | --- |
| Command centre | MRR/ARR, revenue collected, receivables, pipeline, sites at risk, support SLAs, capacity, renewals, "needs your attention", activity | computed from the tables below (`views.js` → `adminOverview`) |
| Sales pipeline | Every lead, by stage | the site's project-intake form (`contact_submissions`) and Vector report requests (`report_requests`, with the examined site's health score); your stage, deal value and notes live in `studio_prospects`. Anonymised report requests are skipped. Convert creates the client (and adds its website to monitoring) |
| Website audit | Vector examination of any public URL: health score, eight category scores, issues with evidence and fix, the prescription; recent examinations | Vector (`worker/src/vector.js`). Studio examinations are unlisted, so they never appear on the public site's recent list |
| Clients | Accounts, MRR, health/visibility, hours, tickets, overdue, renewal, lifetime value, churn risk | `studio_clients` plus the rows below; churn risk is the engine's rule (paused, overdue, NPS ≤ 6, health < 65, renewal < 60 days) |
| Websites & monitoring | Status now, 30-day uptime, 7-day response time, incidents, SSL validity, health, visibility, last examination | uptime: Signal (checks every 5 minutes, rolled up hourly into `studio_uptime_days`); scores: the site's latest completed Vector examination; "visibility" is the mean of Vector's SEO and AI-visibility scores |
| Projects, Time & work log, Support desk, Billing & revenue, Activity log | Projects/milestones/approvals, retainer hours, tickets with SLA (urgent 2 h, high 8 h, normal 24 h, low 72 h), invoices with aging | what you enter; invoices are records only (no payments), and a sent invoice past its due date counts as overdue |
| Settings | Team, data sources, storage counts, care plans | `studio_users`, D1 counts, `worker/src/studio/plans.js` |

**Client portal** (each client sees only its own data; another client's ids
answer 404): overview, website health (the same Signal and Vector report; "Run
a fresh check" starts an examination, three an hour), projects and approvals,
work log, monthly report (uptime, incidents, work, support and month-end
scores), support requests, plan and billing.

**Not measured, shown as such:** SSL certificate and domain expiry dates (a
Worker cannot read a remote certificate or WHOIS). Signal still reports whether
the certificate is valid.

## What was dropped, and why

The Python engine filled these with generated numbers, and there is no real
source for them here, so they are gone from the API, the types and the UI:

- Portfolio analytics (admin) and the client Analytics page: traffic, sessions,
  conversions, sources, devices, countries, top pages.
- Keyword rankings and AI-citation tracking, and with them the SEO · AEO · GEO
  page. What is real there (Vector's SEO and AI-visibility scores and their
  issues) is on the Website health page.
- The client "Leads & enquiries" page and lead counts in overviews and reports.
- Core Web Vitals, backups and pending updates.
- Demo accounts on the sign-in page, the demo-accounts endpoint, the demo reset
  and the seed data. `/v1/diagnostics` too: the site posts to `/api/contact`.

To bring any of these back, connect a real source first (for example Google
Analytics or Search Console) and add it as a new view.

## Local development

Use an isolated local setup; never point local work at the live database.

```powershell
# 1. The Worker, with a local D1
cd worker
npm install
Copy-Item .dev.vars.example .dev.vars.local   # dummy values; keep REPORT_EMAIL_DRY_RUN=true (git-ignored)
npx wrangler d1 migrations apply lracdim-api --local
npx wrangler dev --env-file .dev.vars.local   # http://127.0.0.1:8787
```

Do not reuse a `.dev.vars` that holds live keys (Resend, webhooks) for this:
local Signal alerts and intake acknowledgements would send real email. With
`--env-file`, wrangler reads only that file and ignores `.dev.vars`, so an
existing `.dev.vars` can stay as it is.
Wrangler stores the local database under `worker/.wrangler/state`; delete that
folder to start again from empty.

```powershell
# 2. A local admin (prompts; nothing is printed)
npm run studio:create-admin -- --local

# 3. The dashboard
cd ..\backend\dashboard
npm install
npm run dev                                  # http://localhost:5174
```

In development the dashboard calls `/api/studio` on its own origin and Vite
proxies it to the Worker at `http://127.0.0.1:8787` (set `WORKER_URL` for
another address), so leave `VITE_API_URL` unset locally. `npm run typecheck`
and `npm run build` must pass before a deploy; `npm test` in `worker/` runs the
API tests (no network).

## Creating the admin

```bash
cd worker
npm run studio:create-admin
```

It asks for the email, the name and the password (typed twice, hidden),
hashes the password locally (PBKDF2-SHA256, 100,000 iterations) and runs one
`wrangler d1 execute lracdim-api --remote` that creates the admin or updates
its name and password. Neither the password nor the hash is printed or stored
anywhere else. Run it again to change the password; that signs the admin out
everywhere. Clients are never created this way: add a client in the dashboard
with "Invite the contact to the client portal" (or "Invite to portal" on the
client's page) and send them the link it shows. Links work once, for 7 days.

## Deploying

1. The Worker, migration first:

   ```bash
   cd worker
   npm run db:migrate:remote     # applies 0005_studio.sql
   npm run deploy
   npm run studio:create-admin
   ```

2. The dashboard, on Vercel or Cloudflare Pages: root `backend/dashboard`,
   build command `npm run build`, output `dist`, and the environment variable
   `VITE_API_URL=https://lracdim-api.lracdim.workers.dev/api/studio` (it is
   read at build time). It is a single-page app: route every path to
   `index.html` (Vercel: a rewrite of `/(.*)` to `/index.html`; Cloudflare
   Pages does this by default when there is no `404.html`).

3. Allow its origin: add it to `STUDIO_ORIGINS` in `worker/wrangler.jsonc`
   (comma-separated, next to `http://localhost:5174`) and `npm run deploy`
   again. Without it the browser blocks the dashboard's requests.

4. Check: sign in, open Settings (the data sources and your admin are listed),
   add a client website and see its first Signal check on its page.
