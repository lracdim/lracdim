---
title: "PHP2Shell: what the October 2026 PHP flaws mean for your website"
description: "Two critical PHP bugs found with AI pushed governments to take sites offline. What they are, who is exposed, and the checklist to work through this week."
topic: Security updates
date: 2026-10-23
image: /assets/img/research/php2shell.webp
imageAlt: "A silver code panel split by a crack, sealed with a gold patch"
order: -1
---

On 21 October 2026 the PHP project shipped emergency fixes for two critical flaws in PHP itself, tracked as CVE-2026-109618 and CVE-2026-109619 and nicknamed PHP2Shell. Within hours, national cyber agencies were advising organisations that could not update to take their websites offline, and many did. PHP runs roughly seven in ten websites whose server-side language can be identified, including most WordPress, Drupal and Joomla sites, so this one reaches ordinary business websites, not only large platforms.

## What happened

- **19 August.** The flaws were found by researchers at Calif and Wiz, working with OpenAI security researchers. Calif used OpenAI's GPT-5.6 Sol model in the search.
- **24 August.** The findings were reported to the PHP security team.
- **20 October.** Details began circulating ahead of the planned disclosure, and the release was brought forward.
- **21 October.** PHP published 8.5.12, 8.4.27, 8.3.36 and 8.2.35 with the fixes. Agencies in the US, UK, Canada, Australia, the EU and Japan issued warnings the same day.
- **23 October.** PHP published a follow-up advisory, CVE-2026-115560, for a related issue in session upload progress, with a configuration workaround until the next regular release.

## What the flaws are

Both bugs live in how PHP cleans up after a fatal error, especially when a request runs out of memory. A crafted HTTP request can push PHP into that error path and leave internal state behind: a pointer to memory that has already been freed, or data that was only half set up. The next request handled by the same worker process can then be steered into that leftover state.

The result, depending on the variant, is remote code execution on the server, leaked chunks of server memory (which can include secrets), or crashes. Three details make it serious:

- **No login is needed.** Wiz demonstrated unauthenticated exploitation, including memory disclosure on applications that never start a session.
- **It is in PHP, not in a plugin.** Every way of serving PHP over the web is affected: PHP-FPM, Apache with mod_php, php-cgi, FrankenPHP and LiteSpeed. The PHP team rates the risk highest for mod_php.
- **It goes back years.** Wiz reports that every PHP version released in the last decade is affected by at least one of the bugs, back to PHP 5.4.

Both CVEs carry a CVSS 4.0 score of 9.2 out of 10.

## Why the reaction was so large

The unusual part is not the bug class but the advice. CISA in the US, the UK's National Cyber Security Centre, Canada's Cyber Centre, the Australian Cyber Security Centre and CERT-EU all told organisations that could not patch immediately to consider disconnecting vulnerable services. The NSA and FBI gave the same advice. Japan's Prime Minister, Sanae Takaichi, posted a warning on X urging site operators to check whether they run PHP, and described a temporary suspension as an effective way to reduce risk.

Many took that literally. Government sites in Finland and the Dutch House of Representatives disconnected; Edinburgh and Oxford councils and the Metropolitan Police were among UK sites reported unavailable; in Japan, pixiv, DMM, niconico and the shop builder BASE went into emergency maintenance; and Wikipedia's operator and the Internet Archive took systems down temporarily.

The exposure numbers explain why. Censys data showed about 1.5 million of 2.6 million PHP hosts reporting a version with no fix available, and Cisco estimated that roughly half of internet-facing PHP instances were too old to receive the patches. Cloudflare reported the first exploitation attempts soon after disclosure and deployed firewall rules for its customers, and on 22 October The Guardian reported millions of attempts to exploit the flaw against websites worldwide. In the first reports, CISA and the Dutch NCSC had not yet confirmed active exploitation, and none of the organisations that went offline reported a breach.

## What to do this week

1. **Find out which PHP version your site actually runs.** In WordPress, go to Tools, then Site Health, then Info, then Server. Hosting control panels usually show it too. If you check from a terminal, note that the command-line PHP can differ from the version serving your website.
2. **Update to a fixed release: 8.5.12, 8.4.27, 8.3.36, 8.2.35 or later.** If you are on managed hosting, ask your host to confirm in writing that your server runs a patched build; many applied the fix within the first day.
3. **If you are on PHP 8.1 or older, you have no official release.** The PHP team published source backports for 7.4, 8.0 and 8.1, and some distributions and long-term support vendors ship backported fixes. Otherwise, move to a supported branch. Test on a staging copy first: older themes and plugins are the usual thing that breaks.
4. **Until you are patched, put something in front of PHP.** Cloudflare, Fastly, Vercel and others published interim mitigations. If you have none of those, a static maintenance page served without PHP is the option the agencies recommended.
5. **Apply the follow-up workaround.** Until the next regular PHP release covers CVE-2026-115560, set `session.upload_progress.enabled=0`. Very few sites use upload progress tracking, so this rarely breaks anything.
6. **Look for signs of probing.** Wiz suggests watching for bursts of multipart requests followed by memory-limit errors or repeated HTTP 500 responses, unusually large or malformed `PHPSESSID` cookies, and PHP workers restarting without explanation. Because this happens below the application, WordPress's own logs may show nothing.
7. **If anything looks wrong, assume secrets were exposed.** After patching, rotate database and admin passwords and API keys, review the list of admin users, and restore from a clean backup if files have changed.
8. **Put the next date in the calendar.** PHP 8.2 reaches end of life on 31 December 2026. A site still on it in January is back in the "no fix available" group the next time this happens.

## The larger point

This flaw sat in PHP's error handling for over a decade, and AI-assisted research found it in weeks. The same tools are available to attackers, and more disclosures of this kind are likely, in PHP and in everything else written in C. What decided who was exposed this week was not the website builder or the plugins: it was whether the server ran a supported PHP version that could be patched the same day. For a small business site, the most useful outcome of PHP2Shell is a standing answer to two questions: which PHP version are we on, and who updates it.

## Sources

- [PHP2Shell: critical RCE vulnerabilities in PHP](https://www.wiz.io/blog/php2shell-php-rce), Wiz Research
- [PHP security releases, 21 October 2026](https://www.php.net/), The PHP Group
- [PHP ships emergency patches for critical PHP2Shell flaws](https://bleepingcomputer.com/news/security/php-ships-emergency-patches-for-critical-php2shell-flaws), BleepingComputer
- [Critical PHP flaws put websites at risk](https://www.cybersecuritydive.com/news/php-website-vulnerabilities/833580/), Cybersecurity Dive
- [Japan PM warns of vulnerabilities in PHP programming language](https://www.nippon.com/en/news/yjj2026102101249/), Nippon.com / Jiji Press
- [UK councils and Met Police among sites pulled offline after NCSC alert](https://www.insurancebusinessmag.com/uk/news/cyber/uk-councils-and-met-police-among-sites-pulled-offline-after-ncsc-alert-594424.aspx), Insurance Business
- [Websites across world hit by millions of attempts to exploit PHP code flaw](https://www.theguardian.com/technology/2026/oct/22/websites-across-world-hit-by-millions-of-attempts-to-exploit-php-code-flaw), The Guardian
