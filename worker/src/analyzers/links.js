import { BudgetExhausted, headOrGet } from '../fetcher.js';
import { isInternal, relTokens } from '../page.js';
import { finding as F, result } from './base.js';

const SKIP_SCHEMES = ['mailto:', 'tel:', 'javascript:', 'data:', '#'];

// Hosts that answer automated requests with a block (LinkedIn's 999, 403 or
// 429 challenges). A block is not evidence the link is dead, so these are
// reported as unverifiable rather than broken.
const BOT_BLOCKERS = new Set(['linkedin.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com', 'threads.net', 'pinterest.com']);
const BLOCK_STATUSES = new Set([null, 403, 429, 999]);

function unverifiable(url, status) {
  if (status === 999) return true;
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host.startsWith('www.')) host = host.slice(4);
  return BOT_BLOCKERS.has(host) && BLOCK_STATUSES.has(status);
}

/**
 * Checks a bounded sample of the page's links, internal first, with limited
 * concurrency. On the free plan the sample also stops when the examination's
 * outbound-request budget or time budget runs out; `checked` reports how many
 * were actually checked.
 */
export async function links(ctx, { maxChecked = 40, concurrency = 6, deadline = Date.now() + 15000, checker = headOrGet } = {}) {
  const base = ctx.fetched.final_url;
  const internal = [];
  const external = [];
  const seen = new Set();
  const anchors = ctx.page.all('a').filter((a) => 'href' in a.attrs);
  for (const a of anchors) {
    const href = String(a.attrs.href).trim();
    if (!href || SKIP_SCHEMES.some((s) => href.startsWith(s))) continue;
    let absolute;
    try {
      absolute = new URL(href, base).toString().split('#')[0];
    } catch {
      continue;
    }
    if (!/^https?:\/\//.test(absolute) || seen.has(absolute)) continue;
    seen.add(absolute);
    (isInternal(ctx, absolute) ? internal : external).push(absolute);
  }

  const queue = [...internal, ...external].slice(0, maxChecked);
  const results = new Map();
  let stopped = false;
  const worker = async () => {
    while (queue.length && !stopped) {
      if (Date.now() > deadline) {
        stopped = true;
        break;
      }
      const url = queue.shift();
      try {
        results.set(url, await checker(url, { timeout: 5000, budget: ctx.budget }));
      } catch (err) {
        if (err instanceof BudgetExhausted) {
          stopped = true;
          break;
        }
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  const checked = [...results.keys()];
  const unverifiableLinks = checked.filter((u) => unverifiable(u, results.get(u)[0]));
  const broken = checked.filter((u) => {
    const status = results.get(u)[0];
    return (status === null || status >= 400) && !unverifiableLinks.includes(u);
  });
  const chains = checked.filter((u) => results.get(u)[2].length > 1);
  const redirectedInternal = internal.filter((u) => results.has(u) && results.get(u)[2].length);
  const insecureInternal = ctx.scheme === 'https' ? internal.filter((u) => u.startsWith('http://')) : [];
  const nofollow = anchors.filter((a) => relTokens(a).includes('nofollow')).length;

  const metrics = {
    internal_links: internal.length,
    external_links: external.length,
    checked: checked.length,
    broken: broken.slice(0, 20),
    unverifiable: unverifiableLinks.slice(0, 20),
    redirect_chains: chains.slice(0, 20),
    redirected_internal: redirectedInternal.length,
    note: `Up to ${maxChecked} unique links are checked per examination; the counts above cover that sample.` + (stopped ? ' This run stopped early to stay within its request and time budget.' : '')
  };
  const findings = [];
  if (broken.length) {
    const sev = broken.some((u) => isInternal(ctx, u)) ? 'high' : 'medium';
    findings.push(F('broken_links', sev, 'Broken links', `${broken.length} of ${checked.length} checked links failed, e.g. ${broken[0]}`, 'Visitors hit dead ends and crawlers waste budget on errors.', 'Fix or remove each failing link; add redirects for moved pages.', 'No dead ends; crawl budget spent on live pages.'));
  }
  if (unverifiableLinks.length) {
    findings.push(F('unverifiable_links', 'low', 'Links that could not be verified', `${unverifiableLinks.length} links point at sites that block automated checks, e.g. ${unverifiableLinks[0]}`, 'Social networks answer bots with a block, so the check proves nothing either way; the link is probably fine.', 'Open each one in a browser to confirm it resolves; no change is needed if it does.', 'Confidence that profile links work, without a false alarm.'));
  }
  if (chains.length) {
    findings.push(F('link_redirect_chains', 'low', 'Links that redirect more than once', `${chains.length} links pass through two or more redirects.`, 'Each hop costs a round trip before the destination loads.', 'Link directly to the final address.', 'Faster navigation and cleaner link signals.'));
  }
  if (redirectedInternal.length > 3) {
    findings.push(F('internal_redirects', 'low', 'Internal links that redirect', `${redirectedInternal.length} internal links point at addresses that redirect.`, 'The site sends its own visitors through unnecessary hops.', 'Update internal links to their final addresses.', 'Direct internal navigation.'));
  }
  if (insecureInternal.length) {
    findings.push(F('insecure_internal_links', 'medium', 'Internal links use http', `${insecureInternal.length} internal links use http on an https site.`, 'Each one forces a redirect or, if none exists, drops the visitor to an insecure page.', 'Use https or root-relative internal links.', 'Consistent secure navigation.'));
  }
  if (!internal.length) {
    findings.push(F('no_internal_links', 'medium', 'No internal links found', 'The page links to no other page on the same site.', 'Crawlers cannot discover the rest of the site from here.', 'Add navigation and contextual links to key pages.', 'Discoverable site structure.'));
  }
  metrics.nofollow_external = nofollow;
  return result('links', findings, metrics);
}
