/**
 * Forge tools added with the redesign:
 *   email-deliverability  SPF, DKIM, DMARC, MX (DNS lookups only, no fetch of the domain)
 *   structured-data       JSON-LD found on a page, its types, and what each type is missing
 *   llms-txt              site name, description and sitemap pages for an llms.txt draft
 *
 * The analysis functions are pure so they are unit-tested without the network.
 */
import { fetchPage } from './fetcher.js';
import { parseSitemap } from './forge.js';
import { Page } from './page.js';
import { normalize } from './ssrf.js';

/* ======================================================================
   DNS (Cloudflare DNS-over-HTTPS, the resolver ssrf.js already uses)
   ====================================================================== */
const DOH = 'https://cloudflare-dns.com/dns-query';
const TYPE = { TXT: 16, MX: 15, CNAME: 5 };

/** One DoH query. Returns the answer data strings for `type`, or null if the resolver failed. */
export async function dnsQuery(name, type, budget) {
  budget?.take(1);
  try {
    const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.Answer || []).filter((a) => a.type === TYPE[type]).map((a) => a.data);
  } catch {
    return null;
  }
}

/** A TXT answer arrives quoted and may be split into several strings; join them. */
export function txtValue(data) {
  const parts = String(data).match(/"((?:[^"\\]|\\.)*)"/g);
  if (!parts) return String(data).trim();
  return parts.map((p) => p.slice(1, -1).replace(/\\"/g, '"')).join('');
}

/** Turn "www.example.com", "https://example.com/x" or "you@example.com" into a bare domain. */
export function emailDomain(raw) {
  let s = String(raw || '').trim().toLowerCase();
  if (s.includes('@')) s = s.slice(s.lastIndexOf('@') + 1);
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#:]/)[0].replace(/\.$/, '');
  if (s.startsWith('www.')) s = s.slice(4);
  if (!/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s)) return null;
  return s;
}

/* Common DKIM selectors by sender. A custom one can be given too. */
export const DKIM_SELECTORS = ['default', 'google', 'selector1', 'selector2', 'k1', 'k2', 's1', 's2', 'mail', 'dkim', 'resend', 'titan1', 'zoho', 'zmail', 'mailjet', 'pm', 'mandrill', 'fm1', 'protonmail', 'hs1', 'smtp'];

const MX_PROVIDERS = [
  [/google\.com$|googlemail\.com$/, 'Google Workspace'],
  [/outlook\.com$|protection\.outlook\.com$/, 'Microsoft 365'],
  [/titan\.email$/, 'Titan'],
  [/zoho\.(com|eu|in)$/, 'Zoho Mail'],
  [/secureserver\.net$/, 'GoDaddy'],
  [/protonmail\.ch$/, 'Proton Mail'],
  [/mx\.cloudflare\.net$/, 'Cloudflare Email Routing'],
  [/amazonaws\.com$/, 'Amazon SES'],
  [/mailgun\.org$/, 'Mailgun'],
  [/hostinger\.com$/, 'Hostinger'],
  [/yandex\.(net|ru)$/, 'Yandex']
];
const SPF_SENDERS = [
  [/_spf\.google\.com/, 'Google Workspace'],
  [/spf\.protection\.outlook\.com/, 'Microsoft 365'],
  [/spf\.titan\.email/, 'Titan'],
  [/zoho\./, 'Zoho Mail'],
  [/amazonses\.com/, 'Amazon SES / Resend'],
  [/sendgrid\.net/, 'SendGrid'],
  [/mailgun\.org/, 'Mailgun'],
  [/servers\.mcsv\.net|mailchimp/, 'Mailchimp'],
  [/spf\.mandrillapp\.com/, 'Mandrill'],
  [/_spf\.mx\.cloudflare\.net/, 'Cloudflare'],
  [/hubspot|hubspotemail\.net/, 'HubSpot'],
  [/secureserver\.net/, 'GoDaddy']
];

export function parseTags(record) {
  const tags = {};
  for (const part of record.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    tags[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return tags;
}

/** SPF: one record, a sensible "all", under ten DNS lookups. */
export function analyzeSpf(records) {
  const spf = records.filter((r) => /^v=spf1(\s|$)/i.test(r));
  const out = { key: 'spf', label: 'SPF', records: spf, status: 'pass', points: 30, notes: [], fixes: [], senders: [] };
  if (!spf.length) {
    return { ...out, status: 'fail', points: 0, summary: 'No SPF record. Receiving servers cannot tell which servers may send mail for this domain.', fixes: ['Publish one TXT record at the root, for example: v=spf1 include:<your email provider> ~all'] };
  }
  if (spf.length > 1) {
    return { ...out, status: 'fail', points: 5, summary: `${spf.length} SPF records. More than one is an error (permerror) and receivers ignore all of them.`, fixes: ['Merge them into a single v=spf1 record with every include you need.'] };
  }
  const terms = spf[0].split(/\s+/).slice(1).filter(Boolean);
  out.senders = [...new Set(SPF_SENDERS.filter(([re]) => re.test(spf[0])).map(([, name]) => name))];
  const lookups = terms.filter((t) => /^[+~?-]?(include:|a\b|a:|a\/|mx\b|mx:|mx\/|ptr|exists:)/i.test(t) || /^redirect=/i.test(t)).length;
  const all = terms.find((t) => /^[+~?-]?all$/i.test(t));
  if (lookups > 10) {
    out.status = 'fail';
    out.points = 10;
    out.notes.push(`${lookups} DNS lookups at the top level alone; the limit is 10, so receivers return an error.`);
    out.fixes.push('Remove senders you no longer use, or flatten includes into ip4/ip6 ranges.');
  } else if (lookups >= 8) {
    out.notes.push(`${lookups} DNS lookups before counting nested includes; close to the limit of 10.`);
  }
  if (!all) {
    out.status = out.status === 'fail' ? 'fail' : 'warn';
    out.points = Math.min(out.points, 20);
    out.notes.push('No "all" mechanism, so mail from unlisted servers is treated as neutral.');
    out.fixes.push('End the record with ~all (soft fail) or -all (hard fail).');
  } else if (/^\+?all$/i.test(all)) {
    out.status = 'fail';
    out.points = 0;
    out.notes.push('"+all" allows every server on the internet to send as this domain.');
    out.fixes.push('Replace +all with ~all or -all.');
  } else if (/^\?all$/i.test(all)) {
    out.status = out.status === 'fail' ? 'fail' : 'warn';
    out.points = Math.min(out.points, 20);
    out.notes.push('"?all" is neutral and gives no protection.');
    out.fixes.push('Use ~all or -all.');
  }
  if (terms.some((t) => /^[+~?-]?ptr/i.test(t))) {
    out.notes.push('"ptr" is deprecated and slow; some receivers ignore it.');
    out.fixes.push('Replace ptr with ip4/ip6 or include mechanisms.');
  }
  out.summary =
    out.status === 'pass'
      ? `One valid SPF record ending in ${all}${out.senders.length ? `, authorising ${out.senders.join(', ')}` : ''}.`
      : out.notes[0];
  return out;
}

/** DMARC: present, enforcing, reporting. */
export function analyzeDmarc(records) {
  const dmarc = records.filter((r) => /^v=DMARC1/i.test(r));
  const out = { key: 'dmarc', label: 'DMARC', records: dmarc, status: 'pass', points: 30, notes: [], fixes: [] };
  if (!dmarc.length) {
    return { ...out, status: 'fail', points: 0, summary: 'No DMARC record. Anyone can send mail that claims to be from this domain, and Gmail and Yahoo now expect DMARC from bulk senders.', fixes: ['Add a TXT record at _dmarc with: v=DMARC1; p=none; rua=mailto:you@yourdomain — then move to p=quarantine once reports look clean.'] };
  }
  if (dmarc.length > 1) {
    return { ...out, status: 'fail', points: 5, summary: `${dmarc.length} DMARC records; receivers ignore DMARC when there is more than one.`, fixes: ['Keep a single v=DMARC1 record at _dmarc.'] };
  }
  const t = parseTags(dmarc[0]);
  out.policy = (t.p || '').toLowerCase();
  if (!['none', 'quarantine', 'reject'].includes(out.policy)) {
    return { ...out, status: 'fail', points: 5, summary: 'The DMARC record has no valid p= policy.', fixes: ['Set p=none, p=quarantine or p=reject.'] };
  }
  if (out.policy === 'none') {
    out.status = 'warn';
    out.points = 18;
    out.notes.push('p=none only monitors; spoofed mail is still delivered.');
    out.fixes.push('Once reports show your real senders pass, change to p=quarantine, then p=reject.');
  }
  if (!t.rua) {
    out.points -= 4;
    out.notes.push('No rua= address, so you receive no reports about who sends as you.');
    out.fixes.push('Add rua=mailto:dmarc@yourdomain (or a report service) to see who sends as you.');
  }
  const pct = t.pct ? Number(t.pct) : 100;
  if (pct < 100) out.notes.push(`pct=${pct}: the policy applies to only ${pct}% of failing mail.`);
  out.summary = `Policy p=${out.policy}${out.policy === 'reject' ? ' — the strongest protection' : out.policy === 'quarantine' ? ' — failing mail goes to spam' : ''}${t.rua ? ', with reports' : ''}.`;
  if (out.status !== 'pass') out.summary = `${out.summary} ${out.notes[0]}`;
  return out;
}

/** Approximate RSA size from the base64 public key. */
export function dkimKeyBits(p) {
  const bytes = Math.floor((String(p).replace(/\s+/g, '').length * 3) / 4);
  if (!bytes) return 0;
  if (bytes > 520) return 4096;
  if (bytes > 270) return 2048;
  if (bytes > 130) return 1024;
  return 512;
}

/** DKIM: [{selector, records}] for each selector checked. */
export function analyzeDkim(found, customSelector) {
  const keys = found
    .filter((f) => f.records.some((r) => /(^|;)\s*p=/i.test(r) || /^v=DKIM1/i.test(r)))
    .map((f) => {
      const record = f.records.find((r) => /(^|;)\s*p=/i.test(r) || /^v=DKIM1/i.test(r));
      const t = parseTags(record);
      const revoked = 'p' in t && !t.p;
      const type = (t.k || 'rsa').toLowerCase();
      return { selector: f.selector, type, revoked, bits: revoked || type !== 'rsa' ? null : dkimKeyBits(t.p || '') };
    });
  const out = { key: 'dkim', label: 'DKIM', keys, status: 'pass', points: 30, notes: [], fixes: [] };
  const live = keys.filter((k) => !k.revoked);
  if (!live.length) {
    out.status = 'warn';
    out.points = 8;
    out.summary = customSelector
      ? `No DKIM key at the "${customSelector}" selector or the common ones checked.`
      : 'No DKIM key found at the common selectors. DKIM can still exist under a custom selector.';
    out.fixes.push('Turn on DKIM signing in your email provider and publish the TXT (or CNAME) record it gives you. To find an existing selector, open a sent email\'s headers and read the s= value in DKIM-Signature, then check that selector here.');
    return out;
  }
  const weak = live.filter((k) => k.bits && k.bits < 2048);
  if (weak.length) {
    out.status = 'warn';
    out.points = 20;
    const which = weak.length === live.length
      ? (live.length === 1 ? 'The key is' : 'All of them are')
      : `${weak.map((k) => k.selector).join(', ')} ${weak.length === 1 ? 'is' : 'are'}`;
    out.notes.push(`${which} under 2048 bits, which is considered weak.`);
    out.fixes.push('Rotate to a 2048-bit DKIM key in your email provider.');
  }
  out.summary = `Signing keys found: ${live.map((k) => k.selector).join(', ')}.${out.notes.length ? ` ${out.notes[0]}` : ''}`;
  return out;
}

/** MX: can the domain receive mail, and who hosts it. */
export function analyzeMx(answers) {
  const mx = answers
    .map((a) => {
      const [prio, host] = String(a).trim().split(/\s+/);
      return { priority: Number(prio), host: (host || '').replace(/\.$/, '').toLowerCase() };
    })
    .filter((m) => m.host)
    .sort((a, b) => a.priority - b.priority);
  const provider = mx.length ? (MX_PROVIDERS.find(([re]) => re.test(mx[0].host)) || [null, null])[1] : null;
  if (!mx.length) {
    return { key: 'mx', label: 'MX', mx, provider, status: 'warn', points: 4, summary: 'No MX records: this domain cannot receive email. Fine for a send-only domain; a problem if replies should arrive here.', fixes: ['If people reply to this domain, add the MX records from your email provider.'], notes: [] };
  }
  return { key: 'mx', label: 'MX', mx, provider, status: 'pass', points: 10, summary: `Receives mail${provider ? ` with ${provider}` : ''} on ${mx.length} server${mx.length === 1 ? '' : 's'}.`, fixes: [], notes: [] };
}

export function gradeFor(score) {
  return score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : score >= 35 ? 'D' : 'F';
}

/** Combine the four checks into the tool's result. Pure: takes DNS answers. */
export function analyzeEmail({ domain, rootTxt, dmarcTxt, mx, dkim, bimi, mtaSts, selector }) {
  const checks = [analyzeSpf(rootTxt), analyzeDkim(dkim, selector), analyzeDmarc(dmarcTxt), analyzeMx(mx)];
  const score = Math.max(0, Math.min(100, checks.reduce((s, c) => s + c.points, 0)));
  const extras = [];
  if (bimi.some((r) => /^v=BIMI1/i.test(r))) extras.push('BIMI record published: supporting inboxes can show your logo.');
  if (mtaSts.some((r) => /^v=STSv1/i.test(r))) extras.push('MTA-STS is enabled: mail to this domain must use encrypted transport.');
  const problems = checks.filter((c) => c.status !== 'pass').map((c) => `${c.label}: ${c.summary}`);
  return { url: domain, domain, score, grade: gradeFor(score), checks, extras, problems };
}

async function emailDeliverability(raw, budget, body = {}) {
  const domain = emailDomain(raw);
  if (!domain) {
    const err = new Error('Enter a domain like example.com or an address like you@example.com.');
    err.code = 'invalid_domain';
    throw err;
  }
  const custom = typeof body.selector === 'string' && /^[a-z0-9._-]{1,63}$/i.test(body.selector.trim()) ? body.selector.trim().toLowerCase() : null;
  const selectors = [...new Set([...(custom ? [custom] : []), ...DKIM_SELECTORS])];
  const txt = async (name) => ((await dnsQuery(name, 'TXT', budget)) || []).map(txtValue);
  const [rootTxt, dmarcTxt, mxAnswers, bimi, mtaSts, ...dkimAnswers] = await Promise.all([
    txt(domain),
    txt(`_dmarc.${domain}`),
    dnsQuery(domain, 'MX', budget),
    txt(`default._bimi.${domain}`),
    txt(`_mta-sts.${domain}`),
    ...selectors.map((s) => txt(`${s}._domainkey.${domain}`))
  ]);
  if (mxAnswers === null && !rootTxt.length) {
    const err = new Error('The DNS lookup failed. Try again in a moment.');
    err.code = 'dns_failed';
    throw err;
  }
  const dkim = selectors.map((selector, i) => ({ selector, records: dkimAnswers[i] }));
  return { ...analyzeEmail({ domain, rootTxt, dmarcTxt, mx: mxAnswers || [], dkim, bimi, mtaSts, selector: custom }), selectors_checked: selectors.length };
}

/* ======================================================================
   Structured data
   ====================================================================== */
/* What each common type needs to qualify for its rich result (required),
   and what search and answer engines read beyond that (recommended). */
export const SCHEMA_RULES = {
  Organization: { required: ['name', 'url'], recommended: ['logo', 'sameAs', 'contactPoint'] },
  LocalBusiness: { required: ['name', 'address'], recommended: ['telephone', 'openingHoursSpecification', 'geo', 'url', 'priceRange', 'image'] },
  WebSite: { required: ['name', 'url'], recommended: [] },
  Person: { required: ['name'], recommended: ['url', 'jobTitle', 'sameAs', 'image'] },
  Article: { required: ['headline'], recommended: ['author', 'datePublished', 'dateModified', 'image', 'publisher'] },
  BlogPosting: { required: ['headline'], recommended: ['author', 'datePublished', 'dateModified', 'image'] },
  NewsArticle: { required: ['headline'], recommended: ['author', 'datePublished', 'image'] },
  FAQPage: { required: ['mainEntity'], recommended: [] },
  Product: { required: ['name'], recommended: ['image', 'description', 'offers', 'aggregateRating', 'brand'] },
  Service: { required: ['name'], recommended: ['provider', 'areaServed', 'description', 'serviceType'] },
  BreadcrumbList: { required: ['itemListElement'], recommended: [] },
  Event: { required: ['name', 'startDate', 'location'], recommended: ['endDate', 'image', 'offers', 'description'] },
  HowTo: { required: ['name', 'step'], recommended: ['image', 'totalTime'] },
  WebApplication: { required: ['name'], recommended: ['applicationCategory', 'offers', 'operatingSystem'] },
  SoftwareApplication: { required: ['name'], recommended: ['applicationCategory', 'offers', 'operatingSystem'] }
};
const LOCAL_SUBTYPES = /(Business|Store|Restaurant|Clinic|Dentist|Physician|Attorney|LegalService|Agency|Contractor|Service|Hotel|Shop|AutoRepair|RealEstateAgent|AccountingService|SecurityService|EmploymentAgency|School)$/;

function nodesOf(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => nodesOf(v, out));
  else if (value && typeof value === 'object') {
    if (value['@type']) out.push(value);
    if (value['@graph']) nodesOf(value['@graph'], out);
  }
  return out;
}

function rulesFor(type) {
  if (SCHEMA_RULES[type]) return [type, SCHEMA_RULES[type]];
  if (LOCAL_SUBTYPES.test(type) && type !== 'Service') return ['LocalBusiness', SCHEMA_RULES.LocalBusiness];
  return [null, null];
}

/** Pure: read every JSON-LD block in the HTML and check the nodes it declares. */
export function analyzeStructuredData(html) {
  const page = new Page(html);
  const blocks = [];
  const items = [];
  const problems = [];
  page.all('script').forEach((s) => {
    if (String(s.attrs.type || '').trim().toLowerCase() !== 'application/ld+json') return;
    const raw = Page.raw(s).trim();
    try {
      const data = JSON.parse(raw);
      const nodes = nodesOf(data);
      blocks.push({ valid: true, types: nodes.map((n) => [].concat(n['@type']).join(', ')), size: raw.length });
      nodes.forEach((node) => {
        const types = [].concat(node['@type']);
        types.forEach((type) => {
          const [ruleType, rule] = rulesFor(String(type));
          const missing = rule ? rule.required.filter((k) => node[k] === undefined || node[k] === '' || (Array.isArray(node[k]) && !node[k].length)) : [];
          const absent = rule ? rule.recommended.filter((k) => node[k] === undefined) : [];
          if (type === 'FAQPage' && Array.isArray(node.mainEntity)) {
            const bad = node.mainEntity.filter((q) => !q || !q.name || !q.acceptedAnswer || !q.acceptedAnswer.text).length;
            if (bad) missing.push(`${bad} question(s) without name or acceptedAnswer.text`);
          }
          items.push({ type: String(type), checkedAs: ruleType, missing, recommended: absent, name: typeof node.name === 'string' ? node.name.slice(0, 80) : typeof node.headline === 'string' ? node.headline.slice(0, 80) : null });
          if (missing.length) problems.push(`${type} is missing required ${missing.join(', ')}.`);
        });
      });
    } catch (err) {
      blocks.push({ valid: false, error: String(err.message).slice(0, 120), size: raw.length });
      problems.push(`A JSON-LD block is not valid JSON (${String(err.message).slice(0, 80)}).`);
    }
  });
  const microdata = page.elements.filter((el) => 'itemscope' in el.attrs).length;
  const types = [...new Set(items.map((i) => i.type))];
  if (!blocks.length) problems.push(microdata ? `No JSON-LD; ${microdata} microdata item(s) found instead. JSON-LD is what Google recommends and what most AI crawlers parse.` : 'No structured data on this page. Search and answer engines have to guess what the page is about.');
  const suggestions = [];
  if (!types.some((t) => /Organization|LocalBusiness/.test(t) || LOCAL_SUBTYPES.test(t))) suggestions.push('Organization or LocalBusiness: who is behind the site, with logo, contact and address.');
  if (!types.includes('WebSite')) suggestions.push('WebSite: the site name engines should show.');
  if (!types.includes('BreadcrumbList')) suggestions.push('BreadcrumbList: where this page sits in the site.');
  if (!types.includes('FAQPage') && /\?\s*<\/(h[2-4]|summary|dt|strong)>/i.test(html)) suggestions.push('FAQPage: the page has questions in headings — mark them up so answer engines can quote them.');
  return { blocks, items, types, microdata, problems, suggestions };
}

async function structuredData(url, budget) {
  const r = await fetchPage(url, { timeout: 10000, budget });
  return { url: r.final_url, status: r.status, ...analyzeStructuredData(r.text) };
}

/* ======================================================================
   llms.txt
   ====================================================================== */
const SKIP_PATHS = /\/(tag|tags|category|categories|author|page|feed|wp-json|cart|checkout|my-account|login|search)(\/|$)|\.(xml|jpg|jpeg|png|gif|webp|pdf|zip)$/i;
const ACRONYMS = new Set(['ai', 'api', 'css', 'dns', 'faq', 'geo', 'aeo', 'html', 'json', 'seo', 'sms', 'ui', 'url', 'ux', 'llms', 'txt', 'crm', 'erp', 'pwa', 'cms']);

/** Pure: group page URLs into llms.txt sections by their first path segment. */
export function groupPages(urls, origin, limit = 150) {
  const seen = new Set();
  const pages = [];
  for (const raw of urls) {
    let u;
    try {
      u = new URL(String(raw).trim());
    } catch {
      continue;
    }
    const bare = (h) => h.replace(/^www\./, '');
    if (bare(u.host) !== bare(new URL(origin).host) || SKIP_PATHS.test(u.pathname)) continue;
    const key = u.pathname.replace(/\/+$/, '') || '/';
    if (seen.has(key)) continue;
    seen.add(key);
    const segs = key.split('/').filter(Boolean);
    const section = segs.length === 0 ? 'Main' : segs.length === 1 ? 'Pages' : segs[0];
    const slug = segs.at(-1) || 'home';
    const title = slug === 'home'
      ? 'Home'
      : decodeURIComponent(slug)
          .replace(/\.(html?|php)$/i, '')
          .replace(/[-_]+/g, ' ')
          .replace(/\b[a-z]+\b/gi, (w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w))
          .replace(/^./, (c) => c.toUpperCase());
    pages.push({ url: u.toString(), section, title });
    if (pages.length >= limit) break;
  }
  return pages;
}

async function llmsTxt(url, budget) {
  const asked = new URL(normalize(url));
  const home = await fetchPage(`${asked.protocol}//${asked.host}/`, { timeout: 10000, maxBytes: 1_500_000, budget });
  // Follow the site's own redirect (bare domain → www, http → https) for everything after.
  const origin = new URL(home.final_url).origin;
  const page = new Page(home.text);
  const ogSite = page.meta('property', 'og:site_name');
  const desc = page.meta('name', 'description') || page.meta('property', 'og:description');
  const siteName = (ogSite && ogSite.attrs.content) || page.title.split(/\s[—|–-]\s/)[0] || new URL(origin).hostname;
  const problems = [];

  let existing = null;
  try {
    const l = await fetchPage(`${origin}/llms.txt`, { timeout: 6000, maxBytes: 200_000, budget });
    if (l.status === 200 && !/<html/i.test(l.text.slice(0, 500))) existing = { lines: l.text.split('\n').length, starts: l.text.slice(0, 160) };
  } catch {
    /* not reachable: treat as absent */
  }

  let sitemapUrl = `${origin}/sitemap.xml`;
  let urls = [];
  try {
    const sm = await fetchPage(sitemapUrl, { timeout: 10000, maxBytes: 1_000_000, budget });
    if (sm.status === 200) {
      const parsed = parseSitemap(sm.text);
      if (parsed.root === 'urlset') urls = parsed.urls.map((u) => u.loc || '');
      else if (parsed.root === 'sitemapindex') {
        const children = parsed.locs.slice(0, 3);
        for (const child of children) {
          try {
            const c = await fetchPage(child, { timeout: 10000, maxBytes: 1_000_000, budget });
            const cp = parseSitemap(c.text);
            if (cp.root === 'urlset') urls.push(...cp.urls.map((u) => u.loc || ''));
          } catch {
            /* skip this child sitemap */
          }
        }
        sitemapUrl = `${sitemapUrl} (index, first ${children.length} sitemaps read)`;
      }
    } else problems.push(`No sitemap at ${origin}/sitemap.xml (status ${sm.status}); only the home page is listed.`);
  } catch {
    problems.push('The sitemap could not be read; only the home page is listed.');
  }
  const pages = groupPages(urls.length ? urls : [`${origin}/`], origin);
  if (existing) problems.push(`This site already publishes /llms.txt (${existing.lines} lines). Compare before replacing it.`);
  return {
    url: origin,
    status: home.status,
    site_name: siteName.trim().slice(0, 120),
    description: (desc && desc.attrs.content ? desc.attrs.content : '').trim().slice(0, 300),
    sitemap: sitemapUrl,
    found: urls.length,
    pages,
    existing,
    problems
  };
}

export const EXTRA_TOOLS = {
  'email-deliverability': emailDeliverability,
  'structured-data': structuredData,
  'llms-txt': llmsTxt
};
/* Tools that never fetch the address they are given, so the SSRF resolve step is skipped. */
export const DNS_ONLY = new Set(['email-deliverability']);
