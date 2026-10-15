# apps/dashboard

The LRACDIMENSION studio dashboard: an admin pipeline for the studio owner and a
client portal for clients, in one SolidJS single-page app.

- **Admin** sees the full pipeline: leads from the public site's diagnostic,
  projects, clients and the marketing site's content.
- **Client** sees only their own records: their project phase, milestone
  timeline, deliverables and a message thread with the studio.

It is a sibling of `apps/marketing` (the Eleventy public site) and shares its
visual language, but it is a separate app with its own `package.json` and its
own `package-lock.json`. There is no workspace, no monorepo tool and no shared
`node_modules`.

**Today it runs entirely on local mock data.** The data layer is already shaped
for the Litestar API that will live at `/api`, so each resource can be pointed
at the API without touching a single component.

## Stack

| Piece       | Choice                     |
| ----------- | -------------------------- |
| UI          | SolidJS 1.9                |
| Build       | Vite 7 + TypeScript 5.9    |
| Routing     | `@tanstack/solid-router`   |
| Server state| `@tanstack/solid-query`    |
| Styling     | Plain CSS, custom properties |

No component library, no CSS framework, no state-management library.

## Commands (Windows PowerShell)

```powershell
Set-Location X:\Github\lracdim\apps\dashboard

# Install (first time, or after pulling a dependency change)
npm install

# Development server with hot reload, on http://localhost:5174
npm run dev

# Type-check only
npm run typecheck

# Production build (type-checks first, then writes dist\)
npm run build

# Serve the production build locally
npm run preview
```

`npm run build` runs `tsc --noEmit && vite build`, so a type error fails the
build rather than shipping.

## Signing in

Authentication is **mocked**. `/login` lets you pick one of two accounts:

| Account              | Role   | Sees                                   |
| -------------------- | ------ | -------------------------------------- |
| John Carl Dimatulac  | admin  | Everything                             |
| Marguerite Okonkwo   | client | Only `cli_northfield` records          |

The chosen session is stored in `localStorage` under
`lracdim.dashboard.session` and nothing is verified. Signing out clears it.

## Routes

```
/login                        mock sign-in
/admin                        pipeline overview
/admin/leads                  lead table, filter, detail panel, stage actions
/admin/projects               projects with milestones and deliverables
/admin/clients                client list
/admin/content                content items, preview and editor
/client                       current phase, timeline, deliverables
/client/projects/:projectId   one project in full
/client/files                 every deliverable handed over
/client/messages              thread with the studio, read and compose
```

`/` redirects to the right home for your role, or to `/login`.

## Where the mock data lives

```
src/api/
  client.ts            fetch wrapper, MOCK flag, { code, message } errors
  mock/
    seed.ts            the fixtures: 8 leads, 3 clients, 4 projects,
                       12 messages, 6 content items (all fictional)
    store.ts           mutable in-memory copy; mutations land here and
                       survive until the page is reloaded
  resources/           one file per resource; the ONLY place that knows
                       whether data comes from the mock or the API
  hooks/               TanStack Query hooks; the only data entry point
                       components are allowed to import
```

The rule that keeps this clean: **components import hooks, hooks call
resources, resources choose mock or API.** No component imports `mock/`.

## Switching to the real API

1. Copy `.env.example` to `.env.local` and set `VITE_API_BASE` to the Litestar
   base URL, then set `VITE_USE_MOCK=false`.
2. In each file under `src/api/resources/`, delete the `if (MOCK) { ... }`
   branch. The `request()` call underneath it is already written against the
   expected endpoint.
3. Replace the mock auth in `src/lib/auth.ts` with the real session calls (see
   the TODO at the top of that file) and update `/login` accordingly.

Nothing in `src/components/` or `src/routes/` should need to change.

Endpoints the resource functions already assume:

```
GET    /api/leads?stage=            PATCH  /api/leads/{id}/stage
GET    /api/leads/{id}              POST   /api/leads/{id}/convert
GET    /api/clients?clientId=       GET    /api/clients/{id}
GET    /api/projects?clientId=      GET    /api/projects/{id}
GET    /api/messages?clientId=&projectId=
POST   /api/messages
GET    /api/content?collection=&status=
POST   /api/content                 PUT    /api/content/{id}
```

## TODOs for auth and server-side authorisation

These are the things that are deliberately not real yet. Each one is marked in
the source with `TODO(api)`, `TODO(cms)` or a `SECURITY:` comment.

**Authentication**

- `src/lib/auth.ts` — replace the localStorage signal with a real session:
  `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout`.
  The session cookie should be httpOnly; `src/api/client.ts` already sends
  `credentials: 'include'`.
- `src/routes/Login.tsx` — becomes a credential form. The role must come back
  from the server; this page must never decide it.

**Authorisation (the important one)**

- The route guards in `src/router.tsx` are a **UX convenience only**. Anyone can
  edit `localStorage` and load `/admin`. They stop a wrong-role visitor seeing a
  broken screen; they stop nobody from seeing data.
- Client scoping in `src/api/hooks/useClients.ts`, `useProjects.ts` and
  `useMessages.ts` passes the signed-in `clientId` into every query, and the
  mock resources filter on it. **The API must apply the same scoping
  server-side, derived from the session, and ignore any clientId sent by the
  client.** A client asking for another client's project must get the same
  answer as for a project that does not exist.
- `src/api/resources/messages.ts` — the message author is sent from the client
  today so the mock thread reads correctly. The API must take the author from
  the session and ignore `authorName` / `authorRole`.
- Lead conversion (`POST /api/leads/{id}/convert`) must create the client and
  the project in one transaction, and must be admin-only.

**Content**

- `src/api/resources/content.ts` — the CMS API is not connected. Saving an item
  should eventually trigger an Eleventy rebuild of `apps/marketing` and return
  enough information for the admin to see whether the public site has picked the
  change up.

## Design notes

Tokens live in `src/styles/tokens.css` and nowhere else: near-black ground
`#18191b`, surfaces `#1f2022`, hairline borders `#363739`, paper text `#f1f0eb`,
muted `#bfc0b7`, and one accent, signal gold `#e2d8a3`, used only for emphasis,
the current nav item and focus rings. System sans for prose, monospace for
labels, overlines and numbers (uppercase, letter-spaced, 11px). Flat surfaces,
square corners, no gradients and no drop shadows.

Accessibility and responsiveness are part of the contract, not a later pass:
visible focus rings everywhere, labelled form controls with `aria-invalid` and
`aria-describedby` wiring, sortable table headers that announce `aria-sort`, a
modal that traps focus and returns it, a skip link, and a layout that works from
375px up with a collapsible sidebar that becomes an overlay on small screens.
Every async view has a loading, an empty and an error state.
