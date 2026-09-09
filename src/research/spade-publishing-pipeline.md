---
title: "Four n8n stages behind a WordPress blog"
description: "How the Spade publishing pipeline moves a topic through research, writing, and SEO generation before it reaches WordPress."
topic: Automation
date: 2026-09-09
order: 7
project: content-pipeline
---

Spade Security Services publishes long-form articles on its WordPress site. The pipeline that produces them is an n8n workflow with four stages, each with one job.

## The stages

1. **Researcher.** Takes the topic and gathers the context the article needs.
2. **Writer.** Turns that research into an article draft.
3. **SEO Generator.** Prepares the search-oriented parts of the post before it is published.
4. **WordPress publisher.** Delivers the prepared content to the WordPress site.

Each stage hands a single, structured payload to the next. That is what makes the workflow easy to reason about: when a post comes out wrong, the stage responsible is obvious from where the payload changed.

## Why a pipeline rather than one prompt

A single prompt that writes a finished post is hard to correct. Splitting the work into stages means the research can be checked before anything is written, and the SEO step works from a draft that already exists rather than guessing at one.

## Where it sits

The pipeline is part of my ongoing freelance work for Spade, alongside the site's 27 long-form SEO articles and its local SEO structure targeting Placer County cities. The [home page walkthrough](/#automation) illustrates the four stages; it does not generate or publish content itself.

See the [project page](/work/content-pipeline/) for the stack and delivered features.
