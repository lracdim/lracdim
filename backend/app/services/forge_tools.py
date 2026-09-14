"""Server-side Forge tools. Each needs to fetch another site, so each goes
through the same validated fetcher as Vector. Results are structured and
never include the raw fetched body."""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

from ..core.ssrf import normalize, validate
from .fetcher import FetchError, fetch


def robots_validator(url: str) -> dict:
    base = normalize(url)
    parts = urlsplit(base)
    target = f"{parts.scheme}://{parts.netloc}/robots.txt"
    r = fetch(target, timeout=8, max_bytes=200_000)
    if r.status != 200:
        return {"url": target, "status": r.status, "found": False, "problems": [f"robots.txt returned {r.status}."], "groups": [], "sitemaps": []}
    groups: list[dict] = []
    sitemaps: list[str] = []
    problems: list[str] = []
    current: dict | None = None
    for n, raw in enumerate(r.text.splitlines(), 1):
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        key, sep, value = line.partition(":")
        if not sep:
            problems.append(f"Line {n}: not a directive ({raw.strip()[:60]}).")
            continue
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            if current is None or current["rules"]:
                current = {"agents": [], "rules": []}
                groups.append(current)
            current["agents"].append(value)
        elif key in ("allow", "disallow", "crawl-delay"):
            if current is None:
                problems.append(f"Line {n}: {key} before any User-agent.")
                continue
            if key != "crawl-delay" and value and not value.startswith(("/", "*")):
                problems.append(f"Line {n}: {key} path should start with / (got {value[:40]}).")
            current["rules"].append({"type": key, "value": value})
        elif key == "sitemap":
            sitemaps.append(value)
            if not value.startswith(("http://", "https://")):
                problems.append(f"Line {n}: Sitemap must be an absolute URL.")
        elif key == "host":
            pass
        else:
            problems.append(f"Line {n}: unknown directive {key}.")
    blocks_all = any("*" in g["agents"] and any(r["type"] == "disallow" and r["value"] == "/" for r in g["rules"]) for g in groups)
    if blocks_all:
        problems.append("A wildcard group disallows / which blocks all crawling.")
    if not sitemaps:
        problems.append("No Sitemap directive.")
    return {"url": target, "status": r.status, "found": True, "groups": groups, "sitemaps": sitemaps, "problems": problems, "blocks_all": blocks_all, "lines": len(r.text.splitlines())}


def sitemap_validator(url: str) -> dict:
    target = normalize(url)
    if not target.endswith(".xml") and "sitemap" not in target:
        parts = urlsplit(target)
        target = f"{parts.scheme}://{parts.netloc}/sitemap.xml"
    r = fetch(target, timeout=10, max_bytes=2_000_000)
    out = {"url": target, "status": r.status, "type": None, "entries": 0, "sample": [], "problems": [], "truncated": r.truncated}
    if r.status != 200:
        out["problems"].append(f"Sitemap returned {r.status}.")
        return out
    try:
        root = ET.fromstring(r.body)
    except ET.ParseError as e:
        out["problems"].append(f"Not well-formed XML: {str(e)[:120]}.")
        return out
    tag = root.tag.split("}")[-1]
    ns = root.tag[: root.tag.index("}") + 1] if "}" in root.tag else ""
    if tag == "sitemapindex":
        locs = [e.text.strip() for e in root.iter(f"{ns}loc") if e.text]
        out.update(type="index", entries=len(locs), sample=locs[:10])
    elif tag == "urlset":
        urls = root.findall(f"{ns}url")
        locs = [(u.findtext(f"{ns}loc") or "").strip() for u in urls]
        out.update(type="urlset", entries=len(urls), sample=locs[:10])
        empty = sum(1 for l in locs if not l)
        if empty:
            out["problems"].append(f"{empty} <url> entries have no <loc>.")
        host = urlsplit(target).hostname
        foreign = [l for l in locs if l and (urlsplit(l).hostname or "") != host]
        if foreign:
            out["problems"].append(f"{len(foreign)} URLs are on a different host than the sitemap, e.g. {foreign[0]}.")
        if len(urls) > 50_000:
            out["problems"].append("More than 50,000 URLs; split into an index.")
        bad_lastmod = 0
        for u in urls:
            lm = u.findtext(f"{ns}lastmod")
            if lm and not re.match(r"^\d{4}-\d{2}-\d{2}", lm.strip()):
                bad_lastmod += 1
        if bad_lastmod:
            out["problems"].append(f"{bad_lastmod} lastmod values are not W3C dates.")
    else:
        out["problems"].append(f"Root element is <{tag}>, expected <urlset> or <sitemapindex>.")
    if "xml" not in r.headers.get("content-type", ""):
        out["problems"].append(f"Content-Type is {r.headers.get('content-type', 'missing')}, expected an XML type.")
    return out


def metadata_checker(url: str) -> dict:
    r = fetch(url, timeout=10)
    soup = BeautifulSoup(r.text, "lxml")
    meta = {}
    for m in soup.find_all("meta"):
        key = m.get("name") or m.get("property") or m.get("http-equiv")
        if key:
            meta[str(key).lower()] = (m.get("content") or "")[:300]
    canonical = soup.find("link", rel=lambda v: v and "canonical" in v)
    title = (soup.title.string or "").strip() if soup.title and soup.title.string else ""
    problems = []
    if not title:
        problems.append("Missing <title>.")
    elif not 15 <= len(title) <= 65:
        problems.append(f"Title length {len(title)} is outside 15 to 65 characters.")
    if not meta.get("description"):
        problems.append("Missing meta description.")
    elif not 50 <= len(meta["description"]) <= 165:
        problems.append(f"Description length {len(meta['description'])} is outside 50 to 165 characters.")
    for key in ("og:title", "og:description", "og:image", "og:url"):
        if key not in meta:
            problems.append(f"Missing {key}.")
    if "twitter:card" not in meta:
        problems.append("Missing twitter:card.")
    if not canonical:
        problems.append("Missing canonical link.")
    if "viewport" not in meta:
        problems.append("Missing viewport meta.")
    return {"url": r.final_url, "status": r.status, "title": title, "title_length": len(title), "canonical": canonical.get("href") if canonical else None, "meta": {k: v for k, v in meta.items() if k in ("description", "robots", "viewport", "twitter:card", "twitter:title", "twitter:description", "twitter:image", "author", "theme-color") or k.startswith("og:")}, "problems": problems}


def canonical_checker(url: str) -> dict:
    r = fetch(url, timeout=10)
    soup = BeautifulSoup(r.text, "lxml")
    tags = soup.find_all("link", rel=lambda v: v and "canonical" in v)
    problems = []
    declared = [t.get("href") for t in tags if t.get("href")]
    header_link = r.headers.get("link", "")
    if not declared and 'rel="canonical"' not in header_link:
        problems.append("No canonical declared in HTML or Link header.")
    if len(declared) > 1:
        problems.append(f"{len(declared)} canonical tags; there should be one.")
    resolved = urljoin(r.final_url, declared[0]) if declared else None
    self_ref = resolved is not None and resolved.rstrip("/") == r.final_url.rstrip("/")
    if declared and not declared[0].startswith(("http://", "https://")):
        problems.append("Canonical is relative; use an absolute URL.")
    if resolved and resolved.startswith("http://") and r.final_url.startswith("https://"):
        problems.append("Canonical points at http while the page is https.")
    if r.redirects:
        problems.append(f"The requested address redirected {len(r.redirects)} time(s) before the final page.")
    return {"url": r.final_url, "requested": r.url, "status": r.status, "canonical": resolved, "self_referencing": self_ref, "header_canonical": 'rel="canonical"' in header_link, "redirects": r.redirects, "problems": problems}


def redirect_checker(url: str) -> dict:
    r = fetch(url, method="HEAD", timeout=10, max_bytes=1)
    if r.status in (405, 403, 501):
        r = fetch(url, method="GET", timeout=10, max_bytes=1024)
    hops = [{"from": h["from"], "to": h["to"], "status": h["status"]} for h in r.redirects]
    problems = []
    if len(hops) > 1:
        problems.append(f"Chain of {len(hops)} redirects; link to the final address directly.")
    if any(h["status"] == 302 for h in hops):
        problems.append("A 302 (temporary) redirect is used; use 301 or 308 for permanent moves.")
    if r.url.startswith("http://") and r.final_url.startswith("https://") and hops and hops[0]["status"] not in (301, 308):
        problems.append("The http to https redirect is not permanent.")
    return {"requested": r.url, "final_url": r.final_url, "final_status": r.status, "hops": hops, "hop_count": len(hops), "problems": problems}


TOOLS = {
    "robots-validator": robots_validator,
    "sitemap-validator": sitemap_validator,
    "metadata-checker": metadata_checker,
    "canonical-checker": canonical_checker,
    "redirect-checker": redirect_checker,
}


def run_tool(name: str, url: str) -> dict:
    fn = TOOLS.get(name)
    if fn is None:
        raise KeyError(name)
    validate(url)  # policy check up front; the fetcher re-checks every hop
    try:
        return fn(url)
    except FetchError as e:
        raise FetchError(e.reason)
