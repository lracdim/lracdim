import { relTokens } from '../page.js';
import { finding as F, result, thousands } from './base.js';
import { Page } from '../page.js';

/**
 * Document-level performance indicators from the HTML and response timing
 * of one fetch. Core Web Vitals need Google PageSpeed Insights, whose
 * Lighthouse runs outlast a Worker's background time, so they are reported
 * as not measured (the Railway API had no PageSpeed key either).
 */
export function performance(ctx) {
  const { page, fetched: f } = ctx;
  const findings = [];
  const scripts = page.all('script').filter((s) => 'src' in s.attrs);
  const inlineScripts = page.all('script').filter((s) => !s.attrs.src);
  const styles = page.all('link').filter((l) => relTokens(l).includes('stylesheet'));
  const inlineStyleBytes = page.all('style').reduce((n, s) => n + Page.raw(s).length, 0);
  const imgs = page.all('img');
  const lazy = imgs.filter((i) => (i.attrs.loading || '').toLowerCase() === 'lazy');
  const unsized = imgs.filter((i) => !(i.attrs.width && i.attrs.height));
  const blocking = scripts.filter((s) => !('defer' in s.attrs || 'async' in s.attrs || s.attrs.type === 'module'));
  const thirdParty = scripts.filter((s) => (s.attrs.src || '').startsWith('http') && !(s.attrs.src || '').includes(ctx.host));
  const size = f.body.byteLength;
  const cache = f.headers['cache-control'] || '';
  const encoding = f.headers['content-encoding'] || '';

  const metrics = {
    response_ms: f.elapsed_ms,
    document_bytes: size,
    scripts: scripts.length,
    inline_scripts: inlineScripts.length,
    blocking_scripts: blocking.length,
    third_party_scripts: thirdParty.length,
    stylesheets: styles.length,
    inline_style_bytes: inlineStyleBytes,
    images: imgs.length,
    images_lazy: lazy.length,
    images_unsized: unsized.length,
    content_encoding: encoding,
    cache_control: cache,
    note: 'Document indicators come from the HTML and response timing of a single fetch, so the score can move by a few points between runs.',
    vitals: null,
    vitals_note: 'Core Web Vitals were not measured on this run.'
  };

  if (f.elapsed_ms > 3000) {
    findings.push(F('slow_response', 'high', 'Slow server response', `The document took ${f.elapsed_ms} ms to arrive.`, 'Everything else waits for the first byte; this is the floor under every load.', 'Cache the page at the edge or origin; check hosting and database queries.', 'Faster first paint on every visit.'));
  } else if (f.elapsed_ms > 1200) {
    findings.push(F('moderate_response', 'medium', 'Server response could be faster', `${f.elapsed_ms} ms to receive the document.`, 'Above about a second, delay becomes visible to visitors.', 'Add page caching or a CDN in front of the origin.', 'Sub-second delivery of the document.'));
  }
  if (size > 500_000) {
    findings.push(F('heavy_document', 'medium', 'Large HTML document', `${thousands(size)} bytes of HTML.`, 'Big documents delay parsing and push scripts and styles later.', 'Move inline CSS and JavaScript to cached files; trim markup.', 'Faster parse and render.'));
  }
  if (blocking.length > 3) {
    findings.push(F('blocking_scripts', 'high', 'Render-blocking scripts', `${blocking.length} external scripts load without defer or async.`, 'The browser pauses HTML parsing for each one.', 'Add defer to scripts that do not need to run before render.', 'Earlier first render and interaction.'));
  }
  if (scripts.length > 20) {
    findings.push(F('many_scripts', 'medium', 'High script count', `${scripts.length} external scripts.`, 'Each script is a request and a parse; totals compound on slow devices.', 'Bundle, remove unused scripts, and audit third-party tags.', 'Fewer requests, less main-thread work.'));
  }
  if (thirdParty.length > 6) {
    findings.push(F('third_party', 'low', 'Many third-party scripts', `${thirdParty.length} scripts load from other domains.`, 'Each third party is a connection and code you do not control.', 'Remove tags that no longer earn their cost; load the rest late.', 'Less variance in load time.'));
  }
  if (imgs.length && unsized.length > Math.floor(imgs.length / 2)) {
    findings.push(F('unsized_images', 'medium', 'Images without dimensions', `${unsized.length} of ${imgs.length} images lack width and height.`, 'The layout shifts as each image arrives.', 'Set width and height attributes on every image.', 'Stable layout while loading.'));
  }
  if (imgs.length > 12 && lazy.length === 0) {
    findings.push(F('no_lazy_loading', 'low', 'No lazy-loaded images', `${imgs.length} images, none with loading="lazy".`, 'Every image downloads at once, including those below the fold.', 'Add loading="lazy" to images outside the first screen.', 'Lower initial page weight.'));
  }
  if (!encoding) {
    findings.push(F('no_compression', 'medium', 'Document is not compressed', 'No Content-Encoding header on the HTML response.', 'Uncompressed HTML is typically three to five times larger over the wire.', 'Enable gzip or Brotli on the server or CDN.', 'Smaller transfers and faster loads.'));
  }
  if (!cache) {
    findings.push(F('no_cache_control', 'low', 'No Cache-Control on the document', 'The HTML response has no Cache-Control header.', 'Browsers and CDNs cannot tell how long the page may be reused.', 'Set an explicit Cache-Control policy for HTML.', 'Predictable caching behaviour.'));
  }
  return result('performance', findings, metrics);
}
