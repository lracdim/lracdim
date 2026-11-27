/**
 * The full Vector report as a PDF: attached to the report email, and the
 * "Download PDF" button of the online report.
 *
 * renderReportPdfHtml() builds a self-contained A4 document (no scripts, no
 * external requests, everything escaped). renderReportPdf() prints it with
 * Browser Run's `pdf` Quick Action through the BROWSER binding.
 *
 * Free plan limits (developers.cloudflare.com/browser-run/limits/): 10
 * browser minutes a day and one Quick Action every 10 seconds, so a refusal
 * now and then is expected. A 429 is waited out (Retry-After, at most twice);
 * anything else is reported to the caller, which sends the email without the
 * file. The PDF never blocks a report.
 */
import { label, verdict } from './report-summary.js';

export class PdfError extends Error {
  constructor(reason, status = 0) {
    super(reason);
    this.status = status;
  }
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());
const gradeOf = (s) => (s >= 80 ? 'good' : s >= 50 ? 'fair' : 'poor');
const SEV = ['critical', 'high', 'medium', 'low'];
const EVIDENCE_MAX = 900;
const METRIC_MAX = 300;

const C = {
  ink: '#1d1e22',
  muted: '#5f6168',
  line: '#e2e0d9',
  soft: '#f6f5f1',
  dark: '#1a1c21',
  gold: '#f3e2b3',
  goldText: '#8a6a1f',
  sev: { critical: '#b42318', high: '#c2410c', medium: '#a16207', low: '#4b5563' },
  grade: { good: '#1f7a4d', fair: '#a16207', poor: '#b42318' }
};
// Browser Run has Roboto, Open Sans, DejaVu and Liberation installed; a local Chrome has Segoe UI or Helvetica.
const FONT = "Inter, Roboto, 'Open Sans', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const MONO = "'JetBrains Mono', 'DejaVu Sans Mono', 'Liberation Mono', Consolas, monospace";

export const hostOf = (audit) => {
  try {
    return new URL(audit.summary?.final_url || audit.url).hostname;
  } catch {
    return String(audit.url || 'website');
  }
};

const dateLabel = (iso) => new Date(iso || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** vector-report-example.com-2026-11-27.pdf */
export function pdfFilename(audit) {
  const day = String(audit.completed_at || new Date().toISOString()).slice(0, 10);
  const host = hostOf(audit).replace(/[^a-z0-9.-]/gi, '');
  return `vector-report-${host || 'website'}-${day}.pdf`;
}

function metricText(v) {
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' && x ? JSON.stringify(x) : String(x))).join(', ') : '—';
  if (v && typeof v === 'object') return JSON.stringify(v);
  return v === null || v === undefined || v === '' ? '—' : String(v);
}

/**
 * @param {object} r
 * @param {string} r.name, r.company      who asked (optional)
 * @param {object} r.audit                auditOut() shape
 * @param {Array}  r.results, r.issues, r.prescription
 * @param {string} r.summary, r.summarySource
 * @param {string} r.methodology
 * @param {string} r.siteUrl              https://www.lracdimension.online
 * @param {string} r.contactEmail         where questions about the report go
 */
export function renderReportPdfHtml(r) {
  const { audit, issues, prescription } = r;
  const host = hostOf(audit);
  const finalUrl = audit.summary?.final_url || audit.url;
  const health = audit.health_score;
  const g = gradeOf(health);
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of issues) if (i.severity in counts) counts[i.severity]++;
  const when = dateLabel(audit.completed_at);
  const titleOf = (code) => (issues.find((i) => i.code === code) || {}).title || code;
  const preparedFor = [r.name, r.company].filter(Boolean).map((s) => clip(s, 120)).join(', ');
  const aiNote = String(r.summarySource || '').startsWith('ai:') ? 'Summary written with AI from the measurements in this report.' : '';
  const summaryUrl = `${r.siteUrl}/vector/audit/${encodeURIComponent(audit.id)}/`;
  const facts = [`Measured ${when}`, audit.summary?.status ? `HTTP ${audit.summary.status}` : '', audit.summary?.response_ms ? `${audit.summary.response_ms} ms to first document` : '']
    .filter(Boolean)
    .join(' · ');
  const badge = (sev) => `<span class="badge" style="color:${C.sev[sev] || C.muted};border-color:${C.sev[sev] || C.muted}">${esc(sev)}</span>`;

  const categories = r.results
    .map((c) => {
      const w = Math.max(1.5, Math.min(100, Number(c.score) || 0));
      return `<tr><th>${esc(label(c.category))}</th><td class="bar"><div class="track"><div class="fill" style="width:${w}%;background:${C.grade[gradeOf(c.score)]}"></div></div></td><td class="num">${esc(c.score)}</td></tr>`;
    })
    .join('');

  const fixes = prescription.length
    ? `<ol class="fixes">${prescription
        .map((p) => `<li><span class="pos">${String(p.position).padStart(2, '0')}</span><div><p class="act">${esc(p.action)}</p><p class="sub">${badge(p.severity)} ${esc(p.title || titleOf(p.issue_code))}</p></div></li>`)
        .join('')}</ol>`
    : '<p>Nothing to prescribe: no issue crossed the reporting threshold.</p>';

  const issueCards = issues.length
    ? issues
        .map(
          (i, n) => `<article class="issue" style="border-left-color:${C.sev[i.severity] || C.muted}">
        <p class="meta">${badge(i.severity)} ${esc(label(i.category))} · #${n + 1}</p>
        <h3>${esc(i.title)}</h3>
        <dl>
          <dt>Evidence</dt><dd class="evidence">${esc(clip(i.evidence, EVIDENCE_MAX)) || '—'}</dd>
          <dt>Why it matters</dt><dd>${esc(i.explanation)}</dd>
          <dt>Fix</dt><dd>${esc(i.recommendation)}</dd>
          ${i.impact ? `<dt>Expected impact</dt><dd>${esc(i.impact)}</dd>` : ''}
        </dl>
      </article>`
        )
        .join('')
    : '<p>No issue crossed the reporting threshold in any category.</p>';

  const measurements = r.results
    .map((c) => {
      const entries = Object.entries(c.metrics || {});
      if (!entries.length) return '';
      return `<div class="mgroup"><h3>${esc(label(c.category))}</h3><dl>${entries
        .map(([k, v]) => `<dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${esc(clip(metricText(v), METRIC_MAX))}</dd>`)
        .join('')}</dl></div>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Vector report: ${esc(host)}</title>
<style>
  @page { size: A4; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html { font: 9.6pt/1.5 ${FONT}; color: ${C.ink}; }
  body { margin: 0; }
  h1, h2, h3, p, dl, dd, ol { margin: 0; padding: 0; }
  a { color: inherit; }
  .cover { background: ${C.dark}; color: #e9e9ec; border-radius: 8px; padding: 18px 22px 20px; }
  .brand { display: flex; justify-content: space-between; font: 600 8pt/1.4 ${MONO}; letter-spacing: .14em; color: ${C.gold}; }
  .brand span:last-child { color: #b9bac0; letter-spacing: .06em; font-weight: 400; }
  .cover h1 { margin-top: 14px; font: 700 21pt/1.15 ${FONT}; color: #ffffff; word-break: break-all; }
  .cover .url { margin-top: 4px; font: 8.5pt/1.4 ${MONO}; color: #b9bac0; word-break: break-all; }
  .cover .facts { margin-top: 10px; font-size: 8.5pt; color: #cfd0d4; }
  .cover .for { margin-top: 2px; font-size: 8.5pt; color: #cfd0d4; }
  .score { display: flex; margin-top: 14px; border: 1px solid ${C.line}; border-radius: 8px; }
  .score > div { padding: 14px 18px; }
  .score .main { flex: 1; }
  .score .counts { border-left: 1px solid ${C.line}; min-width: 150px; font: 8.5pt/1.7 ${MONO}; }
  .kicker { font: 600 7.5pt/1.4 ${MONO}; letter-spacing: .1em; text-transform: uppercase; color: ${C.muted}; }
  .big { margin-top: 2px; font: 700 34pt/1 ${FONT}; }
  .big span { font: 400 13pt/1 ${FONT}; color: ${C.muted}; }
  .verdict { margin-top: 6px; }
  section { margin-top: 20px; }
  h2 { font: 600 8.5pt/1.4 ${MONO}; letter-spacing: .1em; text-transform: uppercase; color: ${C.goldText}; padding-bottom: 6px; margin-bottom: 10px; border-bottom: 1px solid ${C.line}; break-after: avoid; page-break-after: avoid; }
  .summary { font-size: 10.5pt; line-height: 1.6; }
  .note { margin-top: 6px; font-size: 8pt; color: ${C.muted}; }
  table.cats { width: 100%; border-collapse: collapse; }
  table.cats th { text-align: left; font-weight: 400; padding: 4px 12px 4px 0; white-space: nowrap; width: 1%; }
  table.cats td.bar { width: 100%; padding: 4px 0; }
  .track { height: 7px; background: ${C.line}; border-radius: 4px; overflow: hidden; }
  .fill { height: 7px; border-radius: 4px; }
  table.cats td.num { padding: 4px 0 4px 12px; text-align: right; font: 600 9pt/1.4 ${MONO}; }
  .fixes { list-style: none; }
  .fixes li { display: flex; gap: 12px; padding: 7px 0; border-bottom: 1px solid ${C.line}; break-inside: avoid; page-break-inside: avoid; }
  .fixes li:last-child { border-bottom: 0; }
  .pos { font: 600 9pt/1.5 ${MONO}; color: ${C.goldText}; min-width: 18px; }
  .act { font-weight: 600; }
  .sub { margin-top: 2px; font-size: 8.5pt; color: ${C.muted}; }
  .badge { display: inline-block; padding: 0 6px; border: 1px solid; border-radius: 999px; font: 600 7pt/1.6 ${MONO}; letter-spacing: .06em; text-transform: uppercase; }
  .issue { border: 1px solid ${C.line}; border-left: 3px solid ${C.muted}; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; break-inside: avoid; page-break-inside: avoid; }
  .issue .meta { font: 8pt/1.5 ${MONO}; color: ${C.muted}; }
  .issue h3 { margin: 3px 0 6px; font: 600 11pt/1.35 ${FONT}; }
  .issue dl { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 3px 10px; }
  .issue dt { font-weight: 600; font-size: 8.5pt; color: ${C.muted}; }
  .issue dd { font-size: 9pt; }
  .issue dd.evidence { font-family: ${MONO}; font-size: 8pt; overflow-wrap: anywhere; }
  .mgroup { margin-bottom: 10px; break-inside: avoid; page-break-inside: avoid; }
  .mgroup h3 { font: 600 9pt/1.4 ${FONT}; margin-bottom: 3px; }
  .mgroup dl { display: grid; grid-template-columns: 32% minmax(0, 1fr); gap: 1px 10px; font-size: 8pt; }
  .mgroup dt { color: ${C.muted}; }
  .mgroup dd { font-family: ${MONO}; font-size: 7.5pt; overflow-wrap: anywhere; }
  pre.method { white-space: pre-wrap; font: 7.8pt/1.5 ${MONO}; color: ${C.ink}; background: ${C.soft}; border: 1px solid ${C.line}; border-radius: 6px; padding: 10px 12px; margin: 0; }
  .cta { background: ${C.soft}; border: 1px solid ${C.line}; border-radius: 8px; padding: 14px 18px; break-inside: avoid; page-break-inside: avoid; }
  .cta h2 { border: 0; padding: 0; margin-bottom: 6px; }
  .cta p + p { margin-top: 6px; }
  .fine { font-size: 8pt; color: ${C.muted}; }
</style></head>
<body>
  <header class="cover">
    <p class="brand"><span>LRACDIMENSION</span><span>Vector website report</span></p>
    <h1>${esc(host)}</h1>
    <p class="url">${esc(finalUrl)}</p>
    <p class="facts">${esc(facts)}</p>
    ${preparedFor ? `<p class="for">Prepared for ${esc(preparedFor)}</p>` : ''}
  </header>

  <div class="score">
    <div class="main">
      <p class="kicker">Website health</p>
      <p class="big" style="color:${C.grade[g]}">${esc(health)}<span> / 100</span></p>
      <p class="verdict">${esc(cap(verdict(health).text))}.</p>
    </div>
    <div class="counts">
      <p class="kicker">Issues found: ${issues.length}</p>
      ${SEV.map((s) => `<p style="color:${C.sev[s]}"><strong>${String(counts[s]).padStart(2, '0')}</strong> ${s}</p>`).join('')}
    </div>
  </div>

  <section><h2>In plain English</h2><p class="summary">${esc(r.summary)}</p>${aiNote ? `<p class="note">${esc(aiNote)}</p>` : ''}</section>
  <section><h2>Category scores</h2><table class="cats">${categories}</table></section>
  <section><h2>Fix these first</h2>${fixes}</section>
  <section><h2>Every issue found (${issues.length})</h2>${issueCards}</section>
  ${measurements ? `<section><h2>Raw measurements</h2>${measurements}</section>` : ''}
  <section><h2>How this was measured</h2>
    <p style="margin-bottom:8px">Vector reads the live page, its response headers, robots.txt, the sitemap, llms.txt and a sample of links. Security is a header review, not a vulnerability scan. AI visibility reports whether AI crawlers can read the site, not whether any AI answer mentions it.</p>
    ${r.methodology ? `<pre class="method">${esc(r.methodology)}</pre>` : ''}
  </section>
  <section class="cta">
    <h2>Want these fixed?</h2>
    <p>I fix websites and build the automations behind them. Send the findings above as your brief: start a project at <a href="${esc(r.siteUrl)}/#start">${esc(r.siteUrl.replace(/^https?:\/\//, ''))}/#start</a>${r.contactEmail ? ` or email <a href="mailto:${esc(r.contactEmail)}">${esc(r.contactEmail)}</a>` : ''}.</p>
    <p>John Carl Dimatulac · LRACDIMENSION</p>
    <p class="fine">Public summary of this examination: <a href="${esc(summaryUrl)}">${esc(summaryUrl)}</a></p>
  </section>
</body></html>`;
}

const footerTemplate = (host, when) =>
  `<div style="width:100%;padding:0 15mm;font:7pt Arial,sans-serif;color:#7a7c82;display:flex;justify-content:space-between">` +
  `<span>${esc(host)} · Vector website report · ${esc(when)}</span>` +
  `<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Whether PDFs can be made here: the BROWSER binding exists and REPORT_PDF is not off. */
export const pdfEnabled = (env) =>
  !!(env.BROWSER && typeof env.BROWSER.quickAction === 'function') && !['0', 'false', 'off', 'no'].includes(String(env.REPORT_PDF || '').toLowerCase());

/**
 * Prints the report to PDF. Returns {bytes: Uint8Array, ms}. Throws PdfError.
 * `tries` covers 429s only (the 10-second Quick Action spacing).
 */
export async function renderReportPdf(env, r, { tries = 3 } = {}) {
  if (!pdfEnabled(env)) throw new PdfError('PDF rendering is off (no BROWSER binding or REPORT_PDF=off)');
  const html = renderReportPdfHtml(r);
  const options = {
    html,
    gotoOptions: { waitUntil: 'load', timeout: 20_000 },
    pdfOptions: {
      format: 'a4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footerTemplate(hostOf(r.audit), dateLabel(r.audit.completed_at)),
      margin: { top: '15mm', bottom: '16mm', left: '15mm', right: '15mm' }
    }
  };
  // REPORT_PDF_RETRY_MS overrides the wait after a 429 (tests set it to 0).
  const fixedWait = env.REPORT_PDF_RETRY_MS !== undefined && env.REPORT_PDF_RETRY_MS !== '' ? Math.max(0, Number(env.REPORT_PDF_RETRY_MS) || 0) : null;
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    let out;
    try {
      out = await env.BROWSER.quickAction('pdf', options);
    } catch (err) {
      const msg = String((err && err.message) || err);
      if (/429|rate|limit/i.test(msg) && attempt < tries) {
        await sleep(fixedWait ?? 11_000);
        continue;
      }
      throw new PdfError(`browser: ${msg.slice(0, 200)}`);
    }
    if (out instanceof Response) {
      if (out.status === 429 && attempt < tries) {
        const wait = Math.min(20, Math.max(1, parseInt(out.headers.get('Retry-After'), 10) || 11));
        await sleep(fixedWait ?? wait * 1000);
        continue;
      }
      if (!out.ok) {
        let detail = '';
        try {
          detail = (await out.text()).slice(0, 200);
        } catch {}
        throw new PdfError(`browser returned ${out.status}${detail ? `: ${detail}` : ''}`, out.status);
      }
      const bytes = new Uint8Array(await out.arrayBuffer());
      return checked(bytes, started);
    }
    if (out instanceof ArrayBuffer) return checked(new Uint8Array(out), started);
    if (ArrayBuffer.isView(out)) return checked(new Uint8Array(out.buffer, out.byteOffset, out.byteLength), started);
    throw new PdfError('browser returned an unexpected value');
  }
}

function checked(bytes, started) {
  // "%PDF-" — anything else is an error page, not a report.
  if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new PdfError('browser returned something that is not a PDF');
  return { bytes, ms: Date.now() - started };
}

export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
