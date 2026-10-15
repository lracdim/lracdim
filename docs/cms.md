# The Git-backed CMS

Content is Markdown with YAML front matter, committed to this repository.
There is no content database, no external service, and no second source of
truth. The history of a page is the history of the repository.

```
content/
  pages/      standalone pages, published at /<slug>/
  projects/   case studies, published at /work/<slug>/
  services/   service descriptions, rendered on /services/
  blog/       research articles, published at /research/<slug>/
public/images/  images referenced from Markdown, served at /images/<name>
```

The file name is the slug: `content/blog/my-post.md` becomes
`/research/my-post/`.

## How the site reads it

Eleventy only reads its own input directory, so `apps/marketing/lib/content-sync.js`
mirrors `content/blog` and `content/pages` into `src/research` and `src/pages`
before every build and on every watch pass. Those mirrors are generated and
git-ignored; `/content` is the source.

Projects and services are data rather than prose: their front matter carries
every field the templates use, and `apps/marketing/lib/content-data.js` loads
them directly. The Markdown body is unused for those two types today.

A document with `draft: true` in its front matter is skipped by the loader, so
drafts can be committed without publishing them.

## How the dashboard writes it

The dashboard's Content area calls the API, which writes through whichever
adapter is configured:

| `CMS_ADAPTER` | Behaviour | Use |
| --- | --- | --- |
| `local` (default) | writes the working tree; you commit the result | development |
| `github` | creates a branch, commits through the GitHub API, opens a pull request | production |

The GitHub adapter never commits to the production branch. Publishing is
merging the pull request: GitHub notifies Vercel, Vercel rebuilds the
marketing project, and the change goes live. The API itself never deploys
anything.

Endpoints, all admin-only:

```
GET    /api/cms/types
GET    /api/cms/{type}
GET    /api/cms/{type}/{slug}
POST   /api/cms/{type}           create
PUT    /api/cms/{type}/{slug}    update
DELETE /api/cms/{type}/{slug}
POST   /api/cms/images           base64 upload into public/images
```

## Images

Images are committed to this repository under `public/images` and referenced
from Markdown by their served path:

```markdown
![A gauge of stacked grey segments](/images/scoring-engine.webp)
```

The upload endpoint takes base64 so it is the same JSON call as everything
else. Names are lowercased and restricted to letters, numbers, hyphens, and
underscores plus an allowed extension (`png`, `jpg`, `jpeg`, `webp`, `svg`,
`gif`, `avif`), with an 8 MB ceiling. The GitHub adapter adds the image on the
same kind of branch and pull request as a content change.

## Writing a document by hand

```markdown
---
title: A short, specific title
description: One sentence that would read well in a search result.
date: 2026-10-15
topic: Engineering
image: /images/example.webp
imageAlt: What the image shows, for someone who cannot see it
---

The body is ordinary Markdown.
```

Front matter keys are free-form; the templates read the ones they know. Keep
`title` and `description` on everything.

## Limits worth knowing

- The GitHub adapter is a skeleton. It is wired end to end but has only been
  exercised against the API's own validation, never a live repository, and it
  has no conflict handling beyond GitHub's blob sha check.
- The CMS does not render Markdown previews server-side; the dashboard shows
  the raw body.
- Deleting a document removes the published page on the next build. There is
  no redirect handling; add one in `apps/marketing/vercel.json` if the URL was
  public.
