import { finding as F, result, thousands } from './base.js';

export function technical(ctx) {
  const f = ctx.fetched;
  const page = ctx.page;
  const findings = [];
  const html = page.first('html');
  const lang = (html && html.attrs.lang) || '';
  const viewport = page.meta('name', 'viewport');
  const canonical = page.linkRel('canonical');
  const doctype = page.doctype;
  const h1s = page.all('h1');
  const headings = page.all('h1', 'h2', 'h3', 'h4', 'h5', 'h6').map((t) => Number(t.tag[1]));
  let skips = 0;
  for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) skips++;
  const contentType = f.headers['content-type'] || '';

  const metrics = {
    status: f.status,
    final_url: f.final_url,
    redirect_count: f.redirects.length,
    https: f.https,
    content_type: contentType,
    doctype,
    lang,
    viewport: !!viewport,
    canonical: canonical ? canonical.attrs.href ?? null : null,
    h1_count: h1s.length,
    heading_skips: skips,
    truncated: f.truncated
  };

  if (f.status >= 500) {
    findings.push(F('http_5xx', 'critical', 'Server error on the home page', `The server answered ${f.status}.`, 'Visitors and crawlers receive an error instead of the page.', 'Check application logs and hosting status; fix the failing request.', 'The page becomes reachable again.'));
  } else if (f.status >= 400) {
    findings.push(F('http_4xx', 'critical', 'Home page returns an error status', `The server answered ${f.status}.`, 'Search engines drop pages that return client errors.', 'Make sure the address serves a 200 response.', 'The page can be indexed and visited.'));
  }
  if (f.redirects.length > 2) {
    findings.push(F('redirect_chain', 'medium', 'Long redirect chain', `${f.redirects.length} redirects before the final page: ` + f.redirects.map((r) => r.to).join(' → '), 'Each hop adds a round trip and dilutes link signals.', 'Point links and DNS at the final address directly.', 'Faster first load and cleaner link equity.'));
  }
  if (!f.https) {
    findings.push(F('no_https', 'critical', 'Page is served without HTTPS', `Final address: ${f.final_url}`, 'Browsers flag the page as not secure and search engines prefer HTTPS.', 'Install a certificate and redirect all http traffic to https.', 'Secure padlock, no warnings, ranking parity restored.'));
  }
  if (!contentType.includes('text/html')) {
    findings.push(F('content_type', 'high', 'Response is not HTML', `Content-Type: ${contentType || 'missing'}`, 'Browsers and crawlers cannot treat the response as a page.', 'Serve text/html with a charset.', 'The document is parsed as a page.'));
  }
  if (!doctype) {
    findings.push(F('no_doctype', 'low', 'Missing doctype', 'The document does not begin with <!DOCTYPE html>.', 'Browsers fall back to quirks mode, which changes layout rules.', 'Add <!DOCTYPE html> as the first line.', 'Consistent standards-mode rendering.'));
  }
  if (!lang) {
    findings.push(F('no_lang', 'medium', 'No document language', 'The <html> element has no lang attribute.', 'Screen readers and translation tools guess the language.', 'Add lang="en" or the correct code to <html>.', 'Correct pronunciation and language handling.'));
  }
  if (!viewport) {
    findings.push(F('no_viewport', 'high', 'No viewport meta tag', 'No <meta name="viewport"> found.', 'Mobile browsers render the page at desktop width and shrink it.', 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.', 'Readable mobile layout without zooming.'));
  }
  if (h1s.length === 0) {
    findings.push(F('no_h1', 'medium', 'No H1 heading', 'The page has no <h1>.', 'The main topic of the page is not declared to assistive technology or search engines.', 'Add one H1 that names the page.', 'Clear page topic for readers and crawlers.'));
  } else if (h1s.length > 1) {
    findings.push(F('multi_h1', 'low', 'Multiple H1 headings', `${h1s.length} <h1> elements found.`, 'Several competing headings blur what the page is about.', 'Keep one H1; demote the others.', 'Cleaner outline.'));
  }
  if (skips) {
    findings.push(F('heading_skips', 'low', 'Heading levels skipped', `${skips} place(s) where the heading level jumps by more than one.`, 'Outline navigation in screen readers relies on consecutive levels.', 'Use H2 under H1, H3 under H2, and so on.', 'Navigable document outline.'));
  }
  if (f.truncated) {
    findings.push(F('oversized_document', 'medium', 'Document exceeds the read limit', `Only the first ${thousands(f.body.byteLength)} bytes were read.`, 'Very large HTML delays rendering and this examination read only part of it.', 'Reduce inline scripts, styles, and markup in the initial document.', 'Faster parse and complete examinations.'));
  }
  return result('technical', findings, metrics);
}
