/**
 * SIGNAL — public domain scan plus the monitoring dashboard. Everything
 * rendered here is a stored measurement; with no API the page says so.
 */
import { api, esc, hasApi, relTime } from './api.js';

const STATUS_LABEL = { operational: 'Operational', degraded: 'Degraded', unavailable: 'Unavailable', unknown: 'Not yet checked' };
const grade = (s) => (s >= 80 ? 'good' : s >= 50 ? 'warn' : 'bad');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function chart(events) {
  const pts = events.filter((e) => e.kind === 'check' && e.response_ms != null).slice().reverse();
  if (pts.length < 2) return `<p class="fine-print">${pts.length === 1 ? 'One measurement so far. The chart appears after the next scheduled check.' : 'No measurements yet.'}</p>`;
  const w = 720, h = 160, pad = 28;
  const max = Math.max(...pts.map((p) => p.response_ms), 100);
  const x = (i) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const y = (v) => h - pad - (v / max) * (h - pad * 2);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.response_ms).toFixed(1)}`).join(' ');
  const fails = pts.map((p, i) => (p.status_code == null || p.status_code >= 500 ? `<circle cx="${x(i).toFixed(1)}" cy="${y(p.response_ms).toFixed(1)}" r="3.5" class="signal-chart__fail"><title>${esc(p.message)}</title></circle>` : '')).join('');
  const first = pts[0], last = pts[pts.length - 1];
  return `<svg class="signal-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Response time over ${pts.length} checks, from ${esc(new Date(first.created_at).toLocaleString())} to ${esc(new Date(last.created_at).toLocaleString())}, maximum ${max} ms">
    <line x1="${pad}" y1="${y(0)}" x2="${w - pad}" y2="${y(0)}" class="signal-chart__axis"/>
    <text x="${pad}" y="${pad - 10}" class="signal-chart__label">${max} ms</text><text x="${pad}" y="${h - 8}" class="signal-chart__label">0 ms</text>
    <text x="${w - pad}" y="${h - 8}" class="signal-chart__label" text-anchor="end">${pts.length} checks</text>
    <path d="${path}" class="signal-chart__line"/>${fails}</svg>`;
}

function targetCard(t, detail) {
  const ssl = t.ssl_valid === 1 ? `Valid${t.ssl_expires_at ? `, expires ${new Date(t.ssl_expires_at).toLocaleDateString()}` : ''}` : t.ssl_valid === 0 ? 'Check failed' : 'Not measured';
  return `<article class="signal-card" data-status="${esc(t.status)}">
    <header><p class="project-type">${esc(t.host)}${t.source === 'public' ? ' / public scan' : ''}</p><h3>${detail ? esc(t.name) : `<a href="/signal/site/${esc(t.id)}/">${esc(t.name)}</a>`}</h3></header>
    <dl class="signal-grid">
      <div><dt>Website</dt><dd><span class="dim-status" data-status="${esc(t.status)}"><span></span>${esc(STATUS_LABEL[t.status] || t.status)}</span></dd></div>
      <div><dt>Response</dt><dd>${t.last_response_ms != null ? `${t.last_response_ms} ms` : 'Not measured'}</dd></div>
      <div><dt>HTTP</dt><dd>${t.last_status_code != null ? t.last_status_code : '—'}</dd></div>
      <div><dt>SSL</dt><dd>${esc(ssl)}</dd></div>
      <div><dt>Last check</dt><dd>${esc(relTime(t.last_checked_at))}</dd></div>
    </dl>
    <div data-target-detail="${esc(t.id)}"></div>
  </article>`;
}

function eventList(events) {
  if (!events.length) return '<p class="fine-print">No events recorded yet.</p>';
  return `<ol class="signal-events">${events.map((e) => `<li data-level="${esc(e.level)}"><time datetime="${esc(e.created_at)}">${esc(new Date(e.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }))}</time><span class="signal-events__kind">${esc(e.kind)}</span><span>${esc(e.message)}</span></li>`).join('')}</ol>`;
}

function snapshotBlock(s, measuredAt) {
  const rows = [['SEO', s.scores.seo], ['Technical', s.scores.technical], ['Performance', s.scores.performance], ['Content', s.scores.content], ['Analytics', s.analytics_score]];
  const seoRows = [['Indexable', s.seo.indexable ? 'yes' : 'no (noindex, robots block, or error status)'], ['Title', s.seo.title ? `${esc(s.seo.title)} <span class="fine-print">${s.seo.title_length} chars</span>` : '(missing)'], ['Meta description', s.seo.description_length ? `${s.seo.description_length} chars` : '(missing)'], ['Canonical', s.seo.canonical ? esc(s.seo.canonical) : '(missing)'], ['robots.txt', esc(s.seo.robots_txt || 'not checked')], ['Sitemap', esc(s.seo.sitemap || 'not checked')], ['Open Graph tags', (s.seo.open_graph || []).length], ['Images missing alt', s.seo.images_missing_alt ?? 0]];
  const techRows = [['HTTP status', s.technical.status], ['HTTPS', s.technical.https ? 'yes' : 'no'], ['Redirects', s.technical.redirects], ['Viewport meta', s.technical.viewport ? 'yes' : 'no'], ['Language', esc(s.technical.lang || '(none)')], ['H1 count', s.technical.h1_count], ['Response', `${s.performance.response_ms} ms`], ['Document', `${Number(s.performance.document_bytes).toLocaleString()} bytes, ${s.performance.compressed ? 'compressed' : 'uncompressed'}`], ['Scripts / images', `${s.performance.scripts} / ${s.performance.images}`]];
  return `
    <p class="overline">Snapshot · ${esc(new Date(measuredAt).toLocaleString())}</p>
    <table class="vector-table"><caption class="overline">Scores</caption><tbody>${rows.map(([l, v]) => `<tr data-grade="${grade(v)}"><th scope="row">${l}</th><td>${v}</td><td><div class="scorecard__meter"><div class="scorecard__fill" style="width:${v}%"></div></div></td></tr>`).join('')}</tbody></table>
    <div class="signal-two">
      <div><table class="forge-table"><caption class="overline">SEO signals</caption><tbody>${seoRows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('')}</tbody></table></div>
      <div><table class="forge-table"><caption class="overline">Technical and performance</caption><tbody>${techRows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('')}</tbody></table></div>
    </div>
    <p class="overline" style="margin-top:22px">Analytics tools detected</p>
    ${s.analytics.length ? `<ul class="tech-list" style="margin-top:10px">${s.analytics.map((a) => `<li style="list-style:none"><span>${esc(a)}</span></li>`).join('')}</ul>` : '<p class="fine-print">None detected in the page markup. Either no analytics is installed, or it loads in a way this scan does not see (tag manager server-side, consent-gated).</p>'}
    ${s.top_findings.length ? `<p class="overline" style="margin-top:22px">Findings</p><ol class="vector-rx">${s.top_findings.map((f, i) => `<li><span class="project-type">${String(i + 1).padStart(2, '0')} — ${esc(cap(f.severity))} · ${esc(f.category)}</span><strong>${esc(f.recommendation)}</strong><span>${esc(f.title)}</span></li>`).join('')}</ol>` : ''}
    <p class="fine-print vector-mode">${esc(s.note)}</p>`;
}

export async function initSignal() {
  const root = document.querySelector('[data-signal]');
  if (!root) return;
  const board = root.querySelector('[data-signal-board]');
  const feed = root.querySelector('[data-signal-feed]');
  const status = root.querySelector('[data-signal-status]');
  const form = root.querySelector('[data-signal-form]');
  const m = location.pathname.match(/\/signal\/site\/([a-z0-9]+)\/?/i);
  const siteId = (m && m[1]) || new URLSearchParams(location.search).get('id');

  if (!hasApi()) {
    if (form) {
      form.querySelector('[data-signal-submit]').disabled = true;
      form.querySelector('[data-signal-modenote]').textContent = 'The monitoring engine is not connected on this deployment, so domains cannot be measured here.';
    }
    board.innerHTML = '<div class="signal-empty" role="status"><p class="overline">System status</p><h2>Monitoring engine not connected.</h2><p>This deployment has no API configured, so there is no stored data to show. Signal shows only measured checks.</p></div>';
    if (feed) feed.hidden = true;
    return;
  }

  /* ---- public scan form -------------------------------------------------- */
  if (form) {
    const input = form.querySelector('#signal-url');
    const submit = form.querySelector('[data-signal-submit]');
    const error = form.querySelector('[data-signal-error]');
    const states = { scanning: root.querySelector('[data-signal-state="scanning"]'), failed: root.querySelector('[data-signal-state="failed"]'), result: root.querySelector('[data-signal-state="result"]') };
    const resultEl = root.querySelector('[data-signal-result]');
    const reason = root.querySelector('[data-signal-reason]');
    const show = (name) => Object.entries(states).forEach(([k, el]) => (el.hidden = k !== name));
    const idle = () => {
      show(null);
      submit.disabled = false;
      submit.textContent = 'Measure ↗';
      input.focus();
    };
    root.querySelectorAll('[data-signal-reset]').forEach((b) => b.addEventListener('click', idle));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      error.textContent = '';
      const url = input.value.trim();
      if (!url || !/\./.test(url) || /localhost|127\.|192\.168\.|10\./.test(url)) {
        error.textContent = 'Enter a public domain, for example company.com.';
        return input.focus();
      }
      submit.disabled = true;
      submit.textContent = 'Measuring…';
      show('scanning');
      try {
        const res = await api('/api/signal/scan', { method: 'POST', body: { url }, timeout: 45000 });
        const t = res.target;
        resultEl.innerHTML = `
          <div class="vector-report__head"><div><p class="overline">Measured · ${esc(t ? t.host : url)}</p><h2 class="vector-report__url">${esc(res.snapshot.final_url)}</h2><p class="fine-print">${t && res.persisted ? `Registered for scheduled checks. History and events at <a class="text-link text-link--inline" href="/signal/site/${esc(t.id)}/">/signal/site/${esc(t.id)}/</a>.` : 'The public monitoring cap is reached, so this domain was measured but not registered.'}</p></div><button type="button" class="text-link" data-signal-reset>Measure another ↗</button></div>
          ${t ? targetCard(t, true) : ''}
          ${snapshotBlock(res.snapshot, res.snapshot.measured_at)}
          <div class="actions"><a class="btn" href="/vector/?url=${encodeURIComponent(res.snapshot.final_url)}">Full examination in Vector ↗</a><a class="text-link" href="/start/">Fix it with me ↗</a></div>`;
        resultEl.querySelectorAll('[data-signal-reset]').forEach((b) => b.addEventListener('click', idle));
        show('result');
        submit.disabled = false;
        submit.textContent = 'Measure ↗';
        states.result.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } catch (err) {
        if (err.code === 'invalid_url' || err.code === 'validation') {
          error.textContent = err.message;
          return idle();
        }
        reason.textContent = err.message;
        show('failed');
        submit.disabled = false;
        submit.textContent = 'Measure ↗';
      }
    });
    const preset = new URLSearchParams(location.search).get('url');
    if (preset) {
      input.value = preset;
      form.requestSubmit();
    }
  }

  /* ---- dashboard / target page ------------------------------------------ */
  if (status) status.textContent = 'Loading stored checks…';
  try {
    if (siteId) {
      const [t, events] = await Promise.all([api(`/api/signal/targets/${siteId}`), api(`/api/signal/targets/${siteId}/events?limit=300`)]);
      let snap = null;
      try {
        snap = await api(`/api/signal/targets/${siteId}/snapshot`);
      } catch {}
      board.innerHTML = targetCard(t, true);
      board.querySelector('[data-target-detail]').innerHTML = `<p class="overline" style="margin-top:22px">Response time</p>${chart(events)}${snap && snap.data ? `<div style="margin-top:26px">${snapshotBlock(snap.data, snap.created_at)}</div>` : ''}<p class="overline" style="margin-top:22px">Events</p>${eventList(events.filter((e) => !['check', 'snapshot'].includes(e.kind)).slice(0, 50))}<p class="overline" style="margin-top:22px">Recent checks</p>${eventList(events.filter((e) => e.kind === 'check').slice(0, 20))}`;
      if (status) status.textContent = `${events.filter((e) => e.kind === 'check').length} stored checks.`;
      if (feed) feed.hidden = true;
      return;
    }
    const targets = await api('/api/signal/targets');
    if (!targets.length) {
      board.innerHTML = '<div class="signal-empty" role="status"><p class="overline">System status</p><h2>No operator targets yet.</h2><p>Targets registered by the operator appear here with their status, response time, SSL, and events. Domains you measure above are registered too and reachable by their own link.</p></div>';
      if (status) status.textContent = '';
    } else {
      board.innerHTML = `<div class="signal-cards">${targets.map((t) => targetCard(t, false)).join('')}</div>`;
      if (status) status.textContent = `${targets.length} target${targets.length === 1 ? '' : 's'}`;
      for (const t of targets) {
        try {
          const events = await api(`/api/signal/targets/${t.id}/events?kind=check&limit=120`);
          board.querySelector(`[data-target-detail="${t.id}"]`).innerHTML = `<p class="overline" style="margin-top:18px">Response time</p>${chart(events)}`;
        } catch {}
      }
    }
    if (feed) {
      const events = await api('/api/signal/events?limit=40');
      feed.querySelector('[data-signal-events]').innerHTML = eventList(events);
    }
  } catch (e) {
    board.innerHTML = `<div class="signal-empty" role="alert"><p class="overline">Signal unavailable</p><h2>The monitoring engine could not be reached.</h2><p>${esc(e.message)}</p></div>`;
    if (status) status.textContent = '';
  }
}
