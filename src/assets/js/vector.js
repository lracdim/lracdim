/**
 * VECTOR — Web Clinic. Inline examination on /vector/.
 *
 * Uses the same analysis service as the site-wide diagnostic modal, so the
 * report's `mode` ('live' or 'profiled') is always stated. Accepts ?url= so
 * the home page form can hand a URL straight in.
 */
import { runAnalysis, normalizeUrl } from './analyzer/service.js';
import { postLead } from './leads.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const grade = (s) => (s >= 80 ? 'good' : s >= 50 ? 'warn' : 'bad');

const CATEGORIES = [
  ['Structure', 'uiux'],
  ['Performance', 'performance'],
  ['Content', 'contentWeight'],
  ['SEO', 'seo']
];

const SEVERITY_ORDER = ['Critical', 'High', 'Medium', 'Low'];

function isPlausibleUrl(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const host = u.hostname;
    if (!host.includes('.')) return false;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
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
  const states = {
    examining: root.querySelector('[data-vector-state="examining"]'),
    failed: root.querySelector('[data-vector-state="failed"]'),
    report: root.querySelector('[data-vector-state="report"]')
  };
  const consoleEl = root.querySelector('[data-vector-console]');
  const reason = root.querySelector('[data-vector-reason]');
  const reportEl = root.querySelector('[data-vector-report]');
  let timer = null;
  let busy = false;

  const show = (name) => Object.entries(states).forEach(([k, el]) => (el.hidden = k !== name));
  const idle = () => {
    show(null);
    busy = false;
    submit.disabled = false;
    submit.textContent = 'Examine ↗';
    input.focus();
  };

  root.querySelectorAll('[data-vector-reset]').forEach((b) => b.addEventListener('click', idle));

  function playConsole(url) {
    const lines = [
      `Resolving ${url}`,
      'Requesting document',
      'Parsing structure',
      'Counting assets',
      'Checking accessibility basics',
      'Reading title, description, headings',
      'Scoring'
    ];
    consoleEl.textContent = '';
    let i = 0;
    clearInterval(timer);
    timer = setInterval(() => {
      if (i >= lines.length) return clearInterval(timer);
      consoleEl.textContent += (i ? '\n' : '') + '> ' + lines[i++];
    }, 320);
  }

  function renderReport(r) {
    const scores = CATEGORIES.map(([label, key]) => [label, r.scores[key]]);
    const health = Math.round(scores.reduce((a, [, s]) => a + s, 0) / scores.length);
    const counts = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0]));
    r.bottlenecks.forEach((b) => (counts[b.severity] = (counts[b.severity] || 0) + 1));
    const modeNote =
      r.mode === 'live'
        ? 'Live examination. Every figure was read from the document the site returned.'
        : r.liveError
        ? `Modelled profile. The live scanner could not read this site (${r.liveError}); figures are derived from the URL, not measured.`
        : 'Modelled profile. No live scanner is connected on this deployment, so figures are derived from the URL, not measured. A live read is part of the full examination.';

    const issues = r.bottlenecks.length
      ? r.bottlenecks
          .map(
            (b) => `
        <article class="vector-issue" data-sev="${esc(b.severity)}">
          <p class="vector-issue__sev"><span class="sev" data-sev="${esc(b.severity)}">${esc(b.severity)}</span></p>
          <h3>${esc(b.title)}</h3>
          <dl>
            <dt>Evidence</dt><dd>${esc(b.explanation)}</dd>
            ${b.why ? `<dt>Why it matters</dt><dd>${esc(b.why)}</dd>` : ''}
            <dt>Prescription</dt><dd>${esc(b.fix)}</dd>
            ${b.impact ? `<dt>Expected impact</dt><dd>${esc(b.impact)}</dd>` : ''}
          </dl>
        </article>`
          )
          .join('')
      : '<p class="body body--sm">No structural issue crossed the reporting threshold in what was read.</p>';

    const prescription = r.bottlenecks.length
      ? `<ol class="vector-rx">${r.bottlenecks
          .map((b, i) => `<li><span class="project-type">${String(i + 1).padStart(2, '0')} — ${esc(b.severity)}</span><strong>${esc(b.fix)}</strong><span>${esc(b.title)}</span></li>`)
          .join('')}</ol>`
      : '<p class="body body--sm">Nothing to prescribe from this read. A live examination may find more.</p>';

    reportEl.innerHTML = `
      <div class="vector-report__head">
        <div><p class="overline">Examination complete</p><h2 class="vector-report__url">${esc(r.url)}</h2><p class="fine-print">${esc(new Date(r.timestamp).toLocaleString())} · Mode: ${esc(r.mode)}</p></div>
        <button type="button" class="text-link" data-vector-reset>New examination ↗</button>
      </div>
      <div class="vector-health" data-grade="${grade(health)}"><p class="overline">Website health</p><p class="vector-health__score"><b>${health}</b> / 100</p><p class="fine-print">Mean of the four category scores below. Ranges: 80 to 100 operating as a system; 50 to 79 functional with compounding friction; under 50 a structural problem.</p></div>
      <table class="vector-table"><caption class="overline">Categories</caption><tbody>${scores
        .map(([l, s]) => `<tr data-grade="${grade(s)}"><th scope="row">${esc(l)}</th><td>${s}</td><td><div class="scorecard__meter"><div class="scorecard__fill" style="width:${s}%"></div></div></td></tr>`)
        .join('')}</tbody></table>
      <div class="vector-metrics">${[
        ['Load time', r.mode === 'live' ? r.metrics.loadTimeSeconds.toFixed(2) + 's' : 'not measured'],
        ['DOM depth', r.metrics.domDepth],
        ['Scripts', r.metrics.scriptCount],
        ['Stylesheets', r.metrics.cssCount],
        ['Images', r.metrics.imageCount],
        ['Content class', r.metrics.contentClassification]
      ]
        .map(([l, v]) => `<div><span class="project-type">${esc(l)}</span><strong>${esc(v)}</strong></div>`)
        .join('')}</div>
      <div class="vector-counts"><p class="overline">Issues detected</p>${SEVERITY_ORDER.map((s) => `<span data-sev="${s}"><b>${String(counts[s] || 0).padStart(2, '0')}</b> ${s}</span>`).join('')}</div>
      <div class="vector-issues">${issues}</div>
      <div class="vector-rx-wrap"><p class="overline">Prescription</p>${prescription}</div>
      <p class="fine-print vector-mode">${esc(modeNote)}</p>
      <div class="actions"><a class="btn" href="/start/">Fix it with me ↗</a><a class="text-link" href="#coverage">What this measures ↗</a></div>`;
    reportEl.querySelectorAll('[data-vector-reset]').forEach((b) => b.addEventListener('click', idle));
  }

  async function examine(raw) {
    if (busy) return;
    error.textContent = '';
    const url = normalizeUrl(raw);
    if (!isPlausibleUrl(url)) {
      error.textContent = 'Enter a public website address, for example company.com.';
      input.focus();
      return;
    }
    busy = true;
    submit.disabled = true;
    submit.textContent = 'Examining…';
    show('examining');
    playConsole(url);
    try {
      const report = await runAnalysis(url);
      clearInterval(timer);
      renderReport(report);
      show('report');
      states.report.scrollIntoView({ block: 'start', behavior: 'smooth' });
      try {
        sessionStorage.setItem('lracdim:last-report', JSON.stringify({ url: report.url, mode: report.mode, scores: report.scores, timestamp: report.timestamp }));
      } catch {}
      postLead('vector', { website: url, mode: report.mode, scores: report.scores, issues: report.bottlenecks.map((b) => b.title) });
    } catch (err) {
      clearInterval(timer);
      reason.textContent = err && err.message ? err.message : 'Connection failed.';
      show('failed');
    } finally {
      busy = false;
      submit.disabled = false;
      submit.textContent = 'Examine ↗';
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    examine(input.value);
  });

  const preset = new URLSearchParams(location.search).get('url');
  if (preset) {
    input.value = preset;
    examine(preset);
  }
}
