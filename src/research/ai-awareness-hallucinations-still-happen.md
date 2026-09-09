---
title: "AI awareness: 96% know chatbots make things up, 72% trust them anyway"
description: "A 2026 survey shows people know about hallucinations and rely on AI regardless. What that gap means for anyone putting an assistant on a website."
topic: AI awareness
date: 2026-09-09
image: /assets/img/research/hallucinations.webp
imageAlt: "A solid gold speech bubble whose shadow breaks into scattered fragments"
order: 4
---

Tidio's 2026 survey of 974 internet users produced a contradiction worth sitting with. 96% of respondents know that AI chatbots produce false information, and 86% say they have experienced it personally. 72% still trust AI to give reliable, truthful answers. Three quarters of them have been misled by it at least once.

Awareness, in other words, has arrived. Caution has not.

## What a hallucination actually is

A language model does not look facts up. It produces the most plausible continuation of the text it has been given, and plausibility is not truth. When the answer is common knowledge the two overlap; when the question is niche, recent, or about a specific person or price, they diverge. The Tidio study reports that 46% of users encounter this frequently and 35% occasionally. Separate 2025 and 2026 evaluations put citation-style hallucinations at 15 to 20% for leading models on factual tasks, rising sharply on obscure or recent topics.

The failure looks like confidence. That is why it works: a wrong answer in a hesitant voice would be checked, and these are not delivered hesitantly.

## Why this matters for a website, not only for users

Chatbots are no longer a novelty on business sites; they are the front desk. I built one, Argus, into the Spade Security Services WordPress site on the WordPress REST API. The awareness gap above is a design constraint for anything like it, because a visitor who trusts the answer is going to act on it: call the wrong number, expect the wrong price, assume a service is offered in a city it is not.

The same 2026 survey found that 93% of users believe hallucinations can cause harm and that 57% check answers against another source, while 32% rely on instinct. A third of your visitors are not checking. The site has to do it for them.

## Practices that reduce the harm

1. **Ground the assistant in your own content.** An assistant that answers from your service pages, hours, and pricing has far less room to invent. Retrieval from a controlled source is the single most effective mitigation, and it is the architecture Argus uses: the WordPress content is the ground truth.
2. **Give it permission to say "I don't know".** Instruct the model to decline and hand off when the question falls outside the content it was given. A hand-off to a human is a feature, not a failure.
3. **Never let it state a price, a legal position, or a medical fact it was not given.** Those are the categories where a plausible guess causes the most damage.
4. **Say that it is an AI.** In the EU this is now law under the AI Act's transparency article; everywhere it is good practice, because disclosed AI is treated with the scepticism it deserves.
5. **Log the conversations and read them.** Hallucinations show up in transcripts before they show up in complaints. A weekly read of the questions the assistant could not answer is also the best source of content ideas you will find.
6. **Keep session memory honest.** Argus remembers the conversation so the visitor does not repeat themselves. Memory should never turn into the assistant "remembering" facts it inferred earlier and treating them as confirmed.

## The awareness that is still missing

The public knows hallucinations exist. What it has not internalised is where they cluster: specifics, recency, and anything the model has seen little of. A useful rule for users, and the one I give clients: trust the model on the shape of an answer, verify it on any number, name, date, or link. For builders, the rule is simpler. Assume the visitor will not verify, and build the assistant so that it does not need them to.

## Sources

- [When Machines Dream: A Dive in AI Hallucinations](https://www.tidio.com/blog/ai-hallucinations/), Tidio, updated 15 April 2026
- [LLM Hallucination Statistics 2026](https://sqmagazine.co.uk/llm-hallucination-statistics/), SQ Magazine, 2026
- [The EU AI Act's Transparency Rules: A Practical Guide to Article 50](https://artificialintelligenceact.eu/transparency-rules-article-50/), EU Artificial Intelligence Act
