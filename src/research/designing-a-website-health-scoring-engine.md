---
title: "Designing a website health scoring engine"
description: "How Vector turns findings into category scores and one health number, why deductions beat additive points, and what the weights mean."
topic: Engineering
category: Architecture
technologies: [Python, FastAPI, PostgreSQL]
date: 2026-09-14
image: /assets/img/research/scoring-engine.webp
imageAlt: "A tall gauge of stacked grey segments beside a gold rule, with three segments lifted away"
order: 0
---

## Problem

A website examination produces dozens of findings of different weight. Visitors want one number, then the reasons. The number has to be honest: derived from the findings, stable between runs of the same page, and impossible to inflate by the engine itself.

## Question

Can a scoring rule be simple enough to print with every report and still rank two sites sensibly?

## Approach

Three rules, written once in the engine and returned as text with every report.

1. **Category score.** Every category starts at 100. Each finding deducts a fixed amount by severity: critical 30, high 15, medium 8, low 3. The floor is 0. Nothing is added back for good behaviour. A category with no findings scores 100, which means "nothing we check for was wrong", not "perfect".
2. **Health score.** A weighted mean of the category scores. Technical 0.20, SEO 0.20, performance 0.15, accessibility 0.15, security 0.15, links 0.10, content 0.05. Content is lightest because its checks are the coarsest.
3. **Ranking.** Findings sort by severity, then by category weight, then by the order the analyzer reported them. The prescription is that list, de-duplicated by finding code, with each entry's recommendation as the action.

## Why deductions, not points

Additive scoring rewards the presence of things: a title, a description, a sitemap. It produces high scores for pages that have the checklist items and hide real problems. Deductive scoring starts from "no problem found" and only moves when there is evidence. It also makes every point of the score traceable to a finding the visitor can read.

## Implementation

Analyzers return findings; they do not score. The scoring module is the only place that knows deduction values or weights, and its docstring is the methodology text. The audit service stores the category scores, the health score, the ranked issues, and the prescription as rows, so a report can be re-read without re-running anything.

Tests pin the arithmetic: an empty category is 100, a critical plus a high is 55, five criticals floor at 0, and a technical 0 with an SEO 100 gives a health of 50.

## Results

On this site's own home page the engine reports health in the 80s: the findings are a missing Content Security Policy and a few images without dimensions. On a page with no HTTPS, no title, and a noindex tag, technical, SEO, and security each lose 30 or more and the health drops below 50. The ranking puts the noindex first because it stops indexing outright.

## Trade-offs

- Severity is assigned by the analyzer author, not learned. That is deliberate: the reasoning is readable.
- A category with many low findings can score worse than one with a single high. The prescription order corrects the priority even where the numbers do not.
- Performance is a document-level read, not Core Web Vitals. Its weight is set accordingly and its metrics say so.

## Conclusion

A scoring rule that fits in a paragraph, ships with the report, and is pinned by tests is worth more than a cleverer one that cannot be explained.
