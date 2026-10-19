import { finding as F, result } from './base.js';

/** Transport and response-header hygiene of the home page. Not a vulnerability scan. */
export function security(ctx) {
  const h = ctx.fetched.headers;
  const findings = [];
  const https = ctx.fetched.https;
  const hsts = h['strict-transport-security'] || '';
  const csp = h['content-security-policy'] || '';
  const xcto = (h['x-content-type-options'] || '').toLowerCase();
  const xfo = h['x-frame-options'] || '';
  const referrer = h['referrer-policy'] || '';
  const permissions = h['permissions-policy'] || '';
  const server = h.server || '';
  const powered = h['x-powered-by'] || '';
  const mixed = https
    ? ctx.page.all('script', 'img', 'iframe').filter((t) => 'src' in t.attrs && String(t.attrs.src).startsWith('http://')).map((t) => t.attrs.src)
    : [];
  const formsHttp = ctx.page.all('form').filter((f) => 'action' in f.attrs && String(f.attrs.action).startsWith('http://'));

  const metrics = {
    https,
    hsts: !!hsts,
    csp: !!csp,
    x_content_type_options: xcto === 'nosniff',
    x_frame_options: xfo || null,
    referrer_policy: referrer || null,
    permissions_policy: !!permissions,
    server_header: server || null,
    x_powered_by: powered || null,
    mixed_content: mixed.length,
    note: 'Header review of the home page response. Not a vulnerability scan.'
  };

  if (!https) {
    findings.push(F('sec_no_https', 'critical', 'No HTTPS', 'The page is served over plain http.', 'Traffic can be read and altered in transit; browsers warn visitors.', 'Serve everything over HTTPS and redirect http.', 'Encrypted, trusted connections.'));
  } else if (!hsts) {
    findings.push(F('no_hsts', 'medium', 'No HTTP Strict Transport Security', 'No Strict-Transport-Security header.', 'First visits and downgraded links can still be sent over http.', 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains.', 'Browsers refuse insecure connections to the site.'));
  }
  if (!csp) {
    findings.push(F('no_csp', 'medium', 'No Content Security Policy', 'No Content-Security-Policy header.', 'Injected scripts run with full access to the page.', "Add a policy, starting with default-src 'self' and a report-only phase.", 'Injected content is blocked or reported.'));
  }
  if (xcto !== 'nosniff') {
    findings.push(F('no_nosniff', 'low', 'No X-Content-Type-Options', 'Header missing or not nosniff.', 'Browsers may guess a file type and execute what should be inert.', 'Add X-Content-Type-Options: nosniff.', 'Files are treated as declared.'));
  }
  if (!xfo && !csp.includes('frame-ancestors')) {
    findings.push(F('no_framing_protection', 'medium', 'Page can be framed by other sites', 'No X-Frame-Options and no frame-ancestors directive.', 'The page can be embedded in a hostile page for click-jacking.', 'Add X-Frame-Options: SAMEORIGIN or a frame-ancestors directive.', 'The page cannot be framed elsewhere.'));
  }
  if (!referrer) {
    findings.push(F('no_referrer_policy', 'low', 'No Referrer-Policy', 'Header missing.', 'Full URLs, including query strings, leak to other sites in the Referer header.', 'Add Referrer-Policy: strict-origin-when-cross-origin.', 'Less information leaks on outbound links.'));
  }
  if (powered || (server && /\d/.test(server))) {
    findings.push(F('version_disclosure', 'low', 'Server software disclosed', `Server: ${server || '-'}; X-Powered-By: ${powered || '-'}`, 'Version strings help attackers pick known exploits.', 'Remove X-Powered-By and hide the Server version.', 'Less reconnaissance information.'));
  }
  if (mixed.length) {
    findings.push(F('mixed_content', 'high', 'Mixed content', `${mixed.length} resources load over http on an https page, e.g. ${mixed[0]}`, 'Browsers block or warn on these resources.', 'Load every resource over https.', 'No mixed-content warnings or blocked assets.'));
  }
  if (formsHttp.length) {
    findings.push(F('insecure_form', 'high', 'Form posts over http', `${formsHttp.length} forms submit to an http address.`, 'Submitted data travels unencrypted.', 'Point form actions at https endpoints.', 'Form data is protected in transit.'));
  }
  return result('security', findings, metrics);
}
