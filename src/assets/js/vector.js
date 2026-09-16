/**
 * VECTOR — Web Clinic.
 *
 * API mode (apiBase set): POST an audit, poll its stages, then render the
 * full seven-category report with issues and prescription from the Python
 * engine. Reports are addressable at /vector/audit/<id>/ and a website's
 * completed audits form its history.
 *
 * Browser mode (no API): the original in-browser structural read, labelled
 * as such. Nothing is presented as more than it is.
 */
import { api, ApiError, esc, hasApi } from './api.js';
import { runAnalysis, normalizeUrl } from './analyzer/service.js';
import { postLead } from './leads.js';

const grade = (s) => (s >= 80 ? 'good' : s >= 50 ? 'warn' : 'bad');
const SEV = ['critical', 'high', 'medium', 'low'];
const CATEGORY_LABEL = { technical: 'Technical', seo: 'SEO', performance: 'Performance', accessibility: 'Accessibility', security: 'Security', links: 'Links', content: 'Content', uiux: 'Structure', contentWeight: 'Content' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

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

  if (modeNote) modeNote.textContent = hasApi() ? 'Connected to the analysis engine: seven analyzers, stored reports, and history per website.' : 'The analysis engine is not connected on this deployment. Examinations run in your browser as a structural read and are labelled as such.';

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
    renderApiReport(res, history_);
    show('report');
    setBusy(false);
    states.report.scrollIntoView({ block: 'start', behavior: 'smooth' });
    try {
      sessionStorage.setItem('lracdim:last-report', JSON.stringify({ url: res.audit.url, mode: 'engine', scores: res.audit.scores, health: res.audit.health_score, id, timestamp: res.audit.completed_at }));
    } catch {}
  }

  function renderApiReport(res, history_) {
    const { audit, results, issues, prescription, methodology } = res;
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    issues.forEach((i) => (counts[i.severity] = (counts[i.severity] || 0) + 1));
    const shareUrl = `${location.origin}/vector/audit/${audit.id}/`;
    reportEl.innerHTML = `
      <div class="vector-report__head">
        <div><p class="overline">Examination complete · engine</p><h2 class="vector-report__url">${esc(audit.summary.final_url || audit.url)}</h2><p class="fine-print">${esc(new Date(audit.completed_at).toLocaleString())} · HTTP ${esc(audit.summary.status)} · ${esc(audit.summary.response_ms)} ms to first document</p></div>
        <div class="actions" style="margin:0"><button type="button" class="text-link" data-vector-reset>New examination ↗</button><a class="text-link" href="${esc(shareUrl)}">Report link ↗</a><button type="button" class="text-link" data-vector-print>Save as PDF ↗</button></div>
      </div>
      <div class="vector-health" data-grade="${grade(audit.health_score)}"><p class="overline">Website health</p><p class="vector-health__score"><b>${audit.health_score}</b> / 100</p><p class="fine-print">Weighted mean of the category scores. <button type="button" class="text-link text-link--inline" data-toggle-method aria-expanded="false">How scores are calculated ↗</button></p><pre class="vector-console" data-method hidden>${esc(methodology)}</pre></div>
      <table class="vector-table"><caption class="overline">Categories</caption><tbody>${results.map((r) => `<tr data-grade="${grade(r.score)}"><th scope="row">${esc(CATEGORY_LABEL[r.category] || cap(r.category))}</th><td>${r.score}</td><td><div class="scorecard__meter"><div class="scorecard__fill" style="width:${r.score}%"></div></div></td></tr>`).join('')}</tbody></table>
      <div class="vector-counts"><p class="overline">Issues</p>${SEV.map((s) => `<span data-sev="${s}"><b>${String(counts[s] || 0).padStart(2, '0')}</b> ${cap(s)}</span>`).join('')}</div>
      <div class="vector-issues">${issues.length ? issues.map((i) => `
        <article class="vector-issue" data-sev="${esc(cap(i.severity))}">
          <p class="vector-issue__sev"><span class="sev" data-sev="${esc(cap(i.severity))}">${esc(cap(i.severity))}</span> <span class="fine-print">${esc(CATEGORY_LABEL[i.category] || i.category)}</span></p>
          <h3>${esc(i.title)}</h3>
          <dl><dt>Evidence</dt><dd>${esc(i.evidence)}</dd><dt>Why it matters</dt><dd>${esc(i.explanation)}</dd><dt>Prescription</dt><dd>${esc(i.recommendation)}</dd><dt>Expected impact</dt><dd>${esc(i.impact)}</dd></dl>
        </article>`).join('') : '<p class="body body--sm">No issue crossed the reporting threshold in any category.</p>'}</div>
      <div class="vector-rx-wrap"><p class="overline">Prescription</p>${prescription.length ? `<ol class="vector-rx">${prescription.map((p) => `<li><span class="project-type">${String(p.position).padStart(2, '0')} — ${esc(cap(p.severity))}</span><strong>${esc(p.action)}</strong><span>${esc((issues.find((i) => i.code === p.issue_code) || {}).title || p.issue_code)}</span></li>`).join('')}</ol>` : '<p class="body body--sm">Nothing to prescribe from this examination.</p>'}</div>
      ${renderHistory(history_, audit.id)}
      ${renderMetrics(results)}
      <p class="fine-print vector-mode">Measured from the live document, its response headers, robots.txt, sitemap, and a sample of its links. Performance figures are document-level indicators, not Core Web Vitals. Security is a header review, not a vulnerability scan.</p>
      <div class="vector-handoff"><p class="overline">Next step</p><h3>Want this fixed?</h3><p>Start a project and this report comes with you: the intake attaches the score, the URL, and the report link so we begin from the findings, not from a blank brief.</p><div class="actions"><a class="btn" href="/start/">Start a project ↗</a><a class="text-link" href="#coverage">What this measures ↗</a></div></div>
      <footer class="vector-print-footer" aria-hidden="true">Website examination by John Carl Dimatulac · LRACDIMENSION · lracdimension.vercel.app · lracdim@gmail.com · Report: ${esc(shareUrl)}</footer>`;
    reportEl.querySelectorAll('[data-vector-reset]').forEach((b) => b.addEventListener('click', idle));
    const printBtn = reportEl.querySelector('[data-vector-print]');
    if (printBtn) printBtn.addEventListener('click', () => { document.body.classList.add('vector-printing'); window.print(); });
    window.addEventListener('afterprint', () => document.body.classList.remove('vector-printing'), { once: true });
    const toggle = reportEl.querySelector('[data-toggle-method]');
    const method = reportEl.querySelector('[data-method]');
    toggle.addEventListener('click', () => {
      method.hidden = !method.hidden;
      toggle.setAttribute('aria-expanded', String(!method.hidden));
    });
    reportEl.querySelectorAll('[data-toggle-metrics]').forEach((b) => b.addEventListener('click', () => {
      const t = reportEl.querySelector('[data-metrics]');
      t.hidden = !t.hidden;
      b.setAttribute('aria-expanded', String(!t.hidden));
    }));
  }

  function renderHistory(items, currentId) {
    if (!items || items.length < 2) return `<div class="vector-history"><p class="overline">History</p><p class="fine-print">${items && items.length === 1 ? 'First examination of this website. Run it again after changes to see progression.' : 'No stored history for this website.'}</p></div>`;
    const max = 100;
    return `<div class="vector-history"><p class="overline">History · ${items.length} examinations</p><ol class="vector-history__list">${items.map((it) => `<li${it.id === currentId ? ' aria-current="true"' : ''}><a href="/vector/audit/${esc(it.id)}/"><span class="project-type">${esc(new Date(it.completed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))}</span><span class="vector-history__bar"><span style="width:${(it.health_score / max) * 100}%"></span></span><b>${it.health_score}</b></a></li>`).join('')}</ol></div>`;
  }

  function renderMetrics(results) {
    const rows = results.map((r) => `<tr><th scope="row">${esc(CATEGORY_LABEL[r.category] || r.category)}</th><td><dl class="vector-metrics-dl">${Object.entries(r.metrics).filter(([k]) => k !== 'note').map(([k, v]) => `<dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${esc(Array.isArray(v) ? v.join(', ') || '—' : typeof v === 'object' && v ? JSON.stringify(v) : String(v))}</dd>`).join('')}${r.metrics.note ? `<dt>note</dt><dd>${esc(r.metrics.note)}</dd>` : ''}</dl></td></tr>`).join('');
    return `<div><button type="button" class="text-link" data-toggle-metrics aria-expanded="false">Raw measurements ↗</button><table class="vector-table vector-table--metrics" data-metrics hidden><tbody>${rows}</tbody></table></div>`;
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
        <div class="actions"><a class="btn" href="/start/">Fix it with me ↗</a></div>`;
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
    examine(input.value);
  });

  async function loadRecent() {
    if (!recentEl || !hasApi()) return;
    try {
      const items = await api('/api/vector/recent');
      if (!items.length) return;
      recentEl.querySelector('[data-vector-recent-list]').innerHTML = items.map((it) => `<li><a href="/vector/audit/${esc(it.id)}/"><span class="vector-recent__host">${esc(it.host)}</span><span class="project-type">${esc(new Date(it.completed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))}</span><b data-grade="${grade(it.health_score)}">${it.health_score}</b></a></li>`).join('');
      recentEl.hidden = false;
    } catch {}
  }
  loadRecent();

  // Deep link: /vector/audit/<id>/ (or ?id= in dev) opens a stored report.
  const m = location.pathname.match(/\/vector\/audit\/([a-z0-9]+)\/?/i);
  const id = (m && m[1]) || new URLSearchParams(location.search).get('id');
  const preset = new URLSearchParams(location.search).get('url');
  if (id && hasApi()) {
    setBusy(true);
    show('examining');
    if (stagesEl) stagesEl.innerHTML = '<li data-state="active"><span aria-hidden="true">●</span>Loading stored examination</li>';
    poll(id);
  } else if (preset) {
    input.value = preset;
    examine(preset);
  }
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
    el.innerHTML = `<a href="/vector/audit/${esc(last.id)}/"><b data-grade="${grade(last.health_score)}">${last.health_score}</b><span><span class="hero-badge__label">This site on Vector</span><span class="project-type">${esc(new Date(last.completed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))} · view report ↗</span></span></a>`;
    el.hidden = false;
  } catch {}
}
