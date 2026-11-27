/**
 * The full Vector report as an email: HTML for mail clients (tables and
 * inline styles, light background, 600 px) and a plain-text alternative.
 *
 * Everything that came from the examined page or from the visitor is escaped.
 * The email stays well under Gmail's 102 KB clipping limit: at most
 * MAX_ISSUES issues are printed in full, evidence is shortened, and the rest
 * is one click away in the online report.
 */
import { label, verdict } from './report-summary.js';

export const MAX_ISSUES = 25;
const EVIDENCE_MAX = 280;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());

const C = {
  page: '#ecebe6',
  card: '#ffffff',
  ink: '#1d1e22',
  muted: '#62646b',
  line: '#e2e0d9',
  dark: '#1a1c21',
  gold: '#c9a14a',
  goldText: '#8a6a1f',
  sev: { critical: '#b42318', high: '#c2410c', medium: '#a16207', low: '#4b5563' },
  grade: { good: '#1f7a4d', fair: '#a16207', poor: '#b42318' }
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

const gradeOf = (s) => (s >= 80 ? 'good' : s >= 50 ? 'fair' : 'poor');

function dateLabel(iso) {
  const d = new Date(iso || Date.now());
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * @param {object} r
 * @param {string} r.name            requester's name
 * @param {object} r.audit           auditOut() shape
 * @param {Array}  r.results         [{category, score, metrics}]
 * @param {Array}  r.issues          ranked issues with evidence, explanation, recommendation, impact
 * @param {Array}  r.prescription    [{position, severity, action, issue_code}]
 * @param {string} r.summary         plain-English summary
 * @param {string} r.summarySource   'rules' or 'ai:<model>'
 * @param {string} r.reportUrl       link to the full report online
 * @param {number} r.linkDays        how long that link works
 * @param {string} r.unsubscribeUrl  page that stops all email to this address
 * @param {string} r.siteUrl         https://www.lracdimension.online
 * @param {boolean} r.canReply       whether a reply reaches a person
 * @param {string} [r.pdfFilename]   name of the attached PDF, when there is one
 */
export function renderReportEmail(r) {
  const { audit, issues, prescription } = r;
  const finalUrl = audit.summary?.final_url || audit.url;
  let host = finalUrl;
  try {
    host = new URL(finalUrl).hostname;
  } catch {}
  const health = audit.health_score;
  const g = gradeOf(health);
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of issues) if (i.severity in counts) counts[i.severity]++;
  // Only a plain word is used in the greeting, so a "name" cannot put a link or a pitch in the email.
  const word = String(r.name || '').trim().split(/\s+/)[0] || '';
  const first = /^\p{L}[\p{L}\p{M}'’-]{0,39}$/u.test(word) ? word : 'there';
  const when = dateLabel(audit.completed_at);
  const shown = issues.slice(0, MAX_ISSUES);
  const hidden = issues.length - shown.length;
  const titleOf = (code) => (issues.find((i) => i.code === code) || {}).title || code;
  const startUrl = `${r.siteUrl}/#start`;
  const subject = `Your website report: ${host} scored ${health}/100`;
  const preheader = `${host}: ${health}/100, ${issues.length} issue${issues.length === 1 ? '' : 's'} found, fixes in priority order.`;
  const aiNote = String(r.summarySource || '').startsWith('ai:') ? 'Summary written with AI from the measurements in this report.' : '';

  /* ---------------------------------------------------------------- HTML */
  const h2 = (text) => `<h2 style="margin:0 0 14px;font:600 13px/1.4 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:${C.goldText}">${esc(text)}</h2>`;
  const section = (inner) => `<tr><td style="padding:28px 32px;border-top:1px solid ${C.line}">${inner}</td></tr>`;
  const badge = (sev) => `<span style="display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid ${C.sev[sev] || C.muted};color:${C.sev[sev] || C.muted};font:600 11px/1.5 ${MONO};letter-spacing:.06em;text-transform:uppercase">${esc(sev)}</span>`;

  const categoryRows = r.results
    .map((c) => {
      const w = Math.max(2, Math.min(100, c.score));
      return `<tr>
        <td style="padding:7px 12px 7px 0;font:14px/1.4 ${FONT};color:${C.ink};white-space:nowrap">${esc(label(c.category))}</td>
        <td style="padding:7px 0;width:100%"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
          <td width="${w}%" style="height:8px;background:${C.grade[gradeOf(c.score)]};border-radius:4px;font-size:0;line-height:0">&nbsp;</td>
          <td style="height:8px;background:${C.line};font-size:0;line-height:0">&nbsp;</td></tr></table></td>
        <td style="padding:7px 0 7px 12px;font:600 14px/1.4 ${MONO};color:${C.ink};text-align:right">${esc(c.score)}</td></tr>`;
    })
    .join('');

  const fixRows = prescription
    .map(
      (p) => `<tr>
        <td valign="top" style="padding:10px 14px 10px 0;font:600 13px/1.5 ${MONO};color:${C.goldText}">${String(p.position).padStart(2, '0')}</td>
        <td valign="top" style="padding:10px 0;font:15px/1.5 ${FONT};color:${C.ink}"><strong>${esc(p.action)}</strong><br>
          <span style="font-size:13px;color:${C.muted}">${badge(p.severity)}&nbsp; ${esc(titleOf(p.issue_code))}</span></td></tr>`
    )
    .join('');

  const issueBlocks = shown
    .map(
      (i, n) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px;border:1px solid ${C.line};border-left:3px solid ${C.sev[i.severity] || C.muted};border-radius:6px">
        <tr><td style="padding:16px 18px">
          <p style="margin:0 0 6px;font:12px/1.5 ${MONO};color:${C.muted}">${badge(i.severity)}&nbsp; ${esc(label(i.category))} · #${n + 1}</p>
          <p style="margin:0 0 10px;font:600 16px/1.4 ${FONT};color:${C.ink}">${esc(i.title)}</p>
          <p style="margin:0 0 8px;font:14px/1.55 ${FONT};color:${C.ink}"><strong>Evidence:</strong> ${esc(clip(i.evidence, EVIDENCE_MAX))}</p>
          <p style="margin:0 0 8px;font:14px/1.55 ${FONT};color:${C.ink}"><strong>Why it matters:</strong> ${esc(i.explanation)}</p>
          <p style="margin:0 0 8px;font:14px/1.55 ${FONT};color:${C.ink}"><strong>Fix:</strong> ${esc(i.recommendation)}</p>
          ${i.impact ? `<p style="margin:0;font:14px/1.55 ${FONT};color:${C.muted}"><strong>Expected impact:</strong> ${esc(i.impact)}</p>` : ''}
        </td></tr></table>`
    )
    .join('');

  const button = (href, text, dark = true) =>
    `<a href="${esc(href)}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:${dark ? C.dark : '#ffffff'};border:1px solid ${C.dark};color:${dark ? '#f3e2b3' : C.dark};font:600 14px/1 ${FONT};text-decoration:none">${esc(text)}</a>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page}">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};border-collapse:collapse"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.card};border-collapse:collapse;border-radius:10px;overflow:hidden">
  <tr><td style="padding:22px 32px;background:${C.dark}">
    <p style="margin:0;font:600 13px/1.4 ${MONO};letter-spacing:.14em;color:#f3e2b3">LRACDIMENSION</p>
    <p style="margin:4px 0 0;font:13px/1.4 ${FONT};color:#b9bac0">Vector website report</p>
  </td></tr>
  <tr><td style="padding:30px 32px 8px">
    <p style="margin:0 0 14px;font:16px/1.6 ${FONT};color:${C.ink}">Hi ${esc(first)},</p>
    <p style="margin:0 0 6px;font:16px/1.6 ${FONT};color:${C.ink}">Here is the full examination of <strong>${esc(host)}</strong> you asked for, measured on ${esc(when)}.</p>
    ${r.pdfFilename ? `<p style="margin:10px 0 0;font:15px/1.6 ${FONT};color:${C.ink}">The whole report is also attached as a PDF (<span style="font-family:${MONO};font-size:13px">${esc(r.pdfFilename)}</span>), ready to print or forward to whoever looks after the site.</p>` : ''}
  </td></tr>
  <tr><td style="padding:18px 32px 26px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${C.line};border-radius:8px"><tr>
      <td style="padding:20px 22px" valign="middle">
        <p style="margin:0;font:12px/1.4 ${MONO};letter-spacing:.08em;text-transform:uppercase;color:${C.muted}">Website health</p>
        <p style="margin:4px 0 0;font:700 46px/1 ${FONT};color:${C.grade[g]}">${esc(health)}<span style="font:400 18px/1 ${FONT};color:${C.muted}"> / 100</span></p>
        <p style="margin:8px 0 0;font:14px/1.5 ${FONT};color:${C.ink}">${esc(cap(verdict(health).text))}.</p>
      </td>
      <td style="padding:20px 22px;border-left:1px solid ${C.line};white-space:nowrap" valign="middle">
        ${['critical', 'high', 'medium', 'low'].map((s) => `<p style="margin:0 0 4px;font:13px/1.5 ${MONO};color:${C.sev[s]}"><strong>${String(counts[s]).padStart(2, '0')}</strong> ${s}</p>`).join('')}
      </td></tr></table>
  </td></tr>
  ${section(`${h2('In plain English')}<p style="margin:0;font:16px/1.65 ${FONT};color:${C.ink}">${esc(r.summary)}</p>${aiNote ? `<p style="margin:10px 0 0;font:12px/1.5 ${FONT};color:${C.muted}">${esc(aiNote)}</p>` : ''}`)}
  ${section(`${h2('Category scores')}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${categoryRows}</table>`)}
  ${section(`${h2('Fix these first')}${prescription.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${fixRows}</table>` : `<p style="margin:0;font:15px/1.6 ${FONT};color:${C.ink}">Nothing to prescribe: no issue crossed the reporting threshold.</p>`}`)}
  ${section(`${h2(`Every issue found (${issues.length})`)}${issueBlocks || `<p style="margin:0;font:15px/1.6 ${FONT};color:${C.ink}">No issue crossed the reporting threshold in any category.</p>`}${hidden > 0 ? `<p style="margin:6px 0 0;font:14px/1.6 ${FONT};color:${C.muted}">${hidden} more lower-priority issue${hidden === 1 ? '' : 's'} ${hidden === 1 ? 'is' : 'are'} listed in the online report.</p>` : ''}`)}
  ${section(`<p style="margin:0 0 16px;font:15px/1.6 ${FONT};color:${C.ink}">The online report has the raw measurements, the scoring method, and PDF and CSV downloads. The link works for ${esc(r.linkDays)} days.</p>
    <p style="margin:0 0 22px">${button(r.reportUrl, 'Open the full report online')}</p>
    <p style="margin:0 0 6px;font:600 16px/1.5 ${FONT};color:${C.ink}">Want these fixed?</p>
    <p style="margin:0 0 16px;font:15px/1.6 ${FONT};color:${C.ink}">I fix websites and build the automations behind them. ${r.canReply ? 'Reply to this email with a question, or start' : 'Start'} a project and the findings above become the brief.</p>
    <p style="margin:0">${button(startUrl, 'Start a project', false)}</p>
    <p style="margin:22px 0 0;font:15px/1.6 ${FONT};color:${C.ink}">John Carl Dimatulac<br><span style="color:${C.muted}">LRACDIMENSION</span></p>`)}
  <tr><td style="padding:22px 32px;background:#f6f5f1;border-top:1px solid ${C.line}">
    <p style="margin:0 0 8px;font:12px/1.6 ${FONT};color:${C.muted}">How this was measured: Vector reads the live page, its response headers, robots.txt, the sitemap, llms.txt and a sample of links. Each category starts at 100 and loses points per finding by severity; the health score is their weighted mean. Security is a header review, not a vulnerability scan.</p>
    <p style="margin:0;font:12px/1.6 ${FONT};color:${C.muted}">You received this because this address was entered to request a report for ${esc(host)} on <a href="${esc(r.siteUrl)}" style="color:${C.muted}">lracdimension.online</a>. If that was not you, ignore this email; nothing else will be sent. <a href="${esc(r.unsubscribeUrl)}" style="color:${C.muted}">Stop all emails to this address</a>.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  /* ---------------------------------------------------------------- text */
  const rule = '-'.repeat(60);
  const lines = [
    `Hi ${first},`,
    '',
    `Here is the full examination of ${host} you asked for, measured on ${when}.`,
    ...(r.pdfFilename ? ['', `The whole report is also attached as a PDF (${r.pdfFilename}), ready to print or forward.`] : []),
    '',
    `WEBSITE HEALTH: ${health} / 100`,
    `${cap(verdict(health).text)}.`,
    `Issues: ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low`,
    '',
    rule,
    'IN PLAIN ENGLISH',
    r.summary,
    ...(aiNote ? [`(${aiNote})`] : []),
    '',
    rule,
    'CATEGORY SCORES',
    ...r.results.map((c) => `  ${label(c.category).padEnd(15)} ${String(c.score).padStart(3)}`),
    '',
    rule,
    'FIX THESE FIRST',
    ...(prescription.length ? prescription.map((p) => `  ${String(p.position).padStart(2, '0')}. [${p.severity}] ${p.action}\n      ${titleOf(p.issue_code)}`) : ['  Nothing to prescribe.']),
    '',
    rule,
    `EVERY ISSUE FOUND (${issues.length})`,
    ...shown.flatMap((i, n) => [
      '',
      `#${n + 1} [${i.severity}] ${label(i.category)}: ${i.title}`,
      `  Evidence: ${clip(i.evidence, EVIDENCE_MAX)}`,
      `  Why it matters: ${i.explanation}`,
      `  Fix: ${i.recommendation}`,
      ...(i.impact ? [`  Expected impact: ${i.impact}`] : [])
    ]),
    ...(hidden > 0 ? ['', `${hidden} more lower-priority issue(s) are listed in the online report.`] : []),
    '',
    rule,
    `Full report online (works for ${r.linkDays} days):`,
    r.reportUrl,
    '',
    `Want these fixed? ${r.canReply ? 'Reply to this email, or start a project:' : 'Start a project:'}`,
    startUrl,
    '',
    'John Carl Dimatulac',
    'LRACDIMENSION',
    '',
    rule,
    `You received this because this address was entered to request a report for ${host} on lracdimension.online. If that was not you, ignore this email; nothing else will be sent.`,
    `Stop all emails to this address: ${r.unsubscribeUrl}`
  ];

  return { subject, html, text: lines.join('\n') };
}
