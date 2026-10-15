---
slug: lracdimension
name: LRAC Dimension
org: This site
status: live
kind: Personal project
category: Engineering environment
role: 'Design, front end, backend, and operations'
summary: >-
  This site: an Eleventy content layer over a FastAPI and PostgreSQL engine.
  Vector examines websites with eight analyzers, Signal monitors targets on a
  schedule, Forge runs client and server tools, and the intake form posts to the
  same API.
context: >-
  A portfolio that only described capability. The rebuild turns it into an
  engineering environment where the systems can be used: website examination,
  monitoring, tools, and structured intake.
constraints: >-
  The public site had to stay static and fast on Vercel. The engine had to run
  somewhere else, so every dimension needed an honest fallback when the API is
  absent. No metric could be shown unless it was measured.
approach: >-
  Eleventy generates every public page from data files and markdown. Interactive
  dimensions load small vanilla JavaScript modules that call a FastAPI service.
  Audits run on a job queue (RQ on Redis, or an in-process pool on a single
  instance), analyzers are independent modules, a documented scoring engine
  derives scores from findings, and PostgreSQL stores websites, audits, results,
  issues, prescriptions, monitoring targets, events, tool runs, and submissions.
decisions: >-
  Eleventy stays the content layer instead of a React rewrite because none of
  these interfaces needed React. Python owns everything that fetches other sites
  so one SSRF policy covers Vector, Signal, and Forge. Scores are deducted from
  findings only, with the methodology returned in every report.
challenge: >-
  Keeping the public site static while the dimensions are real applications. The
  answer was one small API client, page-level modules loaded only where their
  root element exists, and an explicit not-connected state on every dimension.
result: >-
  Live. The engine ships with 43 backend tests covering the SSRF policy, every
  analyzer, scoring, the audit lifecycle, monitoring transitions, tools, intake,
  rate limiting, and body limits, plus a scripted browser QA pass across the
  dimensions.
lessons: >-
  An honest empty state beats a decorative dashboard. Signal shipped as a page
  that said nothing was measured until the first stored check existed.
stack:
  - Eleventy
  - Vanilla JS
  - Three.js
  - FastAPI
  - PostgreSQL
  - Redis / RQ
  - Vercel
facts:
  - Five dimensions on one data model
  - >-
    Vector: eight analyzers, Core Web Vitals, AI visibility, scoring engine,
    prescriptions, history
  - 'Signal: scheduled checks, SSL, events, alerts'
  - 'Forge: six client tools, five server tools'
  - Structured intake with rule-based classification
img: /assets/img/projects/lracdimension.svg
featured: false
---

