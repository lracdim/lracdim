/**
 * System Diagnostic Protocol v1.0 — modal controller.
 *
 * Ported from the Elimate React AnalysisModal. Three steps: input → scanning
 * → report. Opened by any element with [data-open-diagnostic], or by
 * dispatching `window.dispatchEvent(new CustomEvent('open-diagnostic'))`.
 */

import { runAnalysis, normalizeUrl } from './analyzer/service.js';
import { postLead } from './leads.js';

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

const grade = (score) => (score >= 80 ? 'good' : score >= 50 ? 'warn' : 'bad');

export function initDiagnosticModal() {
  const modal = document.getElementById('diagnostic');
  if (!modal) return;

  const panel = modal.querySelector('.modal__panel');
  const form = modal.querySelector('#diagnostic-form');
  const steps = {
    input: modal.querySelector('[data-step="input"]'),
    scanning: modal.querySelector('[data-step="scanning"]'),
    report: modal.querySelector('[data-step="report"]')
  };
  const console_ = modal.querySelector('[data-scan-console]');
  const reportSlot = modal.querySelector('[data-report]');
  const urlField = modal.querySelector('#diag-url');

  let lastFocused = null;
  let consoleTimer = null;

  /* --- open / close ----------------------------------------------------- */

  function showStep(name) {
    Object.entries(steps).forEach(([key, el]) => {
      if (el) el.hidden = key !== name;
    });
  }

  function open() {
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('is-locked');
    // Next frame so the transition runs.
    requestAnimationFrame(() => modal.classList.add('is-open'));
    showStep('input');
    setTimeout(() => urlField && urlField.focus(), 120);
  }

  function close() {
    modal.classList.remove('is-open');
    clearInterval(consoleTimer);
    setTimeout(() => {
      modal.hidden = true;
      document.body.classList.remove('is-locked');
      showStep('input');
      if (form) form.reset();
      if (lastFocused) lastFocused.focus();
    }, 380);
  }

  document.querySelectorAll('[data-open-diagnostic]').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      open();
    });
  });

  window.addEventListener('open-diagnostic', open);

  modal.querySelectorAll('[data-close-diagnostic]').forEach((el) =>
    el.addEventListener('click', close)
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
    // Trap focus inside the panel.
    if (e.key === 'Tab' && !modal.hidden && panel) {
      const focusable = panel.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const visible = Array.from(focusable).filter((el) => el.offsetParent !== null);
      if (!visible.length) return;
      const first = visible[0];
      const last = visible[visible.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  /* --- scanning console -------------------------------------------------- */

  function playConsole(url) {
    if (!console_) return;
    const lines = [
      `> Resolving ${url} ...`,
      '> Handshake complete',
      '> Reading document structure',
      '> Mapping form capture points',
      '> WARNING: no auto-responder detected on entry forms',
      '> CRITICAL: manual data re-entry probable',
      '> Calculating friction score ...'
    ];
    console_.textContent = '';
    let i = 0;
    clearInterval(consoleTimer);
    consoleTimer = setInterval(() => {
      if (i >= lines.length) {
        clearInterval(consoleTimer);
        return;
      }
      console_.textContent += (i ? '\n' : '') + lines[i++];
    }, 380);
  }

  /* --- report rendering -------------------------------------------------- */

  function scorecard(label, score) {
    return `
      <div class="scorecard" data-grade="${grade(score)}">
        <span class="scorecard__label">${esc(label)}</span>
        <div class="scorecard__value">${score}</div>
        <div class="scorecard__meter"><div class="scorecard__fill" data-width="${score}"></div></div>
      </div>`;
  }

  function metric(label, value) {
    return `<div><span class="metric__label">${esc(label)}</span><div class="metric__value">${esc(
      value
    )}</div></div>`;
  }

  function renderReport(report) {
    const { scores, metrics, bottlenecks } = report;
    const date = new Date(report.timestamp).toLocaleString();

    const modeNote =
      report.mode === 'live'
        ? 'Live scan — every figure above was read from the document your site actually returned.'
        : report.liveError
        ? `Structural profile — the live scanner could not read this site (${report.liveError}). Figures are modelled from the URL signature, not measured.`
        : 'Structural profile — this deployment has no live scanner connected, so figures are modelled from the URL signature, not measured. A real crawl is part of the full audit.';

    const bottleneckHTML = bottlenecks.length
      ? bottlenecks
          .map(
            (b) => `
        <div class="bottleneck">
          <span class="sev" data-sev="${esc(b.severity)}">${esc(b.severity)} impact</span>
          <div class="bottleneck__title">${esc(b.title)}</div>
          <p class="bottleneck__desc">${esc(b.explanation)}</p>
          <div class="bottleneck__fix"><b>fix &gt;</b> ${esc(b.fix)}</div>
        </div>`
          )
          .join('')
      : '<p class="body body--sm">No structural bottlenecks crossed the reporting threshold.</p>';

    reportSlot.innerHTML = `
      <div class="report__head">
        <div>
          <h3 class="h3">Diagnostic Report</h3>
          <p class="label label--plain label--faint" style="margin-top:.4rem">${esc(report.url)} · ${esc(date)}</p>
        </div>
        <button type="button" class="link" data-rescan>
          New scan <span class="btn__glyph">&#8599;</span>
        </button>
      </div>

      <div class="scorecards">
        ${scorecard('System Structure', scores.uiux)}
        ${scorecard('Load Velocity', scores.performance)}
        ${scorecard('Content Density', scores.contentWeight)}
        ${scorecard('Optimization', scores.seo)}
      </div>

      <div class="metrics">
        ${metric('Load Time', metrics.loadTimeSeconds.toFixed(2) + 's')}
        ${metric('DOM Depth', metrics.domDepth)}
        ${metric('Scripts', metrics.scriptCount)}
        ${metric('Assets', metrics.imageCount + metrics.cssCount)}
        ${metric('Mode', metrics.contentClassification)}
      </div>

      <h4 class="label" style="margin-bottom:.9rem">Detected bottlenecks</h4>
      ${bottleneckHTML}

      <div class="legend">
        <ul>
          <li><b>80–100</b><span>Operating as a system. Minor tuning only.</span></li>
          <li><b>50–79</b><span>Functional, but friction is compounding.</span></li>
          <li><b>0–49</b><span>Structural problem. A human is holding it together.</span></li>
        </ul>
        <p class="label label--plain label--faint" style="margin-top:.9rem;text-transform:none;letter-spacing:0;display:block">${esc(
          modeNote
        )}</p>
      </div>

      <div class="report__foot">
        <p class="label label--plain label--faint" style="margin-bottom:1rem">Ready to remove the friction?</p>
        <a class="btn btn--block" href="/start/">
          Start a project <span class="btn__glyph">&#8599;</span>
        </a>
      </div>`;

    // Animate the meters after paint.
    requestAnimationFrame(() => {
      reportSlot
        .querySelectorAll('.scorecard__fill')
        .forEach((el) => (el.style.width = el.dataset.width + '%'));
    });

    const rescan = reportSlot.querySelector('[data-rescan]');
    if (rescan) rescan.addEventListener('click', () => showStep('input'));
  }

  /* --- submit ------------------------------------------------------------ */

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = normalizeUrl(urlField.value);
      if (!url) return;

      const pain = (form.elements.pain && form.elements.pain.value.trim()) || '';
      const email = (form.elements.email && form.elements.email.value.trim()) || '';

      showStep('scanning');
      playConsole(url);

      try {
        const report = await runAnalysis(url);
        clearInterval(consoleTimer);
        renderReport(report);
        showStep('report');

        /* Keep the report for /start/ to attach, and deliver the lead. */
        try {
          sessionStorage.setItem(
            'lracdim:last-report',
            JSON.stringify({ url: report.url, mode: report.mode, scores: report.scores, timestamp: report.timestamp })
          );
        } catch {}
        postLead('diagnostic', {
          website: url,
          pain,
          email,
          mode: report.mode,
          scores: report.scores,
          bottlenecks: report.bottlenecks.map((b) => b.title)
        });
      } catch (err) {
        clearInterval(consoleTimer);
        reportSlot.innerHTML = `
          <div class="report__head">
            <h3 class="h3">Scan failed</h3>
          </div>
          <p class="body body--sm">${esc(
            err && err.message ? err.message : 'The diagnostic could not complete.'
          )}</p>
          <div class="report__foot">
            <button type="button" class="btn btn--ghost" data-rescan>Try another URL</button>
          </div>`;
        const rescan = reportSlot.querySelector('[data-rescan]');
        if (rescan) rescan.addEventListener('click', () => showStep('input'));
        showStep('report');
      }
    });
  }
}
