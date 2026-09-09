---
title: "AI agents: why most pilots stall, and what the ones in production have in common"
description: "Adoption surveys show agents everywhere in testing and fewer in production. The difference is rarely the model. It is the workflow around it."
topic: Automation
date: 2026-09-09
order: 6
---

Zapier's survey of more than 500 enterprise leaders gives the cleanest picture of where AI agents stand: 72% of organisations are using or testing them, 40% run multiple agents in production, and 32% are still in pilots. 84% intend to increase investment in the next twelve months. Among smaller companies the picture is thinner and earlier. Upwork's 2026 report on SMBs found 41% of leaders running pilots to test agents in decision-making, while conceding that the productivity gains have not yet matched the confidence placed in them.

The gap between "testing" and "in production" is where most of the interesting problems live. Having built automation for a small security company, I think the stall usually has three causes, none of them the model.

## The use cases that actually ship

The Zapier data on what agents do in production is unglamorous: data management (47%), document analysis and summarisation (41%), customer support triage (41%), report generation (36%). The departments leading adoption are customer support and operations, not engineering or marketing.

That is a list of bounded, repetitive, text-heavy tasks with a clear owner and a clear definition of done. It is not a list of autonomous agents making open-ended decisions. The pilots that stall are usually the second kind.

## Three reasons pilots stall

**No defined hand-off.** An agent that drafts a reply is useful. An agent that sends it is a liability until someone has defined which replies it may send unsupervised. Most pilots never write that rule down, so the agent stays in draft mode forever and gets counted as "testing".

**The data was never in one place.** Agents summarise, triage, and route. If the emails are in one system, the tickets in another, and the customer record in a spreadsheet, the agent spends its effort on integration failures. Data management being the number one production use case is not a coincidence; it is the prerequisite.

**Security and privacy questions asked too late.** Zapier's respondents name security and data privacy as the leading barrier. A pilot that touches customer data without a decision about what the agent may read, store, and send will be stopped by whoever owns that risk, usually right before production.

## What the Spade automation looks like

The systems I built for Spade Security Services are deliberately on the boring side of the list, and they are in production.

- **A publishing pipeline in n8n** with four stages: Researcher, Writer, SEO Generator, WordPress publisher. Each stage has one job, hands a structured payload to the next, and a person decides what is published. It is an agent workflow in the sense that matters, and it ships because the hand-off is explicit.
- **Spade Inbox**, an Express, TypeScript, and PostgreSQL message centre where n8n handles email threading. The "agent" work is triage and routing, the top production use case in the survey, and the data lives in one database on purpose.
- **Spade Handler**, an internal Next.js and Node.js tool that publishes blog posts and automates social distribution, so that the output of the pipeline has somewhere defined to go.

None of these decide anything a human would regret. All of them remove work a human was doing by hand.

## A short checklist for moving a pilot to production

1. Write the rule for what the agent may do without a person, in one sentence. If you cannot, the pilot is not ready.
2. Put the data it needs in one place first. This is most of the work and none of the demo.
3. Decide what it may read and send before the first real record touches it.
4. Log every action it takes, and read the log weekly for the first month.
5. Measure the task it replaced, not the technology. Minutes saved per ticket is a number; "AI transformation" is not.

The 84% planning to invest more are right that agents are worth it. The 32% still in pilots will get there faster by picking a smaller job.

## Sources

- [State of agentic AI adoption survey](https://zapier.com/blog/ai-agents-survey/), Zapier, 2026
- [The State of AI Within SMBs in 2026](https://www.upwork.com/resources/state-of-ai-in-smbs), Upwork
- [AI agent adoption statistics: many pilots, little production](https://www.thisandthat.chat/blog/ai-agent-adoption-statistics), This and That, 2026
