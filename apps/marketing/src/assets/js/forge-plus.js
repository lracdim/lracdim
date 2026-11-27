/**
 * Forge tools added with the redesign: email deliverability, structured data,
 * AI crawler policy and llms.txt. Engine calls go through api.js to
 * /api/forge/<tool>/run; everything a visitor types into a generator stays here.
 */
import { api, esc, hasApi } from './api.js';

const $ = (root, sel) => root.querySelector(sel);
function status(el, text, isError = false) {
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('is-error', !!isError);
}
async function copy(el, text, statusEl) {
  try {
    await navigator.clipboard.writeText(text);
    status(statusEl, 'Copied.');
  } catch {
    el.select?.();
    status(statusEl, 'Copy is not available here. The text is selected; press Ctrl+C.', true);
  }
}
/** Runs an engine tool with the usual busy state and error message. */
async function runEngine({ tool, body, button, statusEl, label }) {
  if (!hasApi()) {
    status(statusEl, 'The engine is not connected on this deployment, so this check cannot reach other sites here.', true);
    return null;
  }
  const idle = button.innerHTML;
  button.disabled = true;
  button.textContent = 'Running…';
  status(statusEl, label || 'Asking the engine…');
  try {
    const res = await api(`/api/forge/${tool}/run`, { method: 'POST', body, timeout: 30000 });
    status(statusEl, `Done in ${res.processing_ms} ms.`);
    return res.result;
  } catch (err) {
    status(statusEl, err.message, true);
    return null;
  } finally {
    button.disabled = false;
    button.innerHTML = idle;
  }
}
const pill = (state) => `<span class="fx-pill is-${state}">${{ pass: 'Pass', warn: 'Needs work', fail: 'Fail' }[state] || esc(state)}</span>`;

/* ======================================================================
   Email deliverability
   ====================================================================== */
function renderEmail(r) {
  const ring = (score) => {
    const C = 2 * Math.PI * 42;
    const tone = score >= 75 ? 'pass' : score >= 45 ? 'warn' : 'fail';
    return `<div class="fx-score is-${tone}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" class="fx-score__bg"/><circle cx="50" cy="50" r="42" class="fx-score__fg" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - score / 100)}"/></svg><b>${score}</b><span>Grade ${esc(r.grade)}</span></div>`;
  };
  const checks = r.checks
    .map((c) => {
      const records = (c.records || []).map((rec) => `<code>${esc(rec)}</code>`).join('');
      const keys = c.keys && c.keys.length ? `<p class="fx-sub">Selectors: ${c.keys.map((k) => `${esc(k.selector)}${k.revoked ? ' (revoked)' : k.bits ? ` · ${k.bits}-bit` : ''}`).join(', ')}</p>` : '';
      const mx = c.mx && c.mx.length ? `<p class="fx-sub">${c.mx.map((m) => `${m.priority} ${esc(m.host)}`).join(' · ')}</p>` : '';
      const fixes = c.fixes && c.fixes.length ? `<ul class="fx-fixes">${c.fixes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '';
      const notes = c.notes && c.notes.length > 1 ? `<ul class="fx-notes-list">${c.notes.slice(1).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
      return `<article class="fx-check-card is-${c.status}"><header><h3>${esc(c.label)}</h3>${pill(c.status)}</header><p>${esc(c.summary)}</p>${notes}${records ? `<div class="fx-records">${records}</div>` : ''}${keys}${mx}${fixes}</article>`;
    })
    .join('');
  const extras = r.extras && r.extras.length ? `<ul class="fx-extras">${r.extras.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  return `<div class="fx-report"><div class="fx-report__head">${ring(r.score)}<div><p class="overline">Email deliverability · ${esc(r.domain)}</p><h2 class="fx-h">${r.score >= 90 ? 'Your mail is well authenticated.' : r.score >= 55 ? 'Mail gets through, with gaps to close.' : 'Your mail is at risk of spam folders and spoofing.'}</h2><p class="fx-sub">${r.selectors_checked} DKIM selectors checked. Scores: SPF 30, DKIM 30, DMARC 30, MX 10.</p></div></div><div class="fx-check-grid">${checks}</div>${extras}</div>`;
}

function initEmail(root) {
  const form = $(root, '[data-email-form]');
  const out = $(root, '[data-output]');
  const st = $(root, '[data-status]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const domain = $(root, '#email-domain').value.trim();
    if (!domain) return status(st, 'Enter a domain first.', true);
    out.innerHTML = '';
    const r = await runEngine({ tool: 'email-deliverability', body: { url: domain, selector: $(root, '#email-selector').value.trim() }, button: $(root, '[data-action="run"]'), statusEl: st, label: 'Looking up DNS records…' });
    if (r) out.innerHTML = renderEmail(r);
  });
  const preset = new URLSearchParams(location.search).get('domain');
  if (preset) {
    $(root, '#email-domain').value = preset;
    form.requestSubmit();
  }
}

/* ======================================================================
   Structured data: generator + checker
   ====================================================================== */
const F = (name, label, opts = {}) => ({ name, label, ...opts });
export const SCHEMA_FORMS = {
  FAQPage: { faq: true, fields: [] },
  LocalBusiness: {
    fields: [
      F('subtype', 'Business type', { select: ['LocalBusiness', 'ProfessionalService', 'LegalService', 'AccountingService', 'MedicalClinic', 'Dentist', 'HomeAndConstructionBusiness', 'AutoRepair', 'RealEstateAgent', 'Restaurant', 'Store'] }),
      F('name', 'Business name', { required: true }), F('url', 'Website', { type: 'url' }), F('telephone', 'Phone'), F('email', 'Email', { type: 'email' }),
      F('streetAddress', 'Street address'), F('addressLocality', 'City'), F('addressRegion', 'Region / state'), F('postalCode', 'Postal code'), F('addressCountry', 'Country code', { placeholder: 'PH, US…' }),
      F('openingHours', 'Opening hours', { placeholder: 'Mo-Fr 09:00-18:00' }), F('priceRange', 'Price range', { placeholder: '$$' }), F('image', 'Logo or photo URL', { type: 'url' }), F('sameAs', 'Profiles (comma separated)', { placeholder: 'https://facebook.com/…, https://linkedin.com/…' })
    ]
  },
  Organization: { fields: [F('name', 'Organisation name', { required: true }), F('url', 'Website', { type: 'url' }), F('logo', 'Logo URL', { type: 'url' }), F('email', 'Email', { type: 'email' }), F('telephone', 'Phone'), F('description', 'One-line description'), F('sameAs', 'Profiles (comma separated)')] },
  Service: { fields: [F('name', 'Service name', { required: true }), F('serviceType', 'Service type', { placeholder: 'Website development' }), F('description', 'Description'), F('provider', 'Provided by (business name)'), F('areaServed', 'Area served', { placeholder: 'Philippines, Worldwide…' }), F('url', 'Page URL', { type: 'url' })] },
  Article: { fields: [F('headline', 'Headline', { required: true }), F('description', 'Summary'), F('author', 'Author name'), F('datePublished', 'Published', { type: 'date' }), F('dateModified', 'Updated', { type: 'date' }), F('image', 'Image URL', { type: 'url' }), F('publisher', 'Publisher name'), F('publisherLogo', 'Publisher logo URL', { type: 'url' }), F('url', 'Article URL', { type: 'url' })] },
  Product: { fields: [F('name', 'Product name', { required: true }), F('description', 'Description'), F('image', 'Image URL', { type: 'url' }), F('brand', 'Brand'), F('sku', 'SKU'), F('price', 'Price', { placeholder: '1999.00' }), F('priceCurrency', 'Currency', { placeholder: 'PHP, USD…' }), F('availability', 'Availability', { select: ['InStock', 'OutOfStock', 'PreOrder', 'BackOrder'] }), F('url', 'Product URL', { type: 'url' })] }
};

/** Pure: form values → JSON-LD object, leaving out anything empty. */
export function buildSchema(type, v, faq = []) {
  const clean = (o) => {
    for (const k of Object.keys(o)) {
      const x = o[k];
      if (x === '' || x == null || (Array.isArray(x) && !x.length)) delete o[k];
      else if (typeof x === 'object' && !Array.isArray(x)) {
        clean(x);
        if (Object.keys(x).filter((key) => key !== '@type').length === 0) delete o[k];
      }
    }
    return o;
  };
  const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  const base = { '@context': 'https://schema.org' };
  if (type === 'FAQPage') {
    return { ...base, '@type': 'FAQPage', mainEntity: faq.filter((q) => q.q && q.a).map((q) => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a } })) };
  }
  if (type === 'LocalBusiness') {
    return clean({ ...base, '@type': v.subtype || 'LocalBusiness', name: v.name, url: v.url, telephone: v.telephone, email: v.email, image: v.image, priceRange: v.priceRange, openingHours: v.openingHours, address: { '@type': 'PostalAddress', streetAddress: v.streetAddress, addressLocality: v.addressLocality, addressRegion: v.addressRegion, postalCode: v.postalCode, addressCountry: v.addressCountry }, sameAs: list(v.sameAs) });
  }
  if (type === 'Organization') return clean({ ...base, '@type': 'Organization', name: v.name, url: v.url, logo: v.logo, email: v.email, telephone: v.telephone, description: v.description, sameAs: list(v.sameAs) });
  if (type === 'Service') return clean({ ...base, '@type': 'Service', name: v.name, serviceType: v.serviceType, description: v.description, url: v.url, areaServed: v.areaServed, provider: { '@type': 'Organization', name: v.provider } });
  if (type === 'Article') return clean({ ...base, '@type': 'Article', headline: v.headline, description: v.description, image: v.image, datePublished: v.datePublished, dateModified: v.dateModified, mainEntityOfPage: v.url, author: { '@type': 'Person', name: v.author }, publisher: { '@type': 'Organization', name: v.publisher, logo: { '@type': 'ImageObject', url: v.publisherLogo } } });
  if (type === 'Product') return clean({ ...base, '@type': 'Product', name: v.name, description: v.description, image: v.image, sku: v.sku, brand: { '@type': 'Brand', name: v.brand }, offers: { '@type': 'Offer', price: v.price, priceCurrency: v.priceCurrency, availability: v.availability ? `https://schema.org/${v.availability}` : '', url: v.url } });
  return base;
}

function initSchema(root) {
  const typeSel = $(root, '[data-schema-type]');
  const fieldsEl = $(root, '[data-schema-fields]');
  const outEl = $(root, '[data-schema-out]');
  const st = $(root, '[data-status]');
  const values = {};
  let faq = [{ q: '', a: '' }, { q: '', a: '' }, { q: '', a: '' }];

  const render = () => {
    const type = typeSel.value;
    const json = buildSchema(type, values, faq);
    outEl.value = `<script type="application/ld+json">\n${JSON.stringify(json, null, 2)}\n</script>`;
  };
  const drawFields = () => {
    const form = SCHEMA_FORMS[typeSel.value];
    if (form.faq) {
      fieldsEl.innerHTML = faq.map((q, i) => `<div class="fx-faq-row"><div class="forge-field"><label for="faq-q-${i}">Question ${i + 1}</label><input id="faq-q-${i}" data-faq="${i}" data-part="q" type="text" value="${esc(q.q)}"></div><div class="forge-field"><label for="faq-a-${i}">Answer</label><textarea id="faq-a-${i}" data-faq="${i}" data-part="a" rows="2">${esc(q.a)}</textarea></div></div>`).join('') + '<button type="button" class="text-link" data-add-faq>Add a question +</button>';
    } else {
      fieldsEl.innerHTML = `<div class="forge-grid fx-grid">${form.fields
        .map((f) => {
          const id = `sg-${f.name}`;
          const val = esc(values[f.name] || '');
          const input = f.select
            ? `<select id="${id}" data-field="${f.name}">${f.select.map((o) => `<option${values[f.name] === o ? ' selected' : ''}>${o}</option>`).join('')}</select>`
            : `<input id="${id}" data-field="${f.name}" type="${f.type || 'text'}" value="${val}" placeholder="${esc(f.placeholder || '')}"${f.required ? ' required' : ''}>`;
          return `<div class="forge-field"><label for="${id}">${esc(f.label)}${f.required ? '' : ' <span class="fine-print">(optional)</span>'}</label>${input}</div>`;
        })
        .join('')}</div>`;
      form.fields.filter((f) => f.select && !values[f.name]).forEach((f) => (values[f.name] = f.select[0]));
    }
    render();
  };
  fieldsEl.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.field) values[t.dataset.field] = t.value.trim();
    if (t.dataset.faq) faq[Number(t.dataset.faq)][t.dataset.part] = t.value.trim();
    render();
  });
  fieldsEl.addEventListener('change', (e) => e.target.dataset.field && ((values[e.target.dataset.field] = e.target.value), render()));
  fieldsEl.addEventListener('click', (e) => {
    if (!e.target.closest('[data-add-faq]')) return;
    faq = [...faq, { q: '', a: '' }];
    drawFields();
    fieldsEl.querySelector(`#faq-q-${faq.length - 1}`)?.focus();
  });
  typeSel.addEventListener('change', drawFields);
  $(root, '[data-action="copy"]').addEventListener('click', () => copy(outEl, outEl.value, st));
  drawFields();

  /* tabs */
  const tabs = [...root.querySelectorAll('[data-fx-tab]')];
  const show = (name) => {
    tabs.forEach((t) => {
      const on = t.dataset.fxTab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    root.querySelectorAll('[data-fx-panel]').forEach((p) => (p.hidden = p.dataset.fxPanel !== name));
  };
  tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.fxTab)));

  /* checker */
  const form = $(root, '[data-server-form]');
  const out = $(root, '[data-output]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = $(root, '#tool-url').value.trim();
    const cst = $(root, '[data-check-status]');
    if (!url) return status(cst, 'Enter a page URL first.', true);
    out.innerHTML = '';
    const r = await runEngine({ tool: 'structured-data', body: { url }, button: $(root, '[data-action="run"]'), statusEl: cst, label: 'Reading the page…' });
    if (!r) return;
    const items = r.items.length
      ? `<div class="fx-check-grid">${r.items
          .map((i) => {
            const state = i.missing.length ? 'fail' : i.recommended.length ? 'warn' : 'pass';
            return `<article class="fx-check-card is-${state}"><header><h3>${esc(i.type)}</h3>${pill(state)}</header>${i.name ? `<p>${esc(i.name)}</p>` : ''}${i.missing.length ? `<p class="fx-sub">Missing required: ${esc(i.missing.join(', '))}</p>` : ''}${i.recommended.length ? `<p class="fx-sub">Worth adding: ${esc(i.recommended.join(', '))}</p>` : ''}${!i.checkedAs ? '<p class="fx-sub">Not a type this checker has rules for; it is listed but not validated.</p>' : ''}</article>`;
          })
          .join('')}</div>`
      : '';
    const list = (title, arr) => (arr.length ? `<p class="overline" style="margin-top:22px">${title}</p><ul class="fx-fixes">${arr.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '');
    out.innerHTML = `<div class="fx-report"><p class="overline">${esc(r.url)} · ${r.blocks.length} JSON-LD block${r.blocks.length === 1 ? '' : 's'}${r.microdata ? ` · ${r.microdata} microdata item(s)` : ''}</p><h2 class="fx-h">${r.types.length ? `Declares ${esc(r.types.join(', '))}.` : 'No structured data declared.'}</h2>${items}${list('Problems', r.problems)}${list('Add next', r.suggestions)}<p class="fx-sub" style="margin-top:16px">Use the generator tab to build the missing blocks.</p></div>`;
  });
  const preset = new URLSearchParams(location.search).get('url');
  if (preset) {
    show('check');
    $(root, '#tool-url').value = preset;
    form.requestSubmit();
  }
}

/* ======================================================================
   AI crawler policy
   ====================================================================== */
export const AI_BOTS = [
  { agent: 'GPTBot', owner: 'OpenAI', kind: 'training', what: 'Collects pages that may be used to train OpenAI models.' },
  { agent: 'OAI-SearchBot', owner: 'OpenAI', kind: 'search', what: 'Indexes pages for ChatGPT search results and citations.' },
  { agent: 'ChatGPT-User', owner: 'OpenAI', kind: 'user', what: 'Fetches a page when a ChatGPT user asks about it.' },
  { agent: 'ClaudeBot', owner: 'Anthropic', kind: 'training', what: 'Collects pages that may be used to train Claude models.' },
  { agent: 'Claude-SearchBot', owner: 'Anthropic', kind: 'search', what: 'Indexes pages to improve Claude’s search answers.' },
  { agent: 'Claude-User', owner: 'Anthropic', kind: 'user', what: 'Fetches a page when a Claude user asks about it.' },
  { agent: 'PerplexityBot', owner: 'Perplexity', kind: 'search', what: 'Indexes pages for Perplexity answers and citations.' },
  { agent: 'Perplexity-User', owner: 'Perplexity', kind: 'user', what: 'Fetches a page when a Perplexity user asks about it.' },
  { agent: 'Google-Extended', owner: 'Google', kind: 'training', what: 'Controls use of your pages for Gemini models. Does not affect Google Search.' },
  { agent: 'Applebot-Extended', owner: 'Apple', kind: 'training', what: 'Controls use of your pages to train Apple’s AI models.' },
  { agent: 'Amazonbot', owner: 'Amazon', kind: 'search', what: 'Crawls pages for Alexa answers and Amazon services.' },
  { agent: 'Meta-ExternalAgent', owner: 'Meta', kind: 'training', what: 'Collects pages that may be used to train Meta AI models.' },
  { agent: 'CCBot', owner: 'Common Crawl', kind: 'training', what: 'Builds the open Common Crawl dataset that many models train on.' },
  { agent: 'Bytespider', owner: 'ByteDance', kind: 'training', what: 'Collects pages for ByteDance’s AI models.' }
];
const KIND_LABEL = { search: 'AI search & answers', user: 'Fetches for a user', training: 'Model training' };

/** Pure: allowed map → robots.txt lines. */
export function buildRobots(allowed) {
  const blocked = AI_BOTS.filter((b) => !allowed[b.agent]);
  const lines = ['# AI crawlers — generated with lracdimension.online/forge/ai-crawler-policy/', `# Allowed: ${AI_BOTS.filter((b) => allowed[b.agent]).map((b) => b.agent).join(', ') || 'none'}`, ''];
  if (!blocked.length) {
    lines.push('# Every AI crawler listed is allowed. Nothing to add beyond your existing rules;', '# a User-agent: * group that allows crawling already covers them.');
    return lines.join('\n');
  }
  blocked.forEach((b) => lines.push(`User-agent: ${b.agent}`));
  lines.push('Disallow: /');
  return lines.join('\n');
}

/** Pure: robots-validator result + agent → 'blocked' | 'allowed' | 'default'. */
export function robotsVerdict(result, agent) {
  if (!result || !result.found) return 'none';
  const groups = result.groups || [];
  const own = groups.find((g) => g.agents.some((a) => a.toLowerCase() === agent.toLowerCase()));
  const blocks = (g) => g && g.rules.some((r) => r.type === 'disallow' && r.value === '/') && !g.rules.some((r) => r.type === 'allow' && r.value === '/');
  if (own) return blocks(own) ? 'blocked' : 'allowed';
  const star = groups.find((g) => g.agents.includes('*'));
  return blocks(star) ? 'blocked-default' : 'default';
}

function initAiCrawlers(root) {
  const botsEl = $(root, '[data-bots]');
  const out = $(root, '[data-robots-out]');
  const st = $(root, '[data-status]');
  const allowed = Object.fromEntries(AI_BOTS.map((b) => [b.agent, true]));
  let verdicts = {};
  const VERDICT = { blocked: 'Blocked now', allowed: 'Allowed now', default: 'Allowed (no rule)', 'blocked-default': 'Blocked by *', none: 'No robots.txt' };

  const draw = () => {
    botsEl.innerHTML = ['search', 'user', 'training']
      .map((kind) => `<div class="fx-bot-group"><p class="overline">${KIND_LABEL[kind]}</p>${AI_BOTS.filter((b) => b.kind === kind)
        .map((b) => `<label class="fx-bot"><input type="checkbox" data-bot="${b.agent}"${allowed[b.agent] ? ' checked' : ''}><span class="fx-switch" aria-hidden="true"></span><span class="fx-bot__txt"><b>${b.agent}</b> <span class="fine-print">${b.owner}</span><small>${b.what}</small></span>${verdicts[b.agent] ? `<span class="fx-verdict is-${verdicts[b.agent]}">${VERDICT[verdicts[b.agent]]}</span>` : ''}</label>`)
        .join('')}</div>`)
      .join('');
    out.value = buildRobots(allowed);
  };
  botsEl.addEventListener('change', (e) => {
    if (!e.target.dataset.bot) return;
    allowed[e.target.dataset.bot] = e.target.checked;
    out.value = buildRobots(allowed);
  });
  root.querySelectorAll('[data-preset]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const p = btn.dataset.preset;
      AI_BOTS.forEach((b) => (allowed[b.agent] = p === 'all' ? true : p === 'none' ? false : b.kind !== 'training'));
      draw();
      status(st, `Preset applied: ${btn.textContent}.`);
    })
  );
  $(root, '[data-action="copy"]').addEventListener('click', () => copy(out, out.value, st));
  draw();

  const form = $(root, '[data-server-form]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = $(root, '#tool-url').value.trim();
    const cst = $(root, '[data-check-status]');
    if (!url) return status(cst, 'Enter your website first.', true);
    const r = await runEngine({ tool: 'robots-validator', body: { url }, button: $(root, '[data-action="run"]'), statusEl: cst, label: 'Reading robots.txt…' });
    if (!r) return;
    verdicts = Object.fromEntries(AI_BOTS.map((b) => [b.agent, robotsVerdict(r, b.agent)]));
    const blocked = AI_BOTS.filter((b) => /blocked/.test(verdicts[b.agent])).length;
    draw();
    status(cst, r.found ? `${r.url}: ${blocked} of ${AI_BOTS.length} AI crawlers are blocked today. Each crawler shows its current status.` : `${r.url} has no robots.txt, so every AI crawler is allowed.`);
  });
  const preset = new URLSearchParams(location.search).get('url');
  if (preset) {
    $(root, '#tool-url').value = preset;
    form.requestSubmit();
  }
}

/* ======================================================================
   llms.txt
   ====================================================================== */
/** Pure: engine result + name/description → llms.txt text. */
export function buildLlms(r, name, desc) {
  const order = (s) => (s === 'Main' ? 0 : s === 'Pages' ? 1 : 2);
  const sections = {};
  r.pages.forEach((p) => (sections[p.section] ||= []).push(p));
  const heading = (s) => (s === 'Main' || s === 'Pages' ? s : s.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase()));
  const body = Object.keys(sections)
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
    .map((s) => `## ${heading(s)}\n\n${sections[s].map((p) => `- [${p.title}](${p.url})`).join('\n')}`)
    .join('\n\n');
  return `# ${name || r.site_name}\n\n> ${desc || r.description || 'One sentence on what this site is and who it is for.'}\n\n${body}\n`;
}

function initLlms(root) {
  const form = $(root, '[data-server-form]');
  const wrap = $(root, '[data-llms]');
  const nameEl = $(root, '[data-llms-name]');
  const descEl = $(root, '[data-llms-desc]');
  const out = $(root, '[data-llms-out]');
  const st = $(root, '[data-status]');
  const notes = $(root, '[data-llms-notes]');
  let last = null;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = $(root, '#tool-url').value.trim();
    const cst = $(root, '[data-check-status]');
    if (!url) return status(cst, 'Enter a website first.', true);
    const r = await runEngine({ tool: 'llms-txt', body: { url }, button: $(root, '[data-action="run"]'), statusEl: cst, label: 'Reading the home page and sitemap…' });
    if (!r) return;
    last = r;
    nameEl.value = r.site_name;
    descEl.value = r.description;
    out.value = buildLlms(r, r.site_name, r.description);
    wrap.hidden = false;
    status(cst, `${r.pages.length} page${r.pages.length === 1 ? '' : 's'} listed from ${r.found} in the sitemap.`);
    notes.innerHTML = r.problems.length ? `<ul class="fx-fixes">${r.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '';
  });
  $(root, '[data-action="rebuild"]').addEventListener('click', () => last && (out.value = buildLlms(last, nameEl.value.trim(), descEl.value.trim())));
  $(root, '[data-action="copy"]').addEventListener('click', () => copy(out, out.value, st));
  $(root, '[data-action="download"]').addEventListener('click', () => {
    const blob = new Blob([out.value], { type: 'text/plain;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'llms.txt' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    status(st, 'Downloaded llms.txt. Upload it to the root of the site.');
  });
  const preset = new URLSearchParams(location.search).get('url');
  if (preset) {
    $(root, '#tool-url').value = preset;
    form.requestSubmit();
  }
}

export const PLUS_TOOLS = {
  'email-deliverability': initEmail,
  'schema-generator': initSchema,
  'ai-crawler-policy': initAiCrawlers,
  'llms-txt-generator': initLlms
};
