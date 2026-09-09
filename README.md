# LRACDIMENSION

Systems portfolio of **John Carl Dimatulac** — web developer and automation engineer.
Built with [Eleventy](https://www.11ty.dev/) 3. No bundler, no framework, no runtime dependencies.

## Commands

```bash
npm install
npm run dev     # http://localhost:8099 with live reload
npm run build   # static output to _site/
```

## Structure

```
eleventy.config.js      Build config, passthrough copy, filters
src/
  _data/                Content lives here — edit these, not the templates
    site.js             Name, nav, socials, contact
    builds.js           Portfolio projects
    capabilities.js     Core disciplines + system patterns
    operations.js       Work history, process, brands
    logs.js             Execution log entries
    industries.js       Industry blueprints — one object per sector
    method.js           "How I read a system" — the five audit questions
    stats.js            Headline numbers
  _includes/
    layouts/base.njk    HTML shell, meta, JSON-LD
    partials/           header, footer, preloader, terminal, diagnostic
  assets/
    css/main.css        Whole design system, one file
    js/
      main.js           Preloader, header, drawer, scroll reveal, hero lines
      modal.js          Diagnostic modal controller
      terminal.js       Interactive console
      analyzer/
        engine.js       Metrics, scorers, bottleneck detection
        service.js      Fetch + fallback profiling
  index.njk builds.njk capabilities.njk operations.njk logs.njk terminal.njk
  industries.njk        Catalogue index
  industry.njk          Paginated — generates /industries/<slug>/ per sector
```

To change site copy, edit the files in `src/_data/`. The templates read from them.

## Design

The layout and visual language follow **[sstr.tech](https://sstr.tech/en/)**
(Awwwards Site of the Day). Tokens measured from the live site, with the signal colour swapped from their
orange to sand:

| Token | Value | Notes |
| --- | --- | --- |
| `--ink` | `#18191b` | Dark bands, hero, header, footer |
| `--paper` | `#eff0f1` | Light bands |
| `--signal` | `#e2d8a3` | Signal sand — on dark surfaces |
| `--signal` (light bands) | `#7d6f33` | Deeper olive step — on paper |
| `--on-signal` | ink / white | Whatever sits on a signal plate |
| `--cut` | `0.71rem` | Octagon chamfer depth |

The signal colour is surface-dependent. `#e2d8a3` reads at 12.2:1 on `--ink`
but only 1.25:1 on `--paper`, so `.band` (light) redefines `--signal` to a
deeper step of the same hue at 4.4:1, and `.band--dark` restores the sand.
`--on-signal` flips with it — ink on the sand plate, white on the olive one —
so buttons stay legible on either surface. Change the two values and the whole
site retints.

Language rules carried over:

- **Dark/light band alternation** — `.band` / `.band--dark`, each declaring its
  own `--line` / `--dim` / `--faint` tokens so any component works on either.
- **Display type is uppercase at weight 400** with `-0.035em` tracking. Archivo
  stands in for their ABC Monument Grotesk.
- **`//` prefix** on every small label (`.label`), rendered via `::before`.
- **Chamfered octagon buttons** — the exact eight-point `clip-path` from their
  `.button__bg`, driven by `--cut`.
- **Risk states use `--amber`**, never the signal, so the accent colour never
  reads as "healthy" on something that is not.
- **Hairline grid cells** (`.cells`, `.cards`, `.stats`) rather than floating
  cards with shadows.

The content is entirely this portfolio's own — projects, capabilities, work
history, and execution logs for John Carl Dimatulac.

## Navigation

Four client-facing pages plus one CTA: **Work · Services · Process · About — Start a project.**
Secondary destinations (execution logs, the clinic demo, industry blueprints, the
website diagnostic) live in the footer only. Old URLs (`/builds/`, `/capabilities/`,
`/operations/`, `/industries/`) redirect on deploy.

## Deploy — Cloudflare Pages (recommended)

The site is a static build; the only moving parts are two optional integrations
configured in `src/_data/site.js`.

The canonical URL is `https://lracdimension.vercel.app` (`site.url` in
`src/_data/site.js`). Every canonical tag, Open Graph URL, sitemap entry, and
JSON-LD `@id` is derived from it, so change it in one place if the domain moves.

**Vercel (primary).** Push the repo to GitHub and import it in Vercel. `vercel.json`
already sets the build command (`npm run build`), the output directory (`_site`),
trailing slashes, the redirects for retired URLs, security headers, long-lived
caching for `/assets/`, and `noindex` for `/demos/`. Node 22 is read from `.nvmrc`.

**Cloudflare Pages or Netlify.** Same build command and output directory.
`src/_headers` and `src/_redirects` carry the equivalent rules and are copied
into the build.

### SEO checklist after the first deploy

- Submit `https://lracdimension.vercel.app/sitemap.xml` in Google Search Console.
- Confirm `/robots.txt` resolves and points at the sitemap.
- Test one article at `https://validator.schema.org/` (Article + BreadcrumbList)
  and the home page (Person + WebSite).
- New research articles are single markdown files in `src/research/` with
  `title`, `description`, `topic`, and `date` front matter; reading time,
  Open Graph, and structured data are generated.

### Live scanner (turns the diagnostic from modelled to measured)

```bash
cd workers/scan
npm install
npx wrangler login
npx wrangler deploy
```

Copy the deployed worker URL into `site.js → scanEndpoint`, rebuild, deploy.
Set `ALLOWED_ORIGINS` in `workers/scan/wrangler.toml` to your real domain
before you share the site — an empty value allows any origin.

The worker fetches the prospect's HTML server-side with SSRF guards (no
private or loopback targets, no raw IPs), an 8 s timeout and a 1.5 MB cap. It
stores nothing.

### Lead pipeline (n8n)

1. In n8n, add a **Webhook** node, method POST, respond immediately.
2. Copy its production URL into `site.js → leadWebhook`.
3. Rebuild and deploy.

Every diagnostic run and every `/start/` submission then POSTs JSON:

```json
{ "source": "diagnostic" | "start", "...fields", "page": "/start/",
  "submittedAt": "2026-09-01T…", "lastDiagnostic": { … } }
```

From the Webhook node, route wherever you like — Gmail, a sheet, your CRM, a
Slack alert. While `leadWebhook` is empty the site says so on the form and
keeps submissions in the visitor's browser rather than pretending they went
somewhere.

### Still to supply

| Item | Where |
| --- | --- |
| GitHub / LinkedIn URLs | `src/_data/site.js → social` (empty entries are not rendered) |
| Real project screenshots | replace the SVG plates in `src/assets/img/`, paths in `builds.js` / `logs.js` |
| Execution-log detail | `src/_data/logs.js` — three entries drafted strictly from the résumé; add specifics |

## Industry catalogue

`/industries/` lists ten sector blueprints; each generates its own page at
`/industries/<slug>/` from a single paginated template. Sectors covered:
freight & logistics, medical & dental clinics, law offices, security services,
construction, real estate, training providers, accounting, auto service, and
staffing.

Every blueprint carries the same six-part structure:

1. **Signals** — how you know the sector has this problem
2. **Where the work leaks** — named failure points with the mechanism
3. **What I build** — public-site modules and back-office/portal modules
4. **What stops being someone's job** — trigger → action automation rules
5. **What moves** — metrics as *typical baseline → target*
6. **Where we start** — the first build, integrations, and stack

**These are reference architectures, not case studies.** No figure on these
pages is a claim about past client results — each is a sector baseline paired
with the target a system of that shape is built to hit, and every page states
this above the fold of the metrics section. Delivered work with real measured
numbers stays on `/logs/` and `/operations/`.

To add a sector, append one object to `src/_data/industries.js`. The index card,
the detail page, the "other sectors" list, and the sitemap all pick it up with
no template changes.

## The diagnostic feature

`Analyze My Website` opens **System Diagnostic Protocol v1.0** — the one thing
taken from the Elimate React app (`X:\Github\elimate`), ported to vanilla ES
modules. Nothing else from that project was carried over. Three steps:
input → scanning → report.

The engine (`assets/js/analyzer/engine.js`) is a faithful port of the original
TypeScript: DOM depth, script/CSS/image counts, alt-text and `lang` coverage,
semantic landmarks; four scores (structure, load velocity, content density,
optimization) and a severity-ranked bottleneck list.

**One deliberate change from the original.** A browser cannot read the HTML of a
third-party origin — CORS returns an opaque response with no body. The original
silently fell back to synthetic markup and presented the result as a real scan.
This port keeps the fallback but tags the report `mode: 'profiled'` and says so
in the UI: *"Structural profile — the browser could not read this origin directly
(CORS). Figures are modelled from the URL signature, not measured."* A live fetch
that does succeed is tagged `mode: 'live'` and reported as measured.

To make every scan live, put a small server-side proxy in front of the fetch in
`assets/js/analyzer/service.js` and point it at your own endpoint.

## Notes

- The previous Vite + React version is preserved in `_archive/vite-react/`.
- Lead capture and the live scanner are wired but unconfigured — see **Deploy**.
- Project images are local SVG plates — swap for real screenshots.
