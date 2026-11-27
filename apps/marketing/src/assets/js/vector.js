/**
 * VECTOR — Web Clinic.
 *
 * API mode (apiBase set): POST an audit, poll its stages, then show the
 * summary anyone may see: the health score, category scores and the top
 * issues. The full report (every issue with evidence and fix, the ordered
 * prescription, raw measurements, PDF and CSV) is emailed: the visitor fills
 * in the report form, the API's report-delivery Workflow sends it, and the
 * email links to /vector/report/#t=<token>, which renders it here.
 * Summaries are addressable at /vector/audit/<id>/ and a website's completed
 * audits form its history.
 *
 * Browser mode (no API): the original in-browser structural read, labelled
 * as such. Nothing is presented as more than it is.
 */
import { api, apiBlob, esc, hasApi } from './api.js';
import { CFG } from './config.js';
import { runAnalysis, normalizeUrl } from './analyzer/service.js';
import { postLead } from './leads.js';

const grade = (s) => (s >= 80 ? 'good' : s >= 50 ? 'warn' : 'bad');
const SEV = ['critical', 'high', 'medium', 'low'];
/* Findings that a Forge tool fixes: link straight to it with the examined site filled in. */
const FIX_TOOLS = {
  ai_no_structured_data: ['/forge/schema-generator/', 'Generate the structured data'],
  ai_invalid_structured_data: ['/forge/schema-generator/', 'Check and rebuild the structured data'],
  ai_no_llms_txt: ['/forge/llms-txt-generator/', 'Generate an llms.txt'],
  ai_answer_crawlers_blocked: ['/forge/ai-crawler-policy/', 'Build an AI crawler policy'],
  no_robots_txt: ['/forge/ai-crawler-policy/', 'Build a robots.txt policy'],
  robots_blocks_all: ['/forge/robots-validator/', 'Inspect the robots.txt']
};
function fixLink(issue, url) {
  const fix = FIX_TOOLS[issue.code];
  if (!fix) return '';
  return `<p class="vector-issue__fix"><a class="text-link" href="${fix[0]}?url=${encodeURIComponent(url || '')}">${fix[1]} ↗</a></p>`;
}

const CATEGORY_LABEL = { ai: 'AI visibility', technical: 'Technical', seo: 'SEO', performance: 'Performance', accessibility: 'Accessibility', security: 'Security', links: 'Links', content: 'Content', uiux: 'Structure', contentWeight: 'Content' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dateShort = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function plausible(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return false;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/* sessionStorage, quietly: private modes and full quotas must not break the page. */
const store = {
  get(k) {
    try {
      return JSON.parse(sessionStorage.getItem(k) || 'null');
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      sessionStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
  del(k) {
    try {
      sessionStorage.removeItem(k);
    } catch {}
  }
};
/* Written by the diagnostic popup (modal.js) so the report form starts filled in. */
export const PREFILL_KEY = 'lracdim:report-prefill';
const requestKey = (auditId) => `lracdim:report-request:${auditId}`;

/* ------------------------------------------------------------ shared parts */

function renderHistory(items, currentId) {
  if (!items || items.length < 2) return `<div class="vector-history"><p class="overline">History</p><p class="fine-print">${items && items.length === 1 ? 'First examination of this website. Run it again after changes to see progression.' : 'No stored history for this website.'}</p></div>`;
  const max = 100;
  return `<div class="vector-history"><p class="overline">History · ${items.length} examinations</p><ol class="vector-history__list">${items.map((it) => `<li${it.id === currentId ? ' aria-current="true"' : ''}><a href="/vector/audit/${esc(it.id)}/"><span class="project-type">${esc(dateShort(it.completed_at))}</span><span class="vector-history__bar"><span style="width:${(it.health_score / max) * 100}%"></span></span><b>${it.health_score}</b></a></li>`).join('')}</ol></div>`;
}

function vitalsOf(results) {
  const perf = results.find((r) => r.category === 'performance');
  return (perf && perf.metrics && perf.metrics.vitals) || null;
}

function renderVitals(results) {
  const v = vitalsOf(results);
  if (!v) return '';
  const rows = [
    ['Largest Contentful Paint', v.lcp_ms != null ? `${(v.lcp_ms / 1000).toFixed(1)} s` : '—', v.ratings.lcp_ms, 'good ≤ 2.5 s'],
    ['Interaction to Next Paint', v.inp_ms != null ? `${v.inp_ms} ms` : 'no field data', v.ratings.inp_ms, 'good ≤ 200 ms'],
    ['Cumulative Layout Shift', v.cls != null ? String(v.cls) : '—', v.ratings.cls, 'good ≤ 0.1'],
    ['Total Blocking Time (lab)', v.tbt_ms != null ? `${v.tbt_ms} ms` : '—', v.ratings.tbt_ms, 'good ≤ 200 ms']
  ];
  const source = { field: 'Real-user data for this page', 'origin field': 'Real-user data for the whole site', lab: 'Lab run: too little traffic for real-user data' }[v.source] || v.source;
  return `<div class="vector-vitals"><p class="overline">Core Web Vitals · ${esc(v.strategy)}</p><p class="fine-print">${esc(source)}, from Google PageSpeed Insights${v.lighthouse_score != null ? ` · Lighthouse performance ${v.lighthouse_score}` : ''}.</p><table class="vector-table"><tbody>${rows.map(([name, value, rating, target]) => `<tr data-rating="${esc(rating || 'none')}"><th scope="row">${esc(name)}</th><td>${esc(value)}</td><td><span class="vital-rating">${esc(rating || '—')}</span> <span class="fine-print">${esc(target)}</span></td></tr>`).join('')}</tbody></table></div>`;
}

function downloadCsv(res) {
  const { audit, results, issues } = res;
  // Leading = + - @ would be read as formulas by spreadsheet apps; prefix them.
  const cell = (v) => {
    let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const line = (arr) => arr.map(cell).join(',');
  const host = new URL(audit.summary.final_url || audit.url).hostname;
  const date = (audit.completed_at || '').slice(0, 10);
  const out = [
    line(['Website', audit.summary.final_url || audit.url]),
    line(['Examined', audit.completed_at]),
    line(['Health score', audit.health_score]),
    line(['Summary', `${location.origin}/vector/audit/${audit.id}/`]),
    '',
    line(['Category', 'Score']),
    ...results.map((r) => line([CATEGORY_LABEL[r.category] || r.category, r.score])),
    '',
    line(['Rank', 'Severity', 'Category', 'Issue', 'Evidence', 'Why it matters', 'Prescription', 'Expected impact']),
    ...issues.map((i, n) => line([n + 1, i.severity, CATEGORY_LABEL[i.category] || i.category, i.title, i.evidence, i.explanation, i.recommendation, i.impact]))
  ];
  const blob = new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vector-${host}-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

function renderMetrics(results) {
  const rows = results.map((r) => `<tr><th scope="row">${esc(CATEGORY_LABEL[r.category] || r.category)}</th><td><dl class="vector-metrics-dl">${Object.entries(r.metrics || {}).filter(([k]) => k !== 'note').map(([k, v]) => `<dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${esc(Array.isArray(v) ? v.join(', ') || '—' : typeof v === 'object' && v ? JSON.stringify(v) : String(v))}</dd>`).join('')}${r.metrics && r.metrics.note ? `<dt>note</dt><dd>${esc(r.metrics.note)}</dd>` : ''}</dl></td></tr>`).join('');
  return `<div><button type="button" class="text-link" data-toggle-metrics aria-expanded="false">Raw measurements ↗</button><table class="vector-table vector-table--metrics" data-metrics hidden><tbody>${rows}</tbody></table></div>`;
}

const reportHead = (audit, label, actions) => `
  <div class="vector-report__head">
    <div><p class="overline">${esc(label)}</p><h2 class="vector-report__url">${esc(audit.summary.final_url || audit.url)}</h2><p class="fine-print">${esc(new Date(audit.completed_at).toLocaleString())} · HTTP ${esc(audit.summary.status)} · ${esc(audit.summary.response_ms)} ms to first document</p></div>
    <div class="actions" style="margin:0">${actions}</div>
  </div>`;

const healthBlock = (audit, methodology) => `<div class="vector-health" data-grade="${grade(audit.health_score)}"><p class="overline">Website health</p><p class="vector-health__score"><b>${audit.health_score}</b> / 100</p><p class="fine-print">Weighted mean of the category scores. <button type="button" class="text-link text-link--inline" data-toggle-method aria-expanded="false">How scores are calculated ↗</button></p><pre class="vector-console" data-method hidden>${esc(methodology)}</pre></div>`;

const categoryTable = (results) => `<table class="vector-table"><caption class="overline">Categories</caption><tbody>${results.map((r) => `<tr data-grade="${grade(r.score)}"><th scope="row">${esc(CATEGORY_LABEL[r.category] || cap(r.category))}</th><td>${r.score}</td><td><div class="scorecard__meter"><div class="scorecard__fill" style="width:${r.score}%"></div></div></td></tr>`).join('')}</tbody></table>`;

const countsBlock = (counts) => `<div class="vector-counts"><p class="overline">Issues</p>${SEV.map((s) => `<span data-sev="${s}"><b>${String(counts[s] || 0).padStart(2, '0')}</b> ${cap(s)}</span>`).join('')}</div>`;

function bindCommon(el, onReset) {
  el.querySelectorAll('[data-vector-reset]').forEach((b) => b.addEventListener('click', onReset));
  const toggle = el.querySelector('[data-toggle-method]');
  const method = el.querySelector('[data-method]');
  if (toggle && method) {
    toggle.addEventListener('click', () => {
      method.hidden = !method.hidden;
      toggle.setAttribute('aria-expanded', String(!method.hidden));
    });
  }
}

/**
 * The whole report: from the emailed link, or with the admin key. `pdf`, when
 * given, fetches the server-made PDF (the one attached to the email); without
 * it, or when it fails, the button opens the browser's print dialog instead.
 */
export function renderFullReport(el, res, history_, { onReset, pdf }) {
  const { audit, results, issues, prescription, methodology } = res;
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  issues.forEach((i) => (counts[i.severity] = (counts[i.severity] || 0) + 1));
  const summaryUrl = `${location.origin}/vector/audit/${audit.id}/`;
  el.innerHTML = `
    ${reportHead(audit, 'Full report · engine', `<button type="button" class="text-link" data-vector-reset>New examination ↗</button><a class="text-link" href="/vector/audit/${esc(audit.id)}/">Public summary ↗</a><button type="button" class="text-link" data-vector-print>${pdf ? 'Download PDF' : 'Save as PDF'} ↗</button><button type="button" class="text-link" data-vector-csv>Download CSV ↗</button>`)}
    ${healthBlock(audit, methodology)}
    ${categoryTable(results)}
    ${renderVitals(results)}
    ${countsBlock(counts)}
    <div class="vector-issues">${issues.length ? issues.map((i) => `
      <article class="vector-issue" data-sev="${esc(cap(i.severity))}">
        <p class="vector-issue__sev"><span class="sev" data-sev="${esc(cap(i.severity))}">${esc(cap(i.severity))}</span> <span class="fine-print">${esc(CATEGORY_LABEL[i.category] || i.category)}</span></p>
        <h3>${esc(i.title)}</h3>
        <dl><dt>Evidence</dt><dd>${esc(i.evidence)}</dd><dt>Why it matters</dt><dd>${esc(i.explanation)}</dd><dt>Prescription</dt><dd>${esc(i.recommendation)}</dd><dt>Expected impact</dt><dd>${esc(i.impact)}</dd></dl>${fixLink(i, audit.url)}
      </article>`).join('') : '<p class="body body--sm">No issue crossed the reporting threshold in any category.</p>'}</div>
    <div class="vector-rx-wrap"><p class="overline">Prescription</p>${prescription.length ? `<ol class="vector-rx">${prescription.map((p) => `<li><span class="project-type">${String(p.position).padStart(2, '0')} — ${esc(cap(p.severity))}</span><strong>${esc(p.action)}</strong><span>${esc(p.title || (issues.find((i) => i.code === p.issue_code) || {}).title || p.issue_code)}</span></li>`).join('')}</ol>` : '<p class="body body--sm">Nothing to prescribe from this examination.</p>'}</div>
    ${renderHistory(history_, audit.id)}
    ${renderMetrics(results)}
    <p class="fine-print vector-mode">Measured from the live document, its response headers, robots.txt, sitemap, llms.txt, and a sample of its links. ${vitalsOf(results) ? 'Core Web Vitals come from Google PageSpeed Insights.' : 'Core Web Vitals were not measured on this run, so performance figures are document-level indicators only.'} AI visibility reports whether AI crawlers can read the site, not whether any AI answer mentions it. Security is a header review, not a vulnerability scan.</p>
    <div class="vector-handoff"><p class="overline">Next step</p><h3>Want this fixed?</h3><p>Start a project and this report comes with you: the intake attaches the score, the URL, and the report link so we begin from the findings, not from a blank brief.</p><div class="actions"><a class="btn" href="/#start" data-open-start>Start a project ↗</a><a class="text-link" href="/vector/#coverage">What this measures ↗</a></div></div>
    <footer class="vector-print-footer" aria-hidden="true">Website examination by John Carl Dimatulac · LRACDIMENSION · www.lracdimension.online${CFG.email ? ` · ${esc(CFG.email)}` : ''} · Summary: ${esc(summaryUrl)}</footer>`;
  bindCommon(el, onReset);
  const printBtn = el.querySelector('[data-vector-print]');
  const printDialog = () => {
    document.body.classList.add('vector-printing');
    window.print();
  };
  if (printBtn) printBtn.addEventListener('click', async () => {
    if (!pdf) return printDialog();
    const label = printBtn.textContent;
    printBtn.disabled = true;
    printBtn.textContent = 'Preparing PDF…';
    try {
      const { blob, filename } = await pdf();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      // Daily PDF budget used, a busy browser, or offline: the print dialog makes one locally.
      printDialog();
    } finally {
      printBtn.disabled = false;
      printBtn.textContent = label;
    }
  });
  const csvBtn = el.querySelector('[data-vector-csv]');
  if (csvBtn) csvBtn.addEventListener('click', () => downloadCsv(res));
  window.addEventListener('afterprint', () => document.body.classList.remove('vector-printing'), { once: true });
  el.querySelectorAll('[data-toggle-metrics]').forEach((b) => b.addEventListener('click', () => {
    const t = el.querySelector('[data-metrics]');
    t.hidden = !t.hidden;
    b.setAttribute('aria-expanded', String(!t.hidden));
  }));
}

/* ------------------------------------------------------------ the summary */

const field = (name, label, input, hint = '') => `
  <div class="vector-gate__field" data-field="${name}">
    <label class="field__label" for="gate-${name}">${label}</label>
    ${input}
    ${hint ? `<p class="fine-print">${hint}</p>` : ''}
    <p class="vector-gate__err" data-err-for="${name}" role="alert"></p>
  </div>`;

function gateHtml(locked) {
  const more = locked.issues ? `<li><b>${locked.issues}</b> more issue${locked.issues === 1 ? '' : 's'}, each with the evidence found on the page</li>` : '';
  const fixes = locked.fixes ? `<li><b>${locked.fixes}</b> fix${locked.fixes === 1 ? '' : 'es'} in priority order, so the first ones move the score most</li>` : '<li>A fix list in priority order</li>';
  return `
  <section class="vector-gate" data-vector-gate aria-labelledby="gate-title">
    <div class="vector-gate__pitch">
      <p class="overline">Full report</p>
      <h3 id="gate-title">Get the full report by email.</h3>
      <ul class="vector-gate__list">
        ${more}${fixes}
        <li>A plain-English summary of what to fix first</li>
        <li>The whole report as a PDF, plus the raw measurements and a CSV online</li>
      </ul>
      <p class="fine-print">Free. One email with the report, a PDF copy and a private link to it. No newsletter. One report per address and per website each week.</p>
    </div>
    <form class="vector-gate__form" data-vector-gate-form novalidate>
      ${field('name', 'Your name', '<input class="field__input" id="gate-name" name="name" type="text" autocomplete="name" maxlength="120" required>')}
      ${field('email', 'Email for the report', '<input class="field__input" id="gate-email" name="email" type="email" autocomplete="email" maxlength="254" required spellcheck="false">')}
      ${field('company', 'Company <span class="fine-print">(optional)</span>', '<input class="field__input" id="gate-company" name="company" type="text" autocomplete="organization" maxlength="160">')}
      ${field('note', 'Biggest problem with the site? <span class="fine-print">(optional)</span>', '<textarea class="field__input" id="gate-note" name="note" rows="2" maxlength="1000"></textarea>')}
      <div class="vector-gate__field" data-field="consent">
        <label class="vector-gate__consent"><input type="checkbox" name="consent" value="1" required><span>Email me this report. I agree that LRACDIMENSION may contact me about it, as described in the <a href="/privacy/">privacy notice</a>.</span></label>
        <p class="vector-gate__err" data-err-for="consent" role="alert"></p>
      </div>
      <div class="vector-gate__hp" aria-hidden="true"><label>Leave this empty <input type="text" name="honeypot" tabindex="-1" autocomplete="off"></label></div>
      <div class="vector-gate__turnstile" data-turnstile hidden></div>
      <p class="intake__error" data-vector-gate-error role="alert"></p>
      <button type="submit" class="btn" data-vector-gate-submit>Email me the full report ↗</button>
    </form>
    <div class="vector-gate__status" data-vector-gate-status hidden aria-live="polite"></div>
  </section>`;
}

let turnstileReady = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  turnstileReady ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('missing')));
    s.onerror = () => {
      turnstileReady = null;
      reject(new Error('blocked'));
    };
    document.head.appendChild(s);
  });
  return turnstileReady;
}

const STATUS = {
  pending: (to) => `<p class="overline">Full report</p><h3><span class="vector-gate__spin" aria-hidden="true"></span>Preparing your report…</h3><p>It is going to <b>${esc(to)}</b>. This usually takes under a minute.</p>`,
  sent: (to) => `<p class="overline">Full report</p><h3>Sent. Check your inbox.</h3><p>The full report went to <b>${esc(to)}</b>. If it is not there in a few minutes, check the spam or promotions folder.</p>`,
  duplicate: (to) => `<p class="overline">Full report</p><h3>Already sent.</h3><p>This report already went to <b>${esc(to)}</b> this week. Check your inbox, including the spam and promotions folders.</p>`,
  slow: (to) => `<p class="overline">Full report</p><h3>Still sending.</h3><p>It will reach <b>${esc(to)}</b> within a few minutes.</p>`,
  failed: () => `<p class="overline">Full report</p><h3>The email could not be sent.</h3><p>I have been notified and will send the report to you myself. You can also <a class="text-link text-link--inline" href="/#start" data-open-start>start a project</a> and mention it.</p>`
};
const FAILED = ['failed', 'skipped', 'suppressed', 'bounced'];
const CHECK_PROMPT = 'Complete the security check, then send the form again.';

function initGate(gate, auditId, initialSource) {
  const form = gate.querySelector('[data-vector-gate-form]');
  const statusEl = gate.querySelector('[data-vector-gate-status]');
  const errorEl = form.querySelector('[data-vector-gate-error]');
  const submit = form.querySelector('[data-vector-gate-submit]');
  const tsEl = form.querySelector('[data-turnstile]');
  const f = (n) => form.elements.namedItem(n);
  const siteKey = CFG.turnstileSiteKey || '';
  let source = initialSource;
  let widget = null;
  let token = '';
  let pollTimer = null;

  const prefill = store.get(PREFILL_KEY);
  if (prefill) {
    if (prefill.email) f('email').value = prefill.email;
    if (prefill.note) f('note').value = prefill.note;
    source = 'diagnostic';
  }

  async function mountTurnstile() {
    if (!siteKey || widget !== null) return;
    try {
      const ts = await loadTurnstile();
      tsEl.hidden = false;
      widget = ts.render(tsEl, {
        sitekey: siteKey,
        action: 'report_request',
        theme: 'dark',
        appearance: 'interaction-only',
        callback: (t) => {
          token = t;
          // Clear only the "complete the check" prompt; a server error stays until the next send.
          if (errorEl.textContent === CHECK_PROMPT) errorEl.textContent = '';
        },
        'expired-callback': () => (token = ''),
        'error-callback': () => {
          token = '';
        }
      });
    } catch {
      errorEl.textContent = 'The security check could not load. Allow challenges.cloudflare.com for this page, or try another browser.';
    }
  }
  const resetTurnstile = () => {
    token = '';
    if (widget !== null && window.turnstile) window.turnstile.reset(widget);
  };

  const setErr = (name, message) => {
    const el = form.querySelector(`[data-err-for="${name}"]`);
    const input = f(name);
    if (el) el.textContent = message || '';
    if (input && input.setAttribute) input.setAttribute('aria-invalid', message ? 'true' : 'false');
    return !message;
  };
  const clearErrs = () => {
    ['name', 'email', 'company', 'note', 'consent'].forEach((n) => setErr(n, ''));
    errorEl.textContent = '';
  };
  // An error goes away as soon as its field is edited.
  form.addEventListener('input', (e) => {
    if (e.target.name && form.querySelector(`[data-err-for="${e.target.name}"]`)) setErr(e.target.name, '');
  });

  function show(state, to) {
    statusEl.innerHTML = `${STATUS[state](to)}${state === 'pending' || state === 'slow' ? '' : '<p><button type="button" class="text-link" data-gate-again>Send it to a different address ↗</button></p>'}`;
    statusEl.hidden = false;
    form.hidden = true;
    const again = statusEl.querySelector('[data-gate-again]');
    if (again) {
      again.addEventListener('click', () => {
        clearTimeout(pollTimer);
        store.del(requestKey(auditId));
        statusEl.hidden = true;
        form.hidden = false;
        form.reset();
        resetTurnstile();
        f('name').focus();
      });
    }
  }

  function track(id, to, tries = 0) {
    clearTimeout(pollTimer);
    if (tries >= 40) return show('slow', to);
    pollTimer = setTimeout(async () => {
      try {
        const r = await api(`/api/vector/report-requests/${encodeURIComponent(id)}`);
        if (r.status === 'sent') return show('sent', to);
        if (FAILED.includes(r.status)) return show('failed', to);
      } catch (e) {
        if (e.status === 404) return show('sent', to);
      }
      track(id, to, tries + 1);
    }, tries < 10 ? 1500 : 4000);
  }

  // A request already made from this tab: show where it stands instead of the form.
  const earlier = store.get(requestKey(auditId));
  if (earlier && earlier.id) {
    show('pending', earlier.email_masked);
    track(earlier.id, earlier.email_masked);
  } else {
    mountTurnstile();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrs();
    const body = {
      name: f('name').value.trim(),
      email: f('email').value.trim(),
      company: f('company').value.trim() || null,
      note: f('note').value.trim() || null,
      consent: f('consent').checked,
      source,
      honeypot: f('honeypot').value
    };
    let ok = true;
    if (body.name.length < 2) ok = setErr('name', 'Enter your name.') && ok;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email)) ok = setErr('email', 'Enter a valid email address.') && ok;
    if (!body.consent) ok = setErr('consent', 'Tick the box so the report can be emailed to you.') && ok;
    if (!ok) return form.querySelector('[aria-invalid="true"]')?.focus();
    if (siteKey) {
      if (widget === null) await mountTurnstile();
      if (!token) {
        errorEl.textContent = CHECK_PROMPT;
        return;
      }
      body.turnstile_token = token;
    }
    submit.disabled = true;
    submit.textContent = 'Sending…';
    try {
      const out = await api(`/api/vector/audits/${encodeURIComponent(auditId)}/report-requests`, { method: 'POST', body });
      store.del(PREFILL_KEY);
      store.set(requestKey(auditId), { id: out.id, email_masked: out.email_masked });
      if (out.duplicate) show(out.status === 'sent' ? 'duplicate' : 'pending', out.email_masked);
      else show('pending', out.email_masked);
      if (!(out.duplicate && out.status === 'sent')) track(out.id, out.email_masked);
    } catch (err) {
      if (err.fields && err.fields.length) err.fields.forEach((x) => setErr(x.field, x.message));
      else errorEl.textContent = err.message;
      resetTurnstile();
    } finally {
      submit.disabled = false;
      submit.textContent = 'Email me the full report ↗';
    }
  });
}

/** What anyone sees: scores, counts, the top issues, and the form for the rest. */
function renderBrief(el, res, history_, { onReset, source }) {
  const { audit, results, issues, methodology } = res;
  const locked = res.locked || { issues: 0, fixes: 0, total_issues: issues.length };
  const counts = (audit.summary && audit.summary.counts) || issues.reduce((c, i) => ((c[i.severity] = (c[i.severity] || 0) + 1), c), {});
  el.innerHTML = `
    ${reportHead(audit, 'Examination complete · summary', `<button type="button" class="text-link" data-vector-reset>New examination ↗</button><a class="text-link" href="/vector/audit/${esc(audit.id)}/">Summary link ↗</a>`)}
    ${healthBlock(audit, methodology)}
    ${categoryTable(results)}
    ${countsBlock(counts)}
    <div class="vector-issues vector-issues--brief">
      <p class="overline">${issues.length ? `Top ${issues.length === 1 ? 'issue' : `${issues.length} issues`} of ${locked.total_issues}` : 'Issues'}</p>
      ${issues.length ? issues.map((i) => `
      <article class="vector-issue" data-sev="${esc(cap(i.severity))}">
        <p class="vector-issue__sev"><span class="sev" data-sev="${esc(cap(i.severity))}">${esc(cap(i.severity))}</span> <span class="fine-print">${esc(CATEGORY_LABEL[i.category] || i.category)}</span></p>
        <h3>${esc(i.title)}</h3>
        <dl><dt>Why it matters</dt><dd>${esc(i.explanation)}</dd><dt>Prescription</dt><dd class="vector-locked">In the full report</dd></dl>
      </article>`).join('') : '<p class="body body--sm">No issue crossed the reporting threshold in any category.</p>'}
    </div>
    ${gateHtml(locked)}
    ${renderHistory(history_, audit.id)}
    <p class="fine-print vector-mode">Measured from the live document, its response headers, robots.txt, sitemap, llms.txt, and a sample of its links. AI visibility reports whether AI crawlers can read the site, not whether any AI answer mentions it. Security is a header review, not a vulnerability scan.</p>`;
  bindCommon(el, onReset);
  initGate(el.querySelector('[data-vector-gate]'), audit.id, source);
}

/* ------------------------------------------------------------ /vector/ page */

export function initVector() {
  const root = document.querySelector('[data-vector]');
  if (!root) return;
  const form = root.querySelector('[data-vector-form]');
  const input = form.querySelector('#vector-url');
  const submit = form.querySelector('[data-vector-submit]');
  const error = form.querySelector('[data-vector-error]');
  const states = { examining: root.querySelector('[data-vector-state="examining"]'), failed: root.querySelector('[data-vector-state="failed"]'), report: root.querySelector('[data-vector-state="report"]') };
  const stagesEl = root.querySelector('[data-vector-stages]');
  const consoleEl = root.querySelector('[data-vector-console]');
  const reason = root.querySelector('[data-vector-reason]');
  const causes = root.querySelector('[data-vector-causes]');
  const reportEl = root.querySelector('[data-vector-report]');
  const modeNote = root.querySelector('[data-vector-modenote]');
  const listedBox = form.querySelector('[data-vector-listed]');
  const recentEl = root.querySelector('[data-vector-recent]');
  let busy = false;
  let pollTimer = null;
  let consoleTimer = null;
  let opened = 'vector';

  if (modeNote) modeNote.textContent = hasApi() ? 'Connected to the analysis engine: eight analyzers including AI visibility, Core Web Vitals where available, stored reports, and history per website. The summary shows here; the full report is emailed to you.' : 'The analysis engine is not connected on this deployment. Examinations run in your browser as a structural read and are labelled as such.';

  const show = (name) => Object.entries(states).forEach(([k, el]) => (el.hidden = k !== name));
  const setBusy = (on) => {
    busy = on;
    submit.disabled = on;
    submit.textContent = on ? 'Examining…' : 'Examine ↗';
  };
  const idle = () => {
    clearTimeout(pollTimer);
    clearInterval(consoleTimer);
    show(null);
    setBusy(false);
    history.replaceState(null, '', location.pathname.startsWith('/vector/audit/') ? '/vector/' : location.pathname);
    input.focus();
  };
  root.querySelectorAll('[data-vector-reset]').forEach((b) => b.addEventListener('click', idle));

  function renderStages(stages) {
    if (!stagesEl) return;
    stagesEl.innerHTML = stages.map((s) => `<li data-state="${esc(s.state)}"><span aria-hidden="true">${s.state === 'done' ? '✓' : s.state === 'active' ? '●' : s.state === 'failed' ? '✕' : '○'}</span>${esc(s.label)}<span class="sr-only"> (${esc(s.state)})</span></li>`).join('');
  }

  function fail(message, extraCauses) {
    clearInterval(consoleTimer);
    reason.textContent = message;
    if (causes) causes.innerHTML = (extraCauses || ['The server is unavailable', 'The request timed out', 'The website blocked automated requests']).map((c) => `<li>${esc(c)}</li>`).join('');
    show('failed');
    setBusy(false);
  }

  /* ---- API mode ------------------------------------------------------- */
  async function examineApi(url) {
    let audit;
    try {
      audit = await api('/api/vector/audits', { method: 'POST', body: { url, listed: !listedBox || listedBox.checked } });
    } catch (e) {
      if (e.code === 'invalid_url' || e.code === 'validation') {
        error.textContent = e.message;
        setBusy(false);
        show(null);
        return;
      }
      return fail(e.message, e.code === 'rate_limited' ? ['You have run several examinations recently', 'Wait a few minutes and try again'] : undefined);
    }
    history.replaceState(null, '', `/vector/audit/${audit.id}/`);
    renderStages(audit.stages);
    await poll(audit.id);
  }

  async function poll(id) {
    let audit;
    try {
      audit = await api(`/api/vector/audits/${id}`);
    } catch (e) {
      return fail(e.message);
    }
    renderStages(audit.stages);
    if (audit.status === 'completed') return loadReport(id);
    if (audit.status === 'failed') return fail(audit.error_message || 'The examination failed.');
    pollTimer = setTimeout(() => poll(id), 1200);
  }

  async function loadReport(id) {
    let res;
    try {
      res = await api(`/api/vector/audits/${id}/results`);
    } catch (e) {
      return fail(e.message);
    }
    let history_ = [];
    try {
      history_ = await api(`/api/vector/websites/${new URL(res.audit.url).hostname}/audits`);
    } catch {}
    if (res.gated) renderBrief(reportEl, res, history_, { onReset: idle, source: opened });
    else renderFullReport(reportEl, res, history_, { onReset: idle });
    show('report');
    setBusy(false);
    states.report.scrollIntoView({ block: 'start', behavior: 'smooth' });
    try {
      sessionStorage.setItem('lracdim:last-report', JSON.stringify({ url: res.audit.url, mode: 'engine', scores: res.audit.scores, health: res.audit.health_score, id, timestamp: res.audit.completed_at }));
    } catch {}
  }

  /* ---- Browser mode --------------------------------------------------- */
  async function examineBrowser(url) {
    const lines = ['Reading document structure', 'Counting assets', 'Checking accessibility basics', 'Reading title, description, headings', 'Scoring'];
    let i = 0;
    consoleEl.textContent = '> Browser mode: structural read';
    consoleTimer = setInterval(() => {
      if (i < lines.length) consoleEl.textContent += '\n> ' + lines[i++];
      else clearInterval(consoleTimer);
    }, 320);
    try {
      const r = await runAnalysis(url);
      clearInterval(consoleTimer);
      const cats = [['Structure', r.scores.uiux], ['Performance', r.scores.performance], ['Content', r.scores.contentWeight], ['SEO', r.scores.seo]];
      const health = Math.round(cats.reduce((a, [, s]) => a + s, 0) / cats.length);
      reportEl.innerHTML = `
        <div class="vector-report__head"><div><p class="overline">Examination complete · browser mode</p><h2 class="vector-report__url">${esc(r.url)}</h2><p class="fine-print">${esc(new Date(r.timestamp).toLocaleString())} · mode: ${esc(r.mode)}</p></div><button type="button" class="text-link" data-vector-reset>New examination ↗</button></div>
        <div class="vector-health" data-grade="${grade(health)}"><p class="overline">Structural score</p><p class="vector-health__score"><b>${health}</b> / 100</p><p class="fine-print">Mean of four browser-side reads. Not the engine's seven-category health score.</p></div>
        <table class="vector-table"><tbody>${cats.map(([l, s]) => `<tr data-grade="${grade(s)}"><th scope="row">${esc(l)}</th><td>${s}</td><td><div class="scorecard__meter"><div class="scorecard__fill" style="width:${s}%"></div></div></td></tr>`).join('')}</tbody></table>
        <div class="vector-issues">${r.bottlenecks.map((b) => `<article class="vector-issue" data-sev="${esc(b.severity)}"><p class="vector-issue__sev"><span class="sev" data-sev="${esc(b.severity)}">${esc(b.severity)}</span></p><h3>${esc(b.title)}</h3><dl><dt>Evidence</dt><dd>${esc(b.explanation)}</dd>${b.why ? `<dt>Why it matters</dt><dd>${esc(b.why)}</dd>` : ''}<dt>Prescription</dt><dd>${esc(b.fix)}</dd>${b.impact ? `<dt>Expected impact</dt><dd>${esc(b.impact)}</dd>` : ''}</dl></article>`).join('') || '<p class="body body--sm">No structural issue crossed the threshold.</p>'}</div>
        <p class="fine-print vector-mode">${esc(r.mode === 'live' ? 'Live read through the scanner worker.' : 'Modelled profile: the analysis engine is not connected on this deployment and a browser cannot read another site directly, so figures are derived from the URL. This is not a measurement.')}</p>
        <div class="actions"><a class="btn" href="/#start" data-open-start>Fix it with me ↗</a></div>`;
      reportEl.querySelectorAll('[data-vector-reset]').forEach((b) => b.addEventListener('click', idle));
      show('report');
      setBusy(false);
      postLead('vector', { website: url, mode: r.mode, scores: r.scores });
    } catch (err) {
      fail(err && err.message ? err.message : 'The examination could not complete.');
    }
  }

  async function examine(raw) {
    if (busy) return;
    error.textContent = '';
    const url = normalizeUrl(raw);
    if (!plausible(url)) {
      error.textContent = 'Enter a public website address, for example company.com.';
      input.focus();
      return;
    }
    setBusy(true);
    show('examining');
    if (hasApi()) {
      if (stagesEl) stagesEl.innerHTML = '<li data-state="active"><span aria-hidden="true">●</span>Queuing examination</li>';
      if (consoleEl) consoleEl.textContent = '';
      await examineApi(url);
    } else {
      if (stagesEl) stagesEl.innerHTML = '';
      await examineBrowser(url);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    opened = 'vector';
    examine(input.value);
  });

  async function loadRecent() {
    if (!recentEl || !hasApi()) return;
    try {
      const items = await api('/api/vector/recent');
      if (!items.length) return;
      recentEl.querySelector('[data-vector-recent-list]').innerHTML = items.map((it) => `<li><a href="/vector/audit/${esc(it.id)}/"><span class="vector-recent__host">${esc(it.host)}</span><span class="project-type">${esc(dateShort(it.completed_at))}</span><b data-grade="${grade(it.health_score)}">${it.health_score}</b></a></li>`).join('');
      recentEl.hidden = false;
    } catch {}
  }
  loadRecent();

  // Deep link: /vector/audit/<id>/ (or ?id= in dev) opens a stored examination's summary.
  const m = location.pathname.match(/\/vector\/audit\/([a-z0-9]+)\/?/i);
  const id = (m && m[1]) || new URLSearchParams(location.search).get('id');
  const preset = new URLSearchParams(location.search).get('url');
  if (id && hasApi()) {
    opened = 'report-link';
    setBusy(true);
    show('examining');
    if (stagesEl) stagesEl.innerHTML = '<li data-state="active"><span aria-hidden="true">●</span>Loading stored examination</li>';
    poll(id);
  } else if (preset) {
    input.value = preset;
    examine(preset);
  }
}

/* ---------------------------------------------- /vector/report/#t=<token> */

export async function initVectorReport() {
  const root = document.querySelector('[data-vector-fullreport]');
  if (!root) return;
  const reportEl = root.querySelector('[data-vector-report]');
  const stateEl = root.querySelector('[data-vector-report-state]');
  // A second report link opened in this tab only changes the fragment; load that report instead of keeping this one.
  window.addEventListener('hashchange', () => location.reload());
  const token = new URLSearchParams(location.hash.slice(1)).get('t');
  const showState = (title, html) => {
    stateEl.innerHTML = `<p class="overline">Full report</p><h2 class="vector-state__title">${esc(title)}</h2>${html}`;
    stateEl.hidden = false;
    reportEl.hidden = true;
  };
  if (!token) return showState('Open this page from your report email.', '<p>The full report is reached through the private link in the email Vector sent you. To get one, <a class="text-link text-link--inline" href="/vector/">examine a website</a> and request the full report.</p>');
  if (!hasApi()) return showState('The analysis engine is not connected here.', '<p>Open the link on www.lracdimension.online.</p>');
  let res;
  try {
    res = await api('/api/vector/report', { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    const auditId = e.detail && e.detail.audit_id;
    const again = auditId ? `<p><a class="btn" href="/vector/audit/${esc(auditId)}/">Request a new copy ↗</a></p>` : `<p><a class="btn" href="/vector/">Examine a website ↗</a></p>`;
    if (e.code === 'link_expired') return showState('This report link has expired.', `<p>Report links work for a limited time. Open the summary and request a fresh copy by email.</p>${again}`);
    if (e.code === 'link_revoked') return showState('This report link was withdrawn.', `<p>Request a fresh copy from the summary page.</p>${again}`);
    if (e.code === 'invalid_link' || e.status === 404 || e.status === 401) return showState('This report link is not valid.', `<p>Check that the whole link was copied from the email. Some mail apps break long links across lines.</p>${again}`);
    return showState('The report could not be loaded.', `<p>${esc(e.message)}</p><p><button type="button" class="btn" data-retry>Try again ↗</button></p>`);
  } finally {
    stateEl.querySelector('[data-retry]')?.addEventListener('click', () => location.reload());
  }
  let history_ = [];
  try {
    history_ = await api(`/api/vector/websites/${new URL(res.audit.url).hostname}/audits`);
  } catch {}
  stateEl.hidden = true;
  reportEl.hidden = false;
  renderFullReport(reportEl, res, history_, {
    onReset: () => location.assign('/vector/'),
    pdf: res.pdf ? () => apiBlob('/api/vector/report/pdf', { headers: { Authorization: `Bearer ${token}` } }) : null
  });
  try {
    document.title = `Full report: ${new URL(res.audit.summary.final_url || res.audit.url).hostname} · Vector`;
  } catch {}
  const greet = root.querySelector('[data-vector-greeting]');
  if (greet && res.requester && res.requester.first_name) {
    greet.textContent = `Prepared for ${res.requester.first_name}. This link works until ${new Date(res.link.expires_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}; keep the email to come back to it.`;
    greet.hidden = false;
  }
}

/* ----------------------------------------- /vector/unsubscribe/#t=<token> */

export function initVectorUnsubscribe() {
  const root = document.querySelector('[data-vector-unsubscribe]');
  if (!root) return;
  const btn = root.querySelector('[data-unsubscribe-confirm]');
  const msg = root.querySelector('[data-unsubscribe-msg]');
  window.addEventListener('hashchange', () => location.reload());
  const token = new URLSearchParams(location.hash.slice(1)).get('t');
  if (!token || !hasApi()) {
    msg.textContent = 'This page opens from the link at the bottom of a report email.';
    btn.hidden = true;
    return;
  }
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Working…';
    try {
      await api(`/api/vector/unsubscribe/${encodeURIComponent(token)}`, { method: 'POST', body: {} });
      root.querySelector('[data-unsubscribe-title]').textContent = 'Done. No more email to this address.';
      msg.textContent = 'This address will not receive email from this site again, including future report requests. If that was a mistake, reply to any email from LRACDIMENSION and ask to be added back.';
      btn.hidden = true;
    } catch (e) {
      msg.textContent = e.message;
      btn.disabled = false;
      btn.textContent = 'Stop emails to this address';
    }
  });
}

/**
 * Homepage badge: this site's latest score on its own engine. Reads stored
 * history for the site's host and renders nothing when the API is absent or
 * no completed examination exists, so the badge is never a claim without a
 * measurement behind it.
 */
export async function initVectorBadge() {
  const el = document.querySelector('[data-vector-badge]');
  if (!el || !hasApi()) return;
  try {
    const items = await api(`/api/vector/websites/${location.hostname}/audits`);
    const last = items.filter((i) => i.health_score != null).pop();
    if (!last) return;
    el.innerHTML = `<a href="/vector/audit/${esc(last.id)}/"><b data-grade="${grade(last.health_score)}">${last.health_score}</b><span><span class="hero-badge__label">This site on Vector</span><span class="project-type">${esc(dateShort(last.completed_at))} · view report ↗</span></span></a>`;
    el.hidden = false;
  } catch {}
}
