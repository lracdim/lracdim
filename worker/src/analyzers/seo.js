import { fetchCached, finding as F, origin, result } from './base.js';

/** robots.txt and sitemap state: ["present"|"missing"|"blocks_all", "present"|"missing"]. */
async function robots(ctx) {
  const base = origin(ctx);
  let robotsState = 'missing';
  let sitemapState = 'missing';
  const sitemapUrls = [];
  const r = await fetchCached(ctx, new URL('/robots.txt', base).toString(), { timeout: 6000, maxBytes: 200_000 });
  if (r && r.status === 200 && !(r.headers['content-type'] || '').includes('html')) {
    robotsState = 'present';
    let agentAll = false;
    for (const line of r.text.split(/\r\n|\r|\n/)) {
      const idx = line.indexOf(':');
      const key = (idx === -1 ? line : line.slice(0, idx)).trim().toLowerCase();
      const value = idx === -1 ? '' : line.slice(idx + 1).trim();
      if (key === 'user-agent') agentAll = value === '*';
      else if (key === 'disallow' && agentAll && value === '/') robotsState = 'blocks_all';
      else if (key === 'sitemap' && value) sitemapUrls.push(value);
    }
  }
  const candidates = sitemapUrls.length ? sitemapUrls : [new URL('/sitemap.xml', base).toString()];
  for (const url of candidates.slice(0, 2)) {
    let s;
    try {
      s = await fetchCached(ctx, new URL(url, base).toString(), { timeout: 6000, maxBytes: 200_000 });
    } catch {
      s = null; // an unsafe sitemap address counts as no sitemap
    }
    if (s && s.status === 200 && ((s.headers['content-type'] || '').includes('xml') || s.text.trimStart().startsWith('<?xml'))) {
      sitemapState = 'present';
      break;
    }
  }
  return [robotsState, sitemapState];
}

export async function seo(ctx, { checkRobots = true } = {}) {
  const page = ctx.page;
  const findings = [];
  const title = page.title;
  const descTag = page.meta('name', 'description');
  const desc = descTag ? (descTag.attrs.content || '').trim() : '';
  const robotsTag = page.meta('name', 'robots');
  const robotsMeta = robotsTag ? (robotsTag.attrs.content || '').toLowerCase() : '';
  const canonical = page.linkRel('canonical');
  const og = {};
  for (const m of page.all('meta')) {
    if ('property' in m.attrs && String(m.attrs.property).startsWith('og:')) og[m.attrs.property] = m.attrs.content;
  }
  const twitter = page.meta('name', 'twitter:card');
  const imgs = page.all('img');
  const missingAlt = imgs.filter((i) => !('alt' in i.attrs) && i.attrs.role !== 'presentation'); // alt="" is a valid decorative marker
  const xRobots = (ctx.fetched.headers['x-robots-tag'] || '').toLowerCase();

  let robotsTxt = null;
  let sitemap = null;
  if (checkRobots) [robotsTxt, sitemap] = await robots(ctx);

  const metrics = {
    title,
    title_length: title.length,
    description_length: desc.length,
    canonical: canonical ? canonical.attrs.href ?? null : null,
    robots_meta: robotsMeta,
    x_robots_tag: xRobots,
    open_graph: Object.keys(og).sort(),
    twitter_card: !!twitter,
    images: imgs.length,
    images_missing_alt: missingAlt.length,
    robots_txt: robotsTxt,
    sitemap
  };

  if (!title) {
    findings.push(F('no_title', 'critical', 'Missing page title', 'No <title> element.', 'The title is the headline in search results and the browser tab.', 'Add a unique, descriptive title of 30 to 60 characters.', 'The page can be presented in search results.'));
  } else if (title.length < 15) {
    findings.push(F('short_title', 'medium', 'Title is very short', `Title: "${title}" (${title.length} characters).`, 'Short titles rarely describe the page or match searches.', 'Expand the title to say what the page is and who it is for.', 'Better click-through from results.'));
  } else if (title.length > 65) {
    findings.push(F('long_title', 'low', 'Title is likely to be cut off', `${title.length} characters.`, 'Search results truncate titles beyond roughly 60 characters.', 'Move the key words to the front and shorten.', 'The full title shows in results.'));
  }
  if (!desc) {
    findings.push(F('no_description', 'high', 'Missing meta description', 'No <meta name="description">.', 'Search engines write their own snippet from page text, usually worse than yours.', 'Add a 70 to 155 character description that states what the page offers.', 'Controlled, relevant snippets in results.'));
  } else if (desc.length > 165) {
    findings.push(F('long_description', 'low', 'Meta description is long', `${desc.length} characters.`, 'Results truncate descriptions beyond about 155 characters.', 'Shorten to the essential sentence.', 'The whole snippet is visible.'));
  }
  if (!canonical) {
    findings.push(F('no_canonical', 'medium', 'No canonical URL', 'No <link rel="canonical">.', 'Duplicate addresses (with and without slash, query strings, http) split ranking signals.', 'Declare the preferred address on every page.', 'Signals consolidate on one address.'));
  }
  if (robotsMeta.includes('noindex') || xRobots.includes('noindex')) {
    findings.push(F('noindex', 'critical', 'Page is marked noindex', `robots: ${robotsMeta || xRobots}`, 'Search engines are told not to index this page.', 'Remove noindex if the page should appear in search.', 'The page becomes eligible for indexing.'));
  }
  if (!og['og:title'] || !og['og:description']) {
    findings.push(F('no_open_graph', 'low', 'Incomplete Open Graph metadata', `Present: ${Object.keys(og).sort().join(', ') || 'none'}`, 'Shared links on social platforms fall back to generic previews.', 'Add og:title, og:description, og:image, and og:url.', 'Rich link previews when the page is shared.'));
  }
  if (missingAlt.length) {
    findings.push(F('images_missing_alt', missingAlt.length > 2 ? 'medium' : 'low', 'Images without alt text', `${missingAlt.length} of ${imgs.length} images have no alt attribute (an empty alt marks decoration and is not counted).`, 'Image search and assistive technology get nothing to work with.', 'Add descriptive alt text; use alt="" only for decoration.', 'Accessible and indexable images.'));
  }
  if (checkRobots) {
    if (robotsTxt === 'missing') {
      findings.push(F('no_robots_txt', 'low', 'No robots.txt', 'GET /robots.txt did not return a robots file.', 'Crawlers proceed with defaults; you cannot point them at a sitemap.', 'Publish /robots.txt with a Sitemap: line.', 'Explicit crawl guidance.'));
    } else if (robotsTxt === 'blocks_all') {
      findings.push(F('robots_blocks_all', 'critical', 'robots.txt blocks all crawling', 'Disallow: / for all user agents.', 'No search engine may crawl the site.', 'Remove or narrow the Disallow rule.', 'The site can be crawled and indexed.'));
    }
    if (sitemap === 'missing') {
      findings.push(F('no_sitemap', 'low', 'No sitemap found', 'robots.txt declares no sitemap and /sitemap.xml did not respond with XML.', 'Discovery depends entirely on links.', 'Publish sitemap.xml and reference it from robots.txt.', 'Faster discovery of new and changed pages.'));
    }
  }
  return result('seo', findings, metrics);
}
