---
title: "Vibe and verify: the responsible way to ship AI-written code"
description: "AI assistants now write syntactically correct code almost every time. The security pass rate has not moved in two years. Here is what that means for how a developer should work."
topic: Responsible AI
date: 2026-09-09
order: 2
---

Two numbers describe the state of AI-assisted development in 2026. The first is 84%: the share of developers in Stack Overflow's 2025 survey who use or plan to use AI tools, with just over half of professionals using them daily. The second is 55%: the share of AI-generated code that passes a basic security check in Veracode's spring 2026 update, a figure the report notes has barely moved in two years while syntax correctness climbed past 95%.

Put those together and you have the actual job of a developer today. The tool will produce working code on demand. Whether it is safe to ship is still your call.

## What the security data says

Veracode tested more than 150 models across 80 coding tasks in Java, JavaScript, C#, and Python, measuring four vulnerability classes. Across everything, 45% of generated code contained a known flaw. The pattern by language is uneven: Python passed 62% of the time, JavaScript 57%, Java only 29%. The pattern by vulnerability type is the more useful one. Models handled SQL injection (82% pass) and weak cryptography (86%) reasonably well, because those are the textbook examples every training set contains. They failed badly at cross-site scripting (15%) and log injection (13%), the kinds of flaw that depend on knowing where untrusted input ends up.

That matches what developers report. Stack Overflow's top frustration, at 66%, is code that is "almost right, but not quite". Only 3.1% of respondents say they highly trust AI output; 45.7% distrust its accuracy. Adoption went up and trust went down in the same year.

## Why "almost right" is the dangerous case

Obviously broken code is safe, because it does not ship. Code that runs, passes the happy-path test, and quietly reflects user input into a page is the case that reaches production. The Cloud Security Alliance's April 2026 research note frames AI coding assistants as an attack surface in their own right: the assistant, its extensions, and its configuration files are now things an attacker can target. GitGuardian's 2026 secrets report found AI-assisted commits leak credentials at more than twice the baseline rate.

None of this argues against using the tools. It argues against treating their output as reviewed.

## A working practice

This is how I use AI assistance on client work, and what I would recommend to any team adopting it.

1. **Generate, then read every line you keep.** The review is the work. If a block is too long to read, it is too long to accept.
2. **Ask for the threat, not just the feature.** After the code exists, ask the assistant where untrusted input enters and where it is rendered or logged. The XSS and log-injection failures above are exactly the cases this surfaces.
3. **Keep secrets out of the conversation.** Assistants and their configuration files are a leak path. Environment variables and a secrets manager, never pasted keys.
4. **Run the same scanners you would run on human code.** Static analysis and dependency checks do not care who wrote the code. Veracode's numbers are for unscanned output; a scanner catches most of the four classes above.
5. **Pin what you install.** The MaliciousCorgi campaign reported in January 2026 involved two AI coding extensions with 1.5 million combined installs that captured every file opened. Extensions are dependencies.
6. **Own the result.** The accountable engineer on a change is whoever merged it. That was true before assistants and is the reason experienced developers show the lowest trust in the survey: they are the ones who will be paged.

## The honest summary

AI assistants have made the first draft nearly free. They have not made review cheaper, and on the security dimension they have made it more necessary, because the errors are subtler than the ones a junior developer makes. The slogan the industry has settled on, "vibe and verify", is right as long as the second word gets the same effort as the first.

## Sources

- [Spring 2026 GenAI Code Security Update](https://www.veracode.com/blog/spring-2026-genai-code-security/), Veracode, 24 March 2026
- [2025 Developer Survey: AI](https://survey.stackoverflow.co/2025/ai), Stack Overflow
- [Mind the gap: Closing the AI trust gap for developers](https://stackoverflow.blog/2026/02/18/closing-the-developer-ai-trust-gap/), Stack Overflow, 18 February 2026
- [AI Coding Assistants as Attack Surface](https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/04/CSA_research_note_ai-coding-assistant-attack-surface_20260403-csa-styled.pdf), Cloud Security Alliance, April 2026
- [AI Coding Assistants in 2026: the hidden security cost](https://www.kusari.dev/blog/ai-coding-assistants-in-2026-4x-faster-10x-riskier-the-hidden-security-cost), Kusari, 2026
