---
title: Colophon
description: "How this site is built: the stack, the content pipeline, and where each part is deployed."
---
<section class="shell portfolio-section page-intro">
  <p class="overline">Colophon</p>
  <h1>How this site<br>is built.</h1>
  <p>This page is authored as Markdown in the repository's content directory and rendered by Eleventy at build time, like every other page under the content pipeline.</p>
</section>
<section class="shell portfolio-section prose">

## The stack

The public site is Eleventy with Nunjucks templates and vanilla JavaScript, deployed on Vercel. The engine behind Vector, Signal, Forge, and the intake form is a Python API built with Litestar and SQLAlchemy, deployed separately with PostgreSQL. The studio dashboard is a SolidJS application using TanStack Router and TanStack Query.

## The content pipeline

Pages, projects, services, and articles are Markdown files with front matter, committed to the repository. Editing one is a commit, and a merge to the main branch is what publishes it. There is no external content database to keep in sync, and the history of every page is the history of the repository.

## Deployment

The marketing site, the dashboard, and the API deploy independently from the same repository. Each has its own build and its own environment, so a change to one never forces a redeploy of the others.

</section>
