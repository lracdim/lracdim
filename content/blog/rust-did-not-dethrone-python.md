---
title: "Rust didn't dethrone Python. It moved in underneath it."
description: "Rust ranks 11th and Python first, yet Python's fastest new tools are written in Rust. Where Rust is winning, where it hurts, and when I would move code to it."
topic: Engineering
date: 2026-11-27
image: /assets/img/research/rust-underneath-python.webp
imageAlt: "A silver .py tile resting on a wider gold-edged .rs slab on a dark base"
technologies: [Rust, Python, uv, Polars, PyO3]
order: -11
---

On 19 March 2026, OpenAI agreed to buy Astral, a small Brooklyn company whose tools uv, Ruff and ty had gone from zero to hundreds of millions of downloads a month. All three are Python tools. All three are written in Rust. That is the real shape of the "Rust is taking over" story. Rust ranks 11th in TIOBE's November 2026 index and 12th for usage in Stack Overflow's 2026 survey, while Python is first on TIOBE and used by 58% of developers. Rust is not replacing Python. It is becoming the engine underneath it, and underneath a growing share of the internet's plumbing: the Linux kernel, Android and Cloudflare's network.

So is Rust the king of the internet? Not on the throne. But it is laying the foundations, and that changes how I think about the Python I write every week.

## What the numbers show

Three independent data sets, and they agree on one thing: Python is wide, Rust is deep.

- **Python is still the most used language.** Stack Overflow's 2026 survey, with more than 30,000 respondents, puts Python at 58%, tied with SQL and HTML/CSS and behind only JavaScript at 62%. JetBrains' 2026 Developer Ecosystem report, from nearly 29,000 developers, goes further: Python at 65%, ahead of JavaScript at 59%.
- **Rust is what developers plan to learn next.** In the same JetBrains report, 10% of developers intend to adopt Rust in the next six months, the highest of any language, against 8% for Go and 5% for Python. In Stack Overflow's 2025 survey, Rust was again the most admired language, at 72%.
- **Rust's popularity is real but still small.** TIOBE put Rust in its top 10 for the first time in July 2026. By November, Go had pushed it back to 11th. Python leads that index at 20.86%.

One caution: TIOBE measures search activity, not code shipped, and surveys reflect the developers who answer surveys. But the direction is consistent. Almost everyone writes some Python. A growing minority is putting Rust where it matters most.

## Where Rust is actually winning

Rust's wins are not in scripts or dashboards. They are in the layers nobody sees until they break.

- **The Linux kernel.** In December 2025, kernel maintainers declared the Rust experiment over. Rust is now a core part of the kernel and here to stay. It is used mainly for new drivers, not a rewrite of the core, but it now sits beside C as an accepted kernel language.
- **Android.** Google reported in November 2025 a 1000x lower memory safety vulnerability density in Rust than in Android's C and C++ code. Memory safety bugs fell below 20% of Android's vulnerabilities for the first time. The bigger surprise was speed: medium and large Rust changes are rolled back about four times less often, and Rust changes spend about 25% less time in code review.
- **Microsoft, with an asterisk.** In December 2025, distinguished engineer Galen Hunt posted a goal to eliminate every line of C and C++ from Microsoft by 2030. Microsoft then clarified that it was a research goal and that Windows is not being rewritten in Rust with AI. Treat it as a direction, not a plan.
- **Python's own tooling.** uv was the most admired technology among Stack Overflow tags in 2025, at 74%. Polars, a DataFrame library built in Rust, ran the PDS-H benchmark at the 10 GB scale in 3.9 seconds in streaming mode. pandas took 365.7 seconds, and the Polars team did not even run pandas at 100 GB because it runs out of memory. Those are the Polars team's own numbers, on a 96-core machine.

## What it looks like when Rust goes wrong

The most useful Rust case study of the last year is also the best warning.

On 18 November 2025, Cloudflare's network failed to deliver core traffic for about two hours and ten minutes. X, ChatGPT and Canva went down with it. A database permissions change produced a bot-management feature file with more than 200 features, past a hard limit in the code. Cloudflare's new proxy, FL2, written in Rust, detected the problem and returned an error, exactly as designed. Then the code that called it used `.unwrap()`, which crashes the program when it gets an error. The panic spread across Cloudflare's network.

Rust kept the memory safe. It did not stop an engineer from choosing to crash. Two weeks later, on 5 December, a second outage hit, and this time Cloudflare noted the same error did not occur in the Rust proxy. Its later resilience write-up names both failures side by side: a Rust service that called `.unwrap()` instead of handling an error, and Lua code that indexed an object that did not exist.

The lesson is not that Rust failed. It is that a language moves which bugs you get. It does not replace input validation, limits and gradual rollouts.

## The pros of Rust

- **Speed close to C**, with no garbage collector pauses.
- **Memory safety by default**, which removes the largest class of security bugs in systems code.
- **Real parallelism.** No global interpreter lock, and the compiler refuses code with data races.
- **One binary to ship.** No interpreter, virtual environment or version mismatch on the server.
- **Errors are part of the type.** A function that can fail says so, and the compiler makes you deal with it, or at least makes you write `.unwrap()` where everyone can see it.
- **Cargo**, the build tool and package manager, was the most admired tool in its category in Stack Overflow's 2025 survey, at 71%.
- **Fewer broken releases.** Google's Android data shows far fewer rollbacks for Rust changes than for C++.

## The cons, and what Python still does better

- **It is slower to write.** The borrow checker catches real bugs, but it also slows down the first version of everything. Onboarding takes months, not weeks.
- **Compile times hurt.** In the 2025 State of Rust survey, slow compilation and storage use were again among the top non-trivial problems, and more than 27% of respondents called slow compilation a significant problem. In the Rust project's own compiler survey, about 45% of people who had stopped using Rust gave long compile times as one of the reasons.
- **The libraries for everyday work live in Python.** Scraping, spreadsheets, PDFs, CRMs, payment APIs and AI SDKs all ship Python first. In Rust, many of these are thinner, younger or missing.
- **AI work is Python-first.** Stack Overflow's 2026 survey found Python the top language used alongside AI tools, at 39%. Agent frameworks, model SDKs and notebooks follow.
- **Python keeps getting faster.** Python 3.15, released on 9 October 2026, brought a JIT compiler about 7 to 8% faster than the standard interpreter on x86-64 Linux, lazy imports for quicker startup, and free-threading installed by default on macOS. That is nowhere near Rust speed, but for glue code the gap matters less every year.
- **Fewer people can maintain it.** Almost any developer can read a Python script. Far fewer can review Rust, and clients rarely ask for it.

## My stand

I am not moving my Python to Rust. I am keeping Python and letting Rust do the heavy lifting underneath it.

I use Python for automation, data handling and the glue between AI models and client systems. That includes content agents for Spade Security Services and a data completeness engine that scans datasets and fills missing fields from signals already in the data. Most of the time those jobs spend is waiting: on a model response, an API, a database or a web page. If a job waits 30 seconds on a model and spends 200 milliseconds in my code, a Rust rewrite makes the 200 milliseconds faster and leaves the 30 seconds alone. The cost is weeks of rewriting and a codebase fewer people can touch.

What I am doing instead is taking Rust's speed without writing Rust. uv and Ruff for packaging and linting. Polars or DuckDB when a dataset outgrows pandas. Pydantic, whose validation core is already Rust. If one function ever dominates a profile, PyO3 and maturin let me write that one function in Rust and call it from Python, which is exactly how Polars and Pydantic are built.

My test is simple. **Move a component to Rust** when most of these are true:

1. A profiler shows it is CPU-bound, not waiting on network or disk.
2. It runs constantly or at scale, so milliseconds turn into money.
3. Its requirements are stable and will not change every week.
4. It is a long-running service or a binary shipped to machines you do not control.
5. A crash or memory bug in it would be a security incident.

**Stay in Python** for scripts, scrapers, scheduled ETL, AI agent orchestration, prototypes and anything whose spec changes weekly. Fix speed first with uv, Polars or DuckDB, async I/O and a current Python version.

**Go hybrid** when one hot path dominates: Python stays the shell, and that path becomes a Rust extension. You keep Python's speed of development and get Rust's speed where it counts, but you now maintain two toolchains, so budget for that.

## The larger point

"Is Rust the king of the internet?" is the wrong question, the same way "which platform is winning" was the wrong question about [WordPress and Astro](/labs/why-companies-are-shifting-from-wordpress-to-astro/). Software is splitting by layer. Code that runs billions of times and must not crash or leak, such as kernels, proxies, package managers and query engines, is moving to Rust. Code that changes every week and mostly waits on other systems, such as automation, data glue and AI agents, is staying in Python, and getting faster because Rust sits underneath it. The useful question is not which language is winning. It is which layer your code lives in.

## Sources

- [OpenAI to acquire Astral](https://openai.com/index/openai-to-acquire-astral), OpenAI
- [OpenAI to expand Codex with Astral acquisition](https://www.verdict.co.uk/newsletters/openai-astral-acquisition), Verdict
- [The results of the 2026 Developer Survey are here](https://stackoverflow.blog/2026/10/06/the-results-of-the-2026-developer-survey-are-here/), Stack Overflow
- [Stack Overflow Developer Survey 2025: Technology](https://survey.stackoverflow.co/2025/technology/), Stack Overflow
- [JetBrains 2026: Python tops JavaScript, Rust leads plans](https://www.techrepublic.com/article/news-jetbrains-2026-python-javascript-rust-survey/), TechRepublic
- [TIOBE November 2026: Rust falls out of top 10](https://www.besthub.dev/articles/tiobe-november-2026-rust-falls-out-of-top-10-dart-enters-top-20-for-first-time-c11d9e04c3f2), 21CTO
- [TIOBE Index July 2026: Rust enters top 10](https://www.techrepublic.com/fr/article/news-tiobe-july-2026-rust-enters-top-10/), TechRepublic
- [The (successful) end of the kernel Rust experiment](https://lwn.net/Articles/1049831/), LWN.net
- [Rust in Android: move fast and fix things](https://blog.google/security/rust-in-android-move-fast-fix-things/), Google
- [Microsoft is not rewriting Windows in Rust](https://www.infoworld.com/article/4111553/microsoft-is-not-rewriting-windows-in-rust.html), InfoWorld
- [Updated PDS-H benchmark results](https://pola.rs/posts/benchmarks/), Polars
- [Cloudflare outage on November 18, 2025](https://blog.cloudflare.com/18-november-2025-outage/), Cloudflare
- [Cloudflare outage on December 5, 2025](https://blog.cloudflare.com/5-december-2025-outage/), Cloudflare
- [Code Orange: fail small, complete](https://blog.cloudflare.com/code-orange-fail-small-complete/), Cloudflare
- [2025 State of Rust Survey results](https://blog.rust-lang.org/2026/03/02/2025-State-Of-Rust-Survey-results), Rust Blog
- [Rust developers and slow compilation](https://thenewstack.io/rust-enterprise-developers/), The New Stack
- [Rust compiler performance survey 2025 results](https://blog.rust-lang.org/2025/09/10/rust-compiler-performance-survey-2025-results), Rust Blog
- [What's new in Python 3.15](https://docs.python.org/3.15/whatsnew/3.15.html), Python docs
- [Python 3.15 released with faster JIT](https://phoronix.com/news/Python-3.15-Released), Phoronix
