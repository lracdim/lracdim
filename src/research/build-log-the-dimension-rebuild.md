---
title: "Build log: turning a portfolio into five dimensions"
description: "How LRACDIMENSION was restructured from a conventional portfolio into Work, Vector, Signal, Forge, and Research without throwing away the existing site."
topic: Build log
date: 2026-09-14
order: 0
---

## Problem

The site was a competent freelancer portfolio: a hero, selected work, services, a process page, articles, and a contact form. It described capability. It did not demonstrate it. A visitor had to take the claims on trust, and the one interactive feature, a website diagnostic, was hidden behind a modal.

## Hypothesis

If the portfolio is organised as capability environments the visitor can use, rather than pages they read, the site itself becomes evidence. Five environments were chosen because each maps to a claim I want to prove: experience, analytical engineering, monitoring and data systems, practical development, and engineering thought.

## Approach

Refactor, not rebuild. The Eleventy architecture, the project data, the research collection, the intake form, and the diagnostic engine all stay. The change is information architecture: a single `dimensions` data file drives the navigation, the footer, the home page selector, and the head of every dimension page. Content is migrated into the new structure and rewritten only where the old copy no longer fits.

## Implementation

- **Work** keeps all fifteen projects. Each case study is now five sections: Problem, System, Architecture, Implementation, Result. Where the facts support it, a "what was difficult" note is added; where they do not, it is left out rather than invented.
- **Vector** takes the browser diagnostic out of the modal and gives it a page. The same engine now returns, for each issue, the evidence, why it matters, the prescription, and the expected impact. The report states its mode: live document or modelled profile.
- **Forge** ships five client-side tools that were cheap to build and are genuinely useful: JSON formatter, URL parser, slug generator, timestamp converter, text counter. Nothing pasted leaves the browser.
- **Signal** is a page that says what the system will measure and shows no metrics, because there are none yet. An honest empty state was preferred to a decorative dashboard.
- **Research** absorbs the existing articles and this build log.

## Result

The build produces 55 static pages. No backend was added. The nav communicates the five dimensions in one line. Every dimension has something to open, read, or run, except Signal, which says so.

## Trade-offs

- Vector's browser engine can only read what a browser can fetch. Without the scanner worker it models a profile from the URL, which is clearly labelled but still weaker than a real crawl. The Python engine is the next phase.
- Two of the five dimensions are thin at launch. Shipping them as honest placeholders was chosen over hiding them, because the architecture is the point and the empty states are truthful.
- The Three.js hero was kept. It communicates the layer model the case studies use, but it is the one element that risks reading as decoration.

## Conclusion

The first phase cost a day of restructuring and no new infrastructure, and it changed what the site is for.

## Since then

The second phase, completed the same week, added the FastAPI engine: seven analyzers behind Vector with stored reports and history, scheduled monitoring behind Signal with real events, five server-side Forge tools, and an intake API. The two research entries that followed, [on the scoring engine](/research/designing-a-website-health-scoring-engine/) and [on the crawler's safety policy](/research/building-a-safe-website-crawler/), document the parts that were hardest to get right.
