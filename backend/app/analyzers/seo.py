from __future__ import annotations

from urllib.parse import urljoin

from ..services.fetcher import FetchError, fetch
from .base import Analyzer, AnalyzerResult, Finding, PageContext


class SEOAnalyzer(Analyzer):
    category = "seo"

    def __init__(self, check_robots: bool = True):
        self.check_robots = check_robots

    def run(self, ctx: PageContext) -> AnalyzerResult:
        soup = ctx.soup
        findings: list[Finding] = []
        title = (soup.title.string or "").strip() if soup.title and soup.title.string else ""
        desc_tag = soup.find("meta", attrs={"name": "description"})
        desc = (desc_tag.get("content") or "").strip() if desc_tag else ""
        robots_tag = soup.find("meta", attrs={"name": "robots"})
        robots_meta = (robots_tag.get("content") or "").lower() if robots_tag else ""
        canonical = soup.find("link", rel=lambda v: v and "canonical" in v)
        og = {m.get("property"): m.get("content") for m in soup.find_all("meta", attrs={"property": True}) if str(m.get("property")).startswith("og:")}
        twitter = soup.find("meta", attrs={"name": "twitter:card"})
        imgs = soup.find_all("img")
        missing_alt = [i for i in imgs if i.get("alt") is None and i.get("role") != "presentation"]  # alt="" is a valid decorative marker
        x_robots = ctx.fetched.headers.get("x-robots-tag", "").lower()

        robots_txt, sitemap = None, None
        if self.check_robots:
            robots_txt, sitemap = self._robots(ctx)

        metrics = {
            "title": title,
            "title_length": len(title),
            "description_length": len(desc),
            "canonical": canonical.get("href") if canonical else None,
            "robots_meta": robots_meta,
            "x_robots_tag": x_robots,
            "open_graph": sorted(og.keys()),
            "twitter_card": bool(twitter),
            "images": len(imgs),
            "images_missing_alt": len(missing_alt),
            "robots_txt": robots_txt,
            "sitemap": sitemap,
        }

        if not title:
            findings.append(Finding("no_title", "critical", "Missing page title", "No <title> element.", "The title is the headline in search results and the browser tab.", "Add a unique, descriptive title of 30 to 60 characters.", "The page can be presented in search results."))
        elif len(title) < 15:
            findings.append(Finding("short_title", "medium", "Title is very short", f"Title: \"{title}\" ({len(title)} characters).", "Short titles rarely describe the page or match searches.", "Expand the title to say what the page is and who it is for.", "Better click-through from results."))
        elif len(title) > 65:
            findings.append(Finding("long_title", "low", "Title is likely to be cut off", f"{len(title)} characters.", "Search results truncate titles beyond roughly 60 characters.", "Move the key words to the front and shorten.", "The full title shows in results."))
        if not desc:
            findings.append(Finding("no_description", "high", "Missing meta description", "No <meta name=\"description\">.", "Search engines write their own snippet from page text, usually worse than yours.", "Add a 70 to 155 character description that states what the page offers.", "Controlled, relevant snippets in results."))
        elif len(desc) > 165:
            findings.append(Finding("long_description", "low", "Meta description is long", f"{len(desc)} characters.", "Results truncate descriptions beyond about 155 characters.", "Shorten to the essential sentence.", "The whole snippet is visible."))
        if not canonical:
            findings.append(Finding("no_canonical", "medium", "No canonical URL", "No <link rel=\"canonical\">.", "Duplicate addresses (with and without slash, query strings, http) split ranking signals.", "Declare the preferred address on every page.", "Signals consolidate on one address."))
        if "noindex" in robots_meta or "noindex" in x_robots:
            findings.append(Finding("noindex", "critical", "Page is marked noindex", f"robots: {robots_meta or x_robots}", "Search engines are told not to index this page.", "Remove noindex if the page should appear in search.", "The page becomes eligible for indexing."))
        if not og.get("og:title") or not og.get("og:description"):
            findings.append(Finding("no_open_graph", "low", "Incomplete Open Graph metadata", f"Present: {', '.join(sorted(og.keys())) or 'none'}", "Shared links on social platforms fall back to generic previews.", "Add og:title, og:description, og:image, and og:url.", "Rich link previews when the page is shared."))
        if missing_alt:
            findings.append(Finding("images_missing_alt", "medium" if len(missing_alt) > 2 else "low", "Images without alt text", f"{len(missing_alt)} of {len(imgs)} images have no alt attribute (an empty alt marks decoration and is not counted).", "Image search and assistive technology get nothing to work with.", "Add descriptive alt text; use alt=\"\" only for decoration.", "Accessible and indexable images."))
        if self.check_robots:
            if robots_txt == "missing":
                findings.append(Finding("no_robots_txt", "low", "No robots.txt", "GET /robots.txt did not return a robots file.", "Crawlers proceed with defaults; you cannot point them at a sitemap.", "Publish /robots.txt with a Sitemap: line.", "Explicit crawl guidance."))
            elif robots_txt == "blocks_all":
                findings.append(Finding("robots_blocks_all", "critical", "robots.txt blocks all crawling", "Disallow: / for all user agents.", "No search engine may crawl the site.", "Remove or narrow the Disallow rule.", "The site can be crawled and indexed."))
            if sitemap == "missing":
                findings.append(Finding("no_sitemap", "low", "No sitemap found", "robots.txt declares no sitemap and /sitemap.xml did not respond with XML.", "Discovery depends entirely on links.", "Publish sitemap.xml and reference it from robots.txt.", "Faster discovery of new and changed pages."))
        return AnalyzerResult(self.category, findings, metrics)

    def _robots(self, ctx: PageContext) -> tuple[str, str]:
        base = f"{ctx.scheme}://{ctx.host}/"
        robots_state, sitemap_state = "missing", "missing"
        sitemap_urls: list[str] = []
        try:
            r = fetch(urljoin(base, "/robots.txt"), timeout=6, max_bytes=200_000)
            if r.status == 200 and "html" not in r.headers.get("content-type", ""):
                robots_state = "present"
                agent_all = False
                for line in r.text.splitlines():
                    key, _, value = line.partition(":")
                    key, value = key.strip().lower(), value.strip()
                    if key == "user-agent":
                        agent_all = value == "*"
                    elif key == "disallow" and agent_all and value == "/":
                        robots_state = "blocks_all"
                    elif key == "sitemap" and value:
                        sitemap_urls.append(value)
        except FetchError:
            pass
        candidates = sitemap_urls or [urljoin(base, "/sitemap.xml")]
        for url in candidates[:2]:
            try:
                s = fetch(url, timeout=6, max_bytes=200_000)
                if s.status == 200 and ("xml" in s.headers.get("content-type", "") or s.text.lstrip().startswith("<?xml")):
                    sitemap_state = "present"
                    break
            except FetchError:
                continue
        return robots_state, sitemap_state
