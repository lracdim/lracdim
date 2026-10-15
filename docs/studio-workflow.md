# The studio workflow

How an enquiry on the public site becomes a client project, and which part of
the system owns each step.

```
website diagnostic / intake form   (marketing)
  → POST /api/contact              (api: stores the submission)
  → lead opened                    (api: studio_service.open_lead_from_submission)
  → admin review                   (dashboard: /admin/leads)
  → discovery call
  → qualified | declined
  → proposal
  → contract and deposit
  → client and project created     (api: studio_service.qualify_lead)
  → onboarding → strategy → design → development → QA and approval → launch
  → maintenance | archived
```

The first stages belong to the **lead**. Qualifying creates a **client** and a
**project**, and everything after that is tracked on the project.

## Stages and transitions

`api/app/models/studio.py` defines the stage list; `studio_service.ALLOWED_TRANSITIONS`
defines what may follow what. The API refuses anything else with
`409 bad_transition`, so a lead cannot jump from a form submission to launch.
`GET /api/studio/workflow` returns both, which is how the dashboard builds its
stage controls without hard-coding names.

`declined` and `archived` are terminal, with one exception: a declined lead can
be reopened to `lead_review`.

## What qualifying does

1. Reuses the client with the same email address, or creates one.
2. Creates a project named after the company and the project type.
3. Adds the starter milestones: onboarding and access, web strategy, design,
   development, QA and approval, launch.
4. Records the stage change as a lead event, so the timeline keeps its shape.

## Who can see what

| Area | Guard | Scope |
| --- | --- | --- |
| Admin routes | `X-Admin-Key` header | everything |
| Client routes | `X-Client-Key` header | that client's own records only |

Client scoping lives in `studio_service.client_projects` and
`deliverables_for_client`, so no route can forget it. Asking for another
client's project returns `404 not_found`, never `403`: the API does not
confirm that someone else's id exists.

**Both checks are temporary.** They are marked `TODO:` in
`api/app/core/security.py` and `api/app/routes/studio.py`. Before the client
area is public they should become signed sessions with per-user roles, and the
dashboard's mock sign-in should become a real credential form.

## Endpoints

```
GET    /api/studio/workflow                     the pipeline itself
GET    /api/studio/leads?stage=                 admin
GET    /api/studio/leads/{id}                   admin: lead, events, next stages
POST   /api/studio/leads/{id}/advance           admin: {to_stage, note}
POST   /api/studio/leads/{id}/qualify           admin: creates client + project
PATCH  /api/studio/leads/{id}/notes             admin
GET    /api/studio/clients                      admin
GET    /api/studio/projects?client_id=          admin
GET    /api/studio/projects/{id}                admin: project detail
PATCH  /api/studio/projects/{id}/stage          admin
POST   /api/studio/milestones/{id}/complete     admin
POST   /api/studio/projects/{id}/messages       admin
GET    /api/studio/me                           client
GET    /api/studio/me/projects                  client
GET    /api/studio/me/projects/{id}             client
GET    /api/studio/me/files                     client: deliverables
POST   /api/studio/me/projects/{id}/messages    client
```

## Sample data

```powershell
cd api
.venv\Scripts\python scripts\seed_studio.py
```

Eight leads spread across the pipeline, two of them qualified into clients with
projects, milestones, deliverables, and a short message thread. Every name and
address is fictional and every domain is an `example.com` subdomain. The script
refuses to run against a non-SQLite database unless `--force` is passed, and it
does nothing if leads already exist.

## Where Zoho fits

Nowhere, by default. The CRM integration mirrors a lead into Zoho when it is
switched on, and the studio database stays the system of record either way. See
`api/app/integrations/zoho/README.md`.
