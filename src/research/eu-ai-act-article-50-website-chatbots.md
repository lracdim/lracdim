---
title: "Since 2 August 2026, your website chatbot has to say what it is"
description: "The EU AI Act's transparency rules are now in force. They reach further than the high-risk headlines suggest, and they apply to ordinary business websites."
topic: AI updates
date: 2026-09-09
---

Most coverage of the EU AI Act has been about the high-risk tier: hiring tools, credit scoring, biometrics. Those obligations were pushed back in 2026, to December 2027 for stand-alone systems and August 2028 for AI embedded in already-regulated products. What was not delayed is Article 50, the transparency article, which became applicable on 2 August 2026 along with the enforcement powers of the EU's AI Office.

Article 50 is the part that applies to a normal business website.

## What Article 50 requires

The article covers four situations. Two of them matter to almost every company running a website.

**Chatbots and assistants.** A system designed to interact with people must be built so that users are informed they are dealing with an AI, at the latest at the first interaction, in a clear and distinguishable way. The exemption is when it is obvious from context to a reasonably informed person, which is a narrower carve-out than it sounds. A support widget with a human-sounding name and an avatar does not qualify.

**AI-generated content.** Systems that generate text, images, audio, or video must mark their output in a machine-readable way so it can be detected as artificial. Generative systems already on the market have until 2 December 2026 for the marking requirement. A standardised EU label is being developed.

The other two situations are emotion recognition and biometric categorisation, which require notice to the people exposed, and deepfakes, which must be disclosed. AI-written text published to inform the public on matters of public interest must also be disclosed, unless a person holds editorial responsibility after substantive human review.

## Who this reaches

The Act applies to providers and deployers whose systems are used in the EU, regardless of where the company sits. A Philippine developer building a chatbot for a Californian client is not directly in scope unless EU users are served. But the practical reality is that websites are global, vendors build to the strictest market, and the disclosure is cheap. Advisers summarising the August changes make the same point: small businesses using off-the-shelf AI tools have lighter duties, not absent ones. Verify the vendor is compliant, put the disclosure in place, and document the use case.

## What to change on a site

Working through this on the sites I maintain, the list is short.

1. **Label the assistant.** The first message and the widget header should say it is an AI assistant. Argus, the chatbot I built into the Spade Security Services site, introduces itself as such; the fix on most sites is one line of copy.
2. **Keep an escalation path visible.** Disclosure plus an obvious way to reach a person satisfies both the rule and the visitor.
3. **Check your content pipeline.** If AI drafts articles, the Act's public-interest text provision is satisfied by human editorial responsibility. That means a named person reviews before publication, which is the process the Spade publishing pipeline already follows: four automated stages, then a human decides what goes live.
4. **Ask your vendors.** The generative tools you use are the "providers" who must implement machine-readable marking. Ask them how, and when.
5. **Write it down.** A one-page record of which AI systems the site uses, what they do, and how they are disclosed is the documentation regulators and clients will ask for first.

## The larger point

Transparency rules are the least burdensome part of the Act and the most visible to the public. They also encode a norm that was already emerging: people want to know when they are talking to software. The 2026 survey data on hallucinations shows why. Users trust AI more than its accuracy warrants, and a clear label is the simplest way to recalibrate that trust. Compliance and good design point the same way here.

## Sources

- [The EU AI Act's Transparency Rules: A Practical Guide to Article 50](https://artificialintelligenceact.eu/transparency-rules-article-50/), EU Artificial Intelligence Act
- [The EU AI Act: when does it become enforceable now?](https://www.dataprotectionreport.com/2026/07/the-eu-ai-act-when-does-it-become-enforceable-now/), Data Protection Report, July 2026
- [A comprehensive EU AI Act summary, August 2026 update](https://www.softwareimprovementgroup.com/blog/eu-ai-act-summary/), Software Improvement Group
- [EU AI Act 2026 updates: compliance requirements and business risks](https://www.legalnodes.com/article/eu-ai-act-2026-updates-compliance-requirements-and-business-risks), Legal Nodes
