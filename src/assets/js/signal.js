/**
 * SIGNAL — monitoring dashboard. Everything rendered here comes from stored
 * checks and events; with no targets or no API the page says so.
 */
import { api, esc, hasApi, relTime } from './api.js';

const STATUS_LABEL = { operational: 'Operational', degraded: 'Degraded', unavailable: 'Unavailable', unknown: 'Not yet checked' };

function chart(events) {
  const pts = events.filter((e) => e.kind === 'check' && e.response_ms != null).slice().reverse();
  if (pts.length < 2) return `<p class="fine-print">${pts.length === 1 ? 'One measurement so far. The chart appears after the next check.' : 'No measurements yet.'}</p>`;
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
    <header><p class="project-type">${esc(t.host)}</p><h3>${detail ? esc(t.name) : `<a href="/signal/site/${esc(t.id)}/">${esc(t.name)}</a>`}</h3></header>
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

function eventList(events, withHost) {
  if (!events.length) return '<p class="fine-print">No events recorded yet.</p>';
  return `<ol class="signal-events">${events.map((e) => `<li data-level="${esc(e.level)}"><time datetime="${esc(e.created_at)}">${esc(new Date(e.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }))}</time><span class="signal-events__kind">${esc(e.kind)}</span><span>${esc(e.message)}</span></li>`).join('')}</ol>`;
}

export async function initSignal() {
  const root = document.querySelector('[data-signal]');
  if (!root) return;
  const board = root.querySelector('[data-signal-board]');
  const feed = root.querySelector('[data-signal-feed]');
  const status = root.querySelector('[data-signal-status]');
  const m = location.pathname.match(/\/signal\/site\/([a-z0-9]+)\/?/i);
  const siteId = (m && m[1]) || new URLSearchParams(location.search).get('id');

  if (!hasApi()) {
    board.innerHTML = '<div class="signal-empty" role="status"><p class="overline">System status</p><h2>Monitoring engine not connected.</h2><p>This deployment has no API configured, so there is no stored data to show. Signal shows only measured checks.</p></div>';
    if (feed) feed.hidden = true;
    return;
  }
  status.textContent = 'Loading stored checks…';
  try {
    if (siteId) {
      const [t, events] = await Promise.all([api(`/api/signal/targets/${siteId}`), api(`/api/signal/targets/${siteId}/events?limit=300`)]);
      board.innerHTML = targetCard(t, true);
      board.querySelector('[data-target-detail]').innerHTML = `<p class="overline" style="margin-top:22px">Response time</p>${chart(events)}<p class="overline" style="margin-top:22px">Events</p>${eventList(events.filter((e) => e.kind !== 'check').slice(0, 50))}<p class="overline" style="margin-top:22px">Recent checks</p>${eventList(events.filter((e) => e.kind === 'check').slice(0, 20))}`;
      status.textContent = `${events.filter((e) => e.kind === 'check').length} stored checks.`;
      if (feed) feed.hidden = true;
      return;
    }
    const targets = await api('/api/signal/targets');
    if (!targets.length) {
      board.innerHTML = '<div class="signal-empty" role="status"><p class="overline">System status</p><h2>No monitoring targets yet.</h2><p>Targets are registered by the site operator through the API. Once the first scheduled check has run, its result appears here: status, response time, SSL, and every event since.</p></div>';
      status.textContent = 'Engine connected. Zero targets.';
    } else {
      board.innerHTML = `<div class="signal-cards">${targets.map((t) => targetCard(t, false)).join('')}</div>`;
      status.textContent = `${targets.length} target${targets.length === 1 ? '' : 's'} · scheduled checks every ${(window.LRACDIM && window.LRACDIM.signalInterval) || 'few'} minutes`;
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
    status.textContent = '';
  }
}
