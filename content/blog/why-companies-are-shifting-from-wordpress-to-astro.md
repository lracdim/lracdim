---
title: "Why many companies are shifting from WordPress to Astro"
description: "Astro sites nearly tripled in a year while WordPress lost 420,000. The reasons, the honest pros and cons, and when I would and would not make the move."
topic: Web development
date: 2026-11-01
image: /assets/img/research/wordpress-to-astro.webp
imageAlt: "The WordPress logo on a silver tile, a gold arrow, and the Astro logo on a second tile"
order: -10
---

In the twelve months to September 2026, the number of Astro websites with enough real Chrome traffic to appear in Google's Core Web Vitals data nearly tripled, from 17,149 to 47,277. Over the same year, WordPress lost about 420,000 of them. WordPress still runs 39.5% of all websites and Astro 0.2%, so this is not a changing of the guard. But the companies moving have something in common: they run marketing sites, documentation and content libraries, and they decided they were paying for a database, a PHP runtime and a stack of plugins to serve pages that change once a week.

## What the numbers show

Two independent data sets point the same way.

- **WordPress is shrinking.** W3Techs puts WordPress at 39.5% of all websites on 1 November 2026, down from 43.2% in December 2025. It is still 58.2% of sites with a known content management system, far ahead of anything else. I looked at the first half of that decline in [Is this the end of the WordPress era?](/research/is-this-the-end-of-the-wordpress-era/)
- **Astro is growing fast from a small base.** HTTP Archive's Technology Report, which uses Chrome's real-user data, counted 47,277 Astro sites on mobile in September 2026, up from 30,080 in May.
- **Astro sites are faster in the field.** In the same September data, 71.1% of Astro sites passed all three Core Web Vitals on mobile, against 48.3% of WordPress sites. A year earlier the figures were 61.6% and 45.0%, so the gap is widening, not closing.

One caution on that last point: Astro sites tend to be newer and built by developers, so not all of the gap is the framework. But the framework makes the fast version the default, and WordPress makes it something you have to work for.

## Why companies are leaving WordPress

The reasons that come up again and again in migration write-ups are practical, not fashionable.

- **Speed sells, and Astro ships less.** Astro renders pages to HTML at build time and sends no JavaScript unless a component asks for it, which Astro calls islands. A typical WordPress page loads its theme, its page builder and every plugin's scripts.
- **The security surface disappears.** Patchstack counted 11,334 new vulnerabilities in the WordPress ecosystem in 2025, up 42% on 2024. 91% were in plugins and only 6 in WordPress core, and 46% had no patch when they were disclosed. A static Astro site has no plugins, no login page and no database on the public server. When [PHP2Shell](/research/php2shell-what-site-owners-should-do/) hit on 21 October 2026 and national cyber agencies advised taking unpatched PHP sites offline, static sites had nothing to patch.
- **Maintenance stops being a monthly chore.** No core, plugin or PHP updates on the live site. Dependencies still need updating, but in the build, where a mistake fails a test instead of taking the site down.
- **Content becomes code, with review.** Pages live in version control. Every change gets a preview link, and a broken page can be blocked before it deploys.
- **The platform now has a heavyweight behind it.** In January 2026 the team that builds Astro joined Cloudflare. Astro stays MIT-licensed and deploys to any host, and Cloudflare names Porsche, IKEA and OpenAI among the companies using it. Astro 6, released in March, made live content collections and a Content Security Policy API stable.
- **Some teams want distance from WordPress politics.** The dispute between Automattic and WP Engine has been in court since October 2024. For most site owners it changes nothing day to day, but agencies that watched WP Engine customers lose access to WordPress.org plugin updates in 2024 now weigh platform risk more carefully. That last point is my reading, not a measured trend.

## What a migration looks like in practice

The two most detailed public case studies show both sides.

- **The Recovery Project**, a UK supplier of rehabilitation equipment, moved about 200 pages to Astro in six working days, according to Flex Solutions, the agency that did the work. The Lighthouse performance score went from 68 to 92 and Largest Contentful Paint from 2.7 to 1.6 seconds. The site went from 17 JavaScript files to none, and lost its WooCommerce shop, which had never taken an order. Products and articles are now files in GitHub, checked at build time and previewed before release.
- **WPPoland**, a WordPress development shop whose founder has worked with WordPress since 2006, moved its own six-language site of 15,718 pages to Astro on Cloudflare. Its ten-month report is the most useful read on the subject because it lists what hurt. The site needed 3,619 redirect rules, and Cloudflare silently dropped rules past a size limit, which turned into 404s. It also outgrew Cloudflare's 8 GB build machine, and its automated pre-release checks grew to more than 120, partly to replace safeguards WordPress had provided. Their verdict: the template port was the cheap part.

Both sets of figures are reported by the people who did the work, and the Lighthouse numbers are lab scores, not field data.

## The pros of Astro

- **Fast by default**, and measurably so in real-user data.
- **A much smaller attack surface**, with no admin login or plugin code on the public site.
- **Cheaper hosting.** Static files from a CDN cost little, and often nothing at small-business scale.
- **Less maintenance**, and updates that fail safely in the build.
- **Version control, previews and review** for every content change.
- **Flexibility.** Use React, Vue or Svelte components only where a page needs them, or keep WordPress as a headless CMS behind an Astro front end.

## The cons, and what WordPress still does better

- **Editing moves out of wp-admin.** Without a CMS on top, every text change needs a developer or a Git-based editor. Marketing teams used to publishing on their own feel this first.
- **Plugins become projects.** Forms, site search, bookings, memberships and shops are one install in WordPress. On a static site each one is a service to pick or code to write.
- **Migration is real work.** Redirects, multilingual tags, sitemaps and the search equity in old URLs all need care, and mistakes surface as lost rankings weeks later.
- **Very large sites need build engineering.** Thousands of pages mean long builds and memory limits.
- **You need a developer on call.** WordPress lets a business run for years with an admin password and a host. Astro assumes someone owns the code.
- **A smaller talent pool.** Almost every agency can maintain WordPress. Fewer can maintain Astro.

## My stand

Astro is the better default for a new marketing or content site in 2026. WordPress is still the better tool when non-developers publish every day or the business runs on plugins. What I would not do is migrate a healthy WordPress site just to win a Lighthouse score.

I work on both sides of this. My own site is static, built with Eleventy, a close relative of Astro: the pages are plain files on a CDN, with no CMS or login page behind them. The Spade Security Services site runs on WordPress, because it carries 27 long-form articles, a local SEO structure across Placer County cities and an AI chatbot built on the WordPress REST API. Both choices were right for the job, and neither would be right for the other.

My test is simple. **Move to Astro** when most of these are true:

1. The site is mostly pages and articles that change weekly, not hourly.
2. A developer, in-house or retained, will own the code and deploys.
3. Speed and search visibility are worth real money to you.
4. Most of your plugins exist to fix performance or security.

**Stay on WordPress** when several people publish daily in wp-admin, revenue depends on WooCommerce, bookings, memberships or courses, or nobody will own a Git workflow. In that case the gap closes a long way with a supported PHP version, fewer plugins, proper caching and a firewall.

**Go hybrid** when editors love wp-admin but the front end has to be fast. WordPress becomes a headless CMS and Astro renders the pages, which Astro documents officially. You keep the editing experience and lose most of the attack surface, but you now run two systems, so budget for that.

## The larger point

The web is not leaving WordPress so much as splitting by job. Pages that are read far more often than they change are moving to static sites built with tools like Astro, because that is cheaper, faster and safer. Sites that are operated every day, with editors, carts and members, are staying where the plugins are. The useful question for a business is not which platform is winning. It is which job your website actually does.

## Sources

- [Usage statistics of content management systems, November 2026](https://w3techs.com/technologies/overview/content_management), W3Techs
- [Technology Report: Astro and WordPress](https://httparchive.org/reports/techreport/tech?tech=Astro,WordPress), HTTP Archive
- [Astro is joining Cloudflare](https://blog.cloudflare.com/astro-joins-cloudflare/), Cloudflare
- [Astro 6](https://astro.build/blog/astro-6/), Astro
- [Islands architecture](https://docs.astro.build/en/concepts/islands/) and [Headless WordPress and Astro](https://docs.astro.build/en/guides/cms/wordpress/), Astro Docs
- [State of WordPress Security in 2026](https://patchstack.com/whitepaper/state-of-wordpress-security-in-2026/), Patchstack
- [The Recovery Project: WordPress to Astro migration](https://flexsolutions.co.in/case-studies/the-recovery-project-wordpress-to-astro-migration/), Flex Solutions
- [WordPress to Astro on Cloudflare Pages: a report after 10 months](https://wppoland.com/en/12-months-wordpress-to-astro-cloudflare-pages-migration/), WPPoland
- [WordPress vs. WP Engine drama, explained](https://techcrunch.com/2024/09/26/wordpress-vs-wp-engine-drama-explained/), TechCrunch
