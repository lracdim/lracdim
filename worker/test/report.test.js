/**
 * Gated reports: the request form, delivery (inline and as a Workflow), the
 * emailed report, the report link, unsubscribe, Resend webhooks, limits,
 * Turnstile, the admin endpoints and the cron backstop.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { setup, SITE } from './helpers.js';
import { ReportDeliveryWorkflow } from '../src/workflow.js';
import { reportMaintenance } from '../src/report-delivery.js';
import { renderReportEmail, MAX_ISSUES } from '../src/report-email.js';
import { rulesSummary, sanitizeSummary, summaryFacts } from '../src/report-summary.js';
import { maskEmail, readUnsubscribeToken, unsubscribeToken } from '../src/secure.js';

let h;
beforeEach(() => {
  h = setup();
  // The weekly limits are off here so tests can ask twice; their own test turns them on.
  Object.assign(h.env, { REPORT_INLINE_RETRY_MS: '0', API_URL: 'https://api.example', REPORT_EMAIL_COOLDOWN_DAYS: '0', REPORT_SITE_COOLDOWN_DAYS: '0', REPORT_PDF_RETRY_MS: '0' });
});
afterEach(() => h.restore());

const CATS = ['technical', 'seo', 'performance', 'accessibility', 'security', 'links', 'content', 'ai'];
const SCORES = { technical: 92, seo: 70, performance: 84, accessibility: 97, security: 55, links: 100, content: 100, ai: 100 };
const ISSUE = (category, code, severity, title, evidence = 'Seen on the page.') => ({
  category,
  code,
  severity,
  title,
  evidence,
  explanation: `Why ${code} matters.`,
  recommendation: `Fix ${code} like this.`,
  impact: `Impact of fixing ${code}.`
});
const ISSUES = [
  ISSUE('security', 'no_hsts', 'high', 'No HSTS header', 'Header absent. <script>alert(1)</script> "quoted"'),
  ISSUE('seo', 'no_description', 'high', 'Missing meta description'),
  ISSUE('security', 'no_csp', 'medium', 'No Content-Security-Policy'),
  ISSUE('seo', 'short_title', 'medium', 'Title is very short'),
  ISSUE('accessibility', 'missing_alt', 'low', 'Images without alt text')
];

function seedAudit(id = 'a1', { host = 'example.com', status = 'completed', issues = ISSUES } = {}) {
  const now = new Date().toISOString();
  h.env.DB.raw.prepare('INSERT OR IGNORE INTO websites (id, host, url, created_at) VALUES (?, ?, ?, ?)').run(`w-${host}`, host, `https://${host}/`, now);
  h.env.DB.raw
    .prepare(
      'INSERT INTO audits (id, website_id, url, status, stage, stages, health_score, scores, summary, results, issues, prescription, created_at, completed_at) ' +
        "VALUES (?, ?, ?, ?, 'report', '[]', 72, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      id,
      `w-${host}`,
      `https://${host}/`,
      status,
      JSON.stringify(SCORES),
      JSON.stringify({ final_url: `https://${host}/`, status: 200, response_ms: 120 }),
      JSON.stringify(CATS.map((c) => ({ category: c, score: SCORES[c], metrics: { note: 'measured' } }))),
      JSON.stringify(issues),
      JSON.stringify(issues.map((i, n) => ({ position: n + 1, severity: i.severity, action: i.recommendation, issue_code: i.code }))),
      now,
      now
    );
}

const FORM = { name: 'Jane Doe', email: 'Jane@Example.com', company: 'Acme', note: 'Leads drop off at the form', consent: true, source: 'vector' };
const ask = (auditId = 'a1', body = {}, opts = {}) => h.call(`/api/vector/audits/${auditId}/report-requests`, { method: 'POST', body: { ...FORM, ...body }, ...opts });
const resendCalls = () => h.outbound().filter((c) => c.url === 'https://api.resend.com/emails');
const reportMail = () => resendCalls().filter((c) => c.body.html);
const ownerMail = () => resendCalls().filter((c) => !c.body.html);
const request = (id) => h.env.DB.raw.prepare('SELECT * FROM report_requests WHERE id = ?').get(id);
const events = (id) => h.env.DB.raw.prepare('SELECT kind FROM report_events WHERE request_id = ? ORDER BY id').all(id).map((e) => e.kind);
const tokenIn = (mail) => /\/vector\/report\/#t=([A-Za-z0-9_-]+)/.exec(mail.body.text)[1];
const live = () =>
  Object.assign(h.env, {
    RESEND_API_KEY: 're_test',
    NOTIFY_EMAIL: 'owner@example.com',
    RESEND_FROM: 'LRACDIMENSION <hello@lracdimension.online>',
    REPORT_FROM: 'John Carl Dimatulac <john@lracdimension.online>'
  });
// What Browser Run's pdf Quick Action answers: the bytes of a PDF.
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n% test document\n%%EOF\n');
const browser = (answer = () => new Response(PDF_BYTES, { headers: { 'Content-Type': 'application/pdf' } })) => {
  const calls = [];
  h.env.BROWSER = {
    quickAction: async (action, options) => {
      calls.push({ action, options });
      return answer(calls.length);
    }
  };
  return calls;
};

// ------------------------------------------------------------ the request

test('the form is validated field by field, in form order', async () => {
  seedAudit();
  const res = await ask('a1', { name: 'J', email: 'not-an-email', consent: false });
  assert.equal(res.status, 422);
  const { error } = await res.json();
  assert.deepEqual(error.fields.map((f) => f.field), ['name', 'email', 'consent']);
  const linky = await (await ask('a1', { name: 'Visit www.spam.example now' })).json();
  assert.deepEqual(linky.error.fields.map((f) => f.field), ['name']);
  assert.equal(h.rows('report_requests').length, 0);
});

test('unknown and unfinished examinations cannot be requested', async () => {
  assert.equal((await ask('nope')).status, 404);
  seedAudit('a2', { status: 'running' });
  assert.equal((await ask('a2')).status, 409);
});

test('a request is stored, delivered inline, and the full report reaches the requester', async () => {
  seedAudit();
  live();
  const res = await ask();
  assert.equal(res.status, 202);
  const out = await res.json();
  assert.match(out.id, /^[0-9a-f]{32}$/);
  assert.equal(out.status, 'queued');
  assert.equal(out.email_masked, 'j***@example.com');

  const row = request(out.id);
  assert.equal(row.status, 'sent');
  assert.equal(row.email, 'jane@example.com');
  assert.match(row.email_hash, /^[0-9a-f]{40}$/);
  assert.match(row.ip_key, /^[0-9a-f]{32}$/);
  assert.equal(row.consent_version, '2026-11-27');
  assert.equal(row.summary_source, 'rules');
  assert.equal(row.email_id, 'email_123');
  assert.equal(row.attempts, 1);
  assert.equal(row.owner_notified, 1);
  assert.deepEqual(events(out.id), ['requested', 'dispatched', 'processing', 'summarized', 'sent', 'owner_notified']);

  const [mail] = reportMail();
  assert.deepEqual(mail.body.to, ['jane@example.com']);
  assert.equal(mail.body.subject, 'Your website report: example.com scored 72/100');
  // From John, replies to John; the owner's private alert inbox never appears.
  assert.equal(mail.body.from, 'John Carl Dimatulac <john@lracdimension.online>');
  assert.equal(mail.body.reply_to, 'john@lracdimension.online');
  assert.ok(!JSON.stringify(mail.body).includes('owner@example.com'));
  assert.equal(mail.body.attachments, undefined); // no BROWSER binding: no PDF
  assert.equal(mail.headers['idempotency-key'], `report-${out.id}-1`);
  const unsub = await unsubscribeToken(h.env, out.id);
  assert.equal(mail.body.headers['List-Unsubscribe'], `<https://api.example/api/vector/unsubscribe/${unsub}>`);
  assert.equal(mail.body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.deepEqual(mail.body.tags, [{ name: 'kind', value: 'vector_report' }, { name: 'request', value: out.id }]);
  // The whole report: every issue with its evidence and fix, and every prescription step.
  for (const i of ISSUES) {
    assert.ok(mail.body.text.includes(i.title) && mail.body.text.includes(i.recommendation), i.code);
  }
  assert.ok(mail.body.html.includes('Hi Jane,'));
  assert.ok(mail.body.html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &quot;quoted&quot;'));
  assert.ok(!mail.body.html.includes('<script>'));
  assert.ok(mail.body.html.includes(`${SITE}/vector/unsubscribe/#t=${unsub}`));
  assert.ok(mail.body.text.includes(`${SITE}/vector/report/#t=`));

  const [owner] = ownerMail();
  assert.deepEqual(owner.body.to, ['owner@example.com']);
  assert.equal(owner.body.subject, '[LRACDIMENSION] Report lead: example.com (72/100) — Jane Doe');
  assert.equal(owner.body.from, 'LRACDIMENSION <hello@lracdimension.online>');
  assert.equal(owner.body.reply_to, 'jane@example.com');
  assert.ok(owner.body.text.includes('Leads drop off at the form'));
  assert.equal(owner.headers['idempotency-key'], `notify-${out.id}`);
});

test('the status endpoint shows progress without the address; the admin key shows the trail', async () => {
  seedAudit();
  live();
  const { id } = await (await ask()).json();
  const pub = await (await h.call(`/api/vector/report-requests/${id}`)).json();
  assert.deepEqual(Object.keys(pub).sort(), ['email_masked', 'id', 'sent_at', 'status']);
  assert.equal(pub.status, 'sent');
  const admin = await (await h.call(`/api/vector/report-requests/${id}`, { headers: { 'X-Admin-Key': 'admin-secret' } })).json();
  assert.equal(admin.email, 'jane@example.com');
  assert.ok(admin.events.some((e) => e.kind === 'sent'));
  assert.equal(admin.links.length, 1);
  assert.equal((await h.call(`/api/vector/report-requests/${'f'.repeat(32)}`)).status, 404);
});

test('the emailed link opens the full report, counts views, and nothing else does', async () => {
  seedAudit();
  live();
  const { id } = await (await ask()).json();
  const token = tokenIn(reportMail()[0]);
  const res = await h.call('/api/vector/report', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const report = await res.json();
  assert.equal(report.gated, false);
  assert.equal(report.issues.length, ISSUES.length);
  assert.equal(report.issues[0].evidence, ISSUES[0].evidence);
  assert.equal(report.prescription[0].title, 'No HSTS header');
  assert.equal(report.requester.first_name, 'Jane');
  assert.ok(Date.parse(report.link.expires_at) > Date.now() + 29 * 86_400_000);
  await h.call('/api/vector/report', { headers: { Authorization: `Bearer ${token}` } });
  const link = h.env.DB.raw.prepare('SELECT * FROM report_tokens').get();
  assert.equal(link.views, 2);
  assert.notEqual(link.token_hash, token); // only the hash is stored
  assert.equal(events(id).filter((k) => k === 'viewed').length, 1);

  assert.equal((await h.call('/api/vector/report')).status, 401);
  assert.equal((await h.call('/api/vector/report', { headers: { Authorization: `Bearer ${'x'.repeat(43)}` } })).status, 404);

  h.env.DB.raw.prepare('UPDATE report_tokens SET expires_at = ?').run(new Date(Date.now() - 1000).toISOString());
  const expired = await h.call('/api/vector/report', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(expired.status, 410);
  assert.deepEqual((await expired.json()).error, { code: 'link_expired', message: 'This report link has expired.', audit_id: 'a1' });
});

test('the operator can revoke a link', async () => {
  seedAudit();
  live();
  const { id } = await (await ask()).json();
  const token = tokenIn(reportMail()[0]);
  assert.equal((await h.call(`/api/vector/report-requests/${id}/revoke`, { method: 'POST' })).status, 401);
  assert.equal((await h.call(`/api/vector/report-requests/${id}/revoke`, { method: 'POST', headers: { 'X-Admin-Key': 'admin-secret' } })).status, 200);
  const res = await h.call('/api/vector/report', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 410);
  assert.equal((await res.json()).error.code, 'link_revoked');
});

test('preflight allows the Authorization header the report page sends', async () => {
  const res = await h.call('/api/vector/report', { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
  assert.equal(res.status, 204);
  assert.match(res.headers.get('access-control-allow-headers'), /Authorization/);
});

// --------------------------------------------------------- the Workflow

test('with the Workflow bound, the request only creates an instance, and the instance delivers', async () => {
  seedAudit();
  live();
  const created = [];
  h.env.REPORT_WORKFLOW = { create: async (o) => created.push(o) };
  const { id } = await (await ask()).json();
  assert.equal(created.length, 1);
  assert.equal(created[0].id, id);
  assert.deepEqual(created[0].params, { requestId: id, apiOrigin: 'https://lracdim-api.example.workers.dev' });
  assert.equal(resendCalls().length, 0);
  assert.equal(request(id).status, 'queued');

  const names = [];
  const step = { do: async (name, config, fn) => (names.push([name, config.retries.limit]), fn()) };
  const wf = new ReportDeliveryWorkflow({}, h.env);
  const out = await wf.run({ payload: created[0].params }, step);
  assert.deepEqual(out, { status: 'sent' });
  assert.deepEqual(names, [['prepare', 3], ['summarize', 2], ['attach pdf', 2], ['send report', 5], ['notify owner', 3]]);
  assert.equal(reportMail().length, 1);
  // A replayed instance finds the request sent and does nothing.
  assert.deepEqual(await wf.run({ payload: created[0].params }, step), { status: 'sent' });
  assert.equal(reportMail().length, 1);
});

test('when the Workflow refuses an instance, delivery falls back to inline', async () => {
  seedAudit();
  live();
  h.env.REPORT_WORKFLOW = {
    create: async () => {
      throw new Error('daily instance limit');
    }
  };
  const { id } = await (await ask()).json();
  assert.equal(request(id).status, 'sent');
  assert.ok(h.env.DB.raw.prepare("SELECT 1 FROM report_events WHERE request_id = ? AND kind = 'dispatched' AND detail = 'inline'").get(id));
});

// ------------------------------------------------------------- summary

test('Workers AI writes the summary from facts only, and its answer is cleaned', async () => {
  seedAudit();
  live();
  const prompts = [];
  h.env.AI = {
    run: async (model, input) => {
      prompts.push({ model, input });
      return { response: '**example.com scored 72 out of 100.** Security headers are missing, so browsers get less protection. Visit https://evil.example or mail me@evil.example. The meta description is missing, so search results show a worse snippet. Fix the HSTS header first.' };
    }
  };
  const { id } = await (await ask()).json();
  const row = request(id);
  assert.equal(row.summary_source, 'ai:@cf/google/gemma-4-26b-a4b-it');
  assert.ok(row.summary.startsWith('example.com scored 72 out of 100.'));
  assert.ok(!/https?:|evil\.example|\*\*/.test(row.summary));
  const sent = JSON.stringify(prompts[0].input);
  assert.ok(!sent.includes('<script>') && !sent.includes('Header absent'), 'evidence never reaches the model');
  assert.ok(sent.includes('No HSTS header'));
  assert.deepEqual(prompts[0].input.chat_template_kwargs, { enable_thinking: false }, 'thinking is switched off');
  assert.ok(reportMail()[0].body.html.includes('Summary written with AI'));
});

test('a model that spends its budget thinking falls back to rules; one that rejects the switch is asked again without it', async () => {
  seedAudit();
  seedAudit('a2');
  live();
  // What Gemma 4 returns when thinking is left on: reasoning only, no answer.
  h.env.AI = {
    run: async () => ({
      choices: [{ message: { role: 'assistant', content: '', reasoning_content: 'Owner of the website. Score 72...' }, finish_reason: 'length' }]
    })
  };
  const first = await (await ask()).json();
  assert.equal(request(first.id).summary_source, 'rules');

  const calls = [];
  h.env.AI = {
    run: async (model, input) => {
      calls.push(input);
      if (input.chat_template_kwargs) throw new Error('8007: {"error":{"message":"chat_template is not supported for Mistral tokenizers."}}');
      return { choices: [{ message: { content: 'example.com scored 72 out of 100, so it works but has problems. Security headers are missing and the description is absent. Fix HSTS first.' }, finish_reason: 'stop' }] };
    }
  };
  const second = await (await ask('a2')).json();
  assert.equal(calls.length, 2);
  assert.ok(calls[0].chat_template_kwargs && !calls[1].chat_template_kwargs);
  assert.equal(calls[1].max_tokens, 320);
  assert.match(request(second.id).summary_source, /^ai:/);
  h.env.REPORT_AI = 'off';
});

test('an AI failure or an unusable answer falls back to the rule-based summary', async () => {
  seedAudit();
  seedAudit('a2');
  live();
  h.env.AI = {
    run: async () => {
      throw new Error('403 model not available on this plan');
    }
  };
  const first = await (await ask()).json();
  assert.equal(request(first.id).summary_source, 'rules');
  h.env.AI = { run: async () => ({ response: 'OK' }) };
  const second = await (await ask('a2')).json();
  assert.equal(request(second.id).summary_source, 'rules');
  assert.ok(!reportMail()[0].body.html.includes('Summary written with AI'));
  h.env.REPORT_AI = 'off';
});

test('the rule-based summary states the score, the weak areas and the first fix', () => {
  const audit = { url: 'https://example.com/', health_score: 72, scores: SCORES, summary: {} };
  const text = rulesSummary(summaryFacts(audit, ISSUES, [{ action: 'Send HSTS.' }]));
  assert.equal(
    text,
    'example.com scored 72 out of 100, which means it is working, but with problems that cost it visitors and search traffic. ' +
      'The weakest areas are Security (55) and SEO (70). The examination found 5 issues: 2 high, 2 medium, 1 low. ' +
      'Start with this: Send HSTS. The fixes below are ordered so the first ones move the score most.'
  );
  assert.equal(sanitizeSummary('# Title\n- one <b>two</b> see www.x.com'), 'Title one two see');
});

// -------------------------------------------------------------------- PDF

test('the full report is printed to PDF and attached; nothing of it is kept after sending', async () => {
  seedAudit();
  live();
  const calls = browser();
  const { id } = await (await ask()).json();
  assert.equal(request(id).status, 'sent');
  assert.equal(calls.length, 1);
  const { action, options } = calls[0];
  assert.equal(action, 'pdf');
  assert.equal(options.pdfOptions.format, 'a4');
  assert.equal(options.pdfOptions.printBackground, true);
  assert.match(options.pdfOptions.footerTemplate, /class="pageNumber".*class="totalPages"/);
  // Self-contained and escaped: nothing from the examined page becomes markup, nothing is fetched.
  assert.ok(options.html.includes('<h1>example.com</h1>'));
  assert.ok(options.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!/<script|<link|@import|<img/i.test(options.html));
  for (const i of ISSUES) assert.ok(options.html.includes(i.title) && options.html.includes(i.recommendation), i.code);
  assert.ok(options.html.includes('Prepared for Jane Doe, Acme'));
  assert.ok(options.html.includes('Scoring methodology'));
  assert.ok(options.html.includes('mailto:john@lracdimension.online'));

  const [mail] = reportMail();
  assert.equal(mail.body.attachments.length, 1);
  const [file] = mail.body.attachments;
  assert.match(file.filename, /^vector-report-example\.com-\d{4}-\d{2}-\d{2}\.pdf$/);
  assert.equal(Buffer.from(file.content, 'base64').toString('latin1'), Buffer.from(PDF_BYTES).toString('latin1'));
  assert.ok(mail.body.html.includes('also attached as a PDF'));
  assert.ok(mail.body.text.includes(file.filename));
  assert.deepEqual(events(id), ['requested', 'dispatched', 'processing', 'summarized', 'pdf_rendered', 'sent', 'owner_notified']);
  assert.equal(h.rows('report_files').length, 0);
  assert.match(ownerMail()[0].body.text, /PDF: attached \(\d+ bytes in \d+ ms\)/);
});

test('when the PDF cannot be made the report still goes, without the attachment', async () => {
  seedAudit();
  seedAudit('a2');
  live();
  browser(() => new Response('Browser time limit exceeded for today', { status: 429 }));
  const { id } = await (await ask()).json();
  assert.equal(request(id).status, 'sent');
  assert.equal(reportMail()[0].body.attachments, undefined);
  assert.ok(!reportMail()[0].body.html.includes('attached as a PDF'));
  assert.ok(events(id).includes('pdf_skipped'));
  assert.match(ownerMail()[0].body.text, /PDF:\s+not attached: browser returned 429/);
  // An error page is not passed off as a PDF.
  browser(() => new Response('<html>oops</html>', { status: 200 }));
  const second = await (await ask('a2')).json();
  assert.equal(request(second.id).status, 'sent');
  assert.equal(reportMail()[1].body.attachments, undefined);
  // REPORT_PDF=off: the browser is not even asked.
  seedAudit('a3');
  h.env.REPORT_PDF = 'off';
  const calls = browser();
  const third = await (await ask('a3')).json();
  assert.equal(request(third.id).status, 'sent');
  assert.equal(calls.length, 0);
  assert.ok(!events(third.id).some((e) => e.startsWith('pdf_')));
});

test('a 429 from the browser is waited out, and a retried send carries the very same PDF', async () => {
  seedAudit();
  live();
  const calls = browser((n) => (n === 1 ? new Response('slow down', { status: 429, headers: { 'Retry-After': '10' } }) : new Response(PDF_BYTES)));
  let sends = 0;
  h.respond = (url, init) => {
    if (JSON.parse(init.body).html && sends++ === 0) return Response.json({ message: 'internal' }, { status: 500 });
    return Response.json({ id: 'email_ok' });
  };
  const { id } = await (await ask()).json();
  assert.equal(request(id).status, 'sent');
  assert.equal(calls.length, 2); // one refusal, one PDF; the send retry did not print again
  const [a, b] = reportMail();
  assert.ok(a.body.attachments);
  assert.deepEqual(a.body, b.body); // an identical request under the same idempotency key
  assert.equal(a.headers['idempotency-key'], b.headers['idempotency-key']);
});

test('the report link downloads the same PDF, within limits', async () => {
  seedAudit();
  live();
  browser();
  await ask();
  const token = tokenIn(reportMail()[0]);
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  assert.equal((await (await h.call('/api/vector/report', auth)).json()).pdf, true);
  const res = await h.call('/api/vector/report/pdf', auth);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'application/pdf');
  assert.match(res.headers.get('Content-Disposition'), /^attachment; filename="vector-report-example\.com-\d{4}-\d{2}-\d{2}\.pdf"$/);
  assert.equal(Buffer.from(await res.arrayBuffer()).toString('latin1'), Buffer.from(PDF_BYTES).toString('latin1'));
  assert.equal((await h.call('/api/vector/report/pdf', { headers: { Authorization: `Bearer ${'x'.repeat(43)}` } })).status, 404);
  assert.equal((await h.call('/api/vector/report/pdf')).status, 401);
  for (let n = 2; n <= 5; n++) assert.equal((await h.call('/api/vector/report/pdf', auth)).status, 200, `download ${n}`);
  const sixth = await h.call('/api/vector/report/pdf', auth);
  assert.equal(sixth.status, 429);
  delete h.env.BROWSER;
  assert.equal((await (await h.call('/api/vector/report', auth)).json()).pdf, false);
  const off = await h.call('/api/vector/report/pdf', auth);
  assert.equal(off.status, 503);
  assert.equal((await off.json()).error.code, 'pdf_unavailable');
});

test('a report lead never reaches the old Google Sheets webhook, so nothing can auto-reply from Gmail', async () => {
  seedAudit();
  live();
  h.env.NOTIFY_WEBHOOK = 'https://script.google.com/macros/s/abc/exec';
  await ask();
  assert.ok(h.outbound().every((c) => !c.url.startsWith('https://script.google.com/')));
  assert.equal(ownerMail().length, 1);
});

// ---------------------------------------------------- duplicates & limits

test('the same report to the same address within a day is not sent twice', async () => {
  seedAudit();
  live();
  const first = await (await ask()).json();
  const again = await ask('a1', { email: ' JANE@example.com ' });
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), { id: first.id, status: 'sent', email_masked: 'j***@example.com', duplicate: true });
  assert.equal(reportMail().length, 1);
});

test('one report per address and one per website a week', async () => {
  seedAudit('a1', { host: 'example.com' });
  seedAudit('a2', { host: 'other.example' });
  seedAudit('a3', { host: 'www.example.com' });
  seedAudit('a4', { host: 'third.example' });
  live();
  Object.assign(h.env, { REPORT_EMAIL_COOLDOWN_DAYS: '7', REPORT_SITE_COOLDOWN_DAYS: '7', RATE_LIMIT_REPORTS: '50/hour' });
  const first = await (await ask('a1')).json();
  assert.equal(request(first.id).site_key, 'example.com');

  // Same address, another website: refused on the email field, with the date it opens again.
  const byEmail = await ask('a2', { email: 'JANE@example.com' });
  assert.equal(byEmail.status, 429);
  const e1 = (await byEmail.json()).error;
  assert.equal(e1.code, 'email_weekly_limit');
  assert.equal(e1.fields[0].field, 'email');
  assert.match(e1.message, /one report a week/);
  assert.equal(Date.parse(e1.retry_after) - Date.parse(request(first.id).created_at), 7 * 86_400_000);

  // Same website (www and a different page count too), another address.
  const bySite = await ask('a3', { email: 'sam@example.com' });
  assert.equal(bySite.status, 429);
  const e2 = (await bySite.json()).error;
  assert.equal(e2.code, 'site_weekly_limit');
  assert.match(e2.message, /^A full report for example\.com was already sent on /);

  // Another address and another website: fine.
  assert.equal((await ask('a4', { email: 'lee@example.com' })).status, 202);
  // Asking again for the very same report is not an error: it points at the first request.
  const again = await ask('a1');
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);

  // A request that failed does not use up the week.
  h.env.DB.raw.prepare("UPDATE report_requests SET status = 'failed' WHERE id = ?").run(first.id);
  assert.equal((await ask('a3', { email: 'sam@example.com' })).status, 202);
  // Older than a week: allowed again.
  h.env.DB.raw.prepare("UPDATE report_requests SET created_at = '2020-01-01T00:00:00.000Z'").run();
  assert.equal((await ask('a2', { email: 'jane@example.com' })).status, 202);
  assert.equal(reportMail().length, 4);
});

test('limits: per visitor and the daily cap', async () => {
  for (const id of ['a1', 'a2', 'a3', 'a4']) seedAudit(id);
  live();
  assert.equal((await ask('a1')).status, 202);
  assert.equal((await ask('a2', { email: 'ann@example.com' })).status, 202);
  h.env.REPORT_DAILY_CAP = '3';
  assert.equal((await ask('a3', { email: 'sam@example.com' })).status, 202);
  const capped = await ask('a4', { email: 'lee@example.com' });
  assert.equal(capped.status, 503);
  assert.equal((await capped.json()).error.code, 'capacity');

  h.env.RATE_LIMIT_REPORTS = '5/hour';
  const fifth = await ask('a4', { email: 'kim@example.com' });
  assert.equal(fifth.status, 503); // still capped; the IP limit is next
  const sixth = await ask('a4', { email: 'kim@example.com' });
  assert.equal(sixth.status, 429);
  assert.equal((await sixth.json()).error.code, 'rate_limited');
});

test('addresses whose domain cannot receive mail are refused', async () => {
  seedAudit();
  h.doh = (url) => {
    const type = new URL(url).searchParams.get('type');
    const name = new URL(url).searchParams.get('name');
    if (name === 'nomail.example' && type === 'MX') return Response.json({ Status: 0, Answer: [{ type: 15, data: '0 .' }] });
    if (name === 'gone.example') return Response.json({ Status: 3 });
    return Response.json({ Status: 0, Answer: type === 'MX' ? [{ type: 15, data: '10 mx.example.com.' }] : [] });
  };
  for (const email of ['a@nomail.example', 'b@gone.example']) {
    const res = await ask('a1', { email });
    assert.equal(res.status, 422, email);
    assert.equal((await res.json()).error.fields[0].field, 'email');
  }
  assert.equal((await ask('a1', { email: 'c@fine.example' })).status, 202);
});

test('the honeypot looks accepted but stores and sends nothing', async () => {
  seedAudit();
  live();
  const res = await ask('a1', { honeypot: 'https://spam.example' });
  assert.equal(res.status, 202);
  assert.equal((await res.json()).id, '0'.repeat(32));
  assert.equal(h.rows('report_requests').length, 0);
  assert.equal(resendCalls().length, 0);
});

// ------------------------------------------------------------- Turnstile

test('with Turnstile on, the token is verified server-side, including host and action', async () => {
  seedAudit();
  live();
  h.env.TURNSTILE_SECRET = 'ts-secret';
  let verdict = { success: false, 'error-codes': ['invalid-input-response'] };
  h.respond = (url, init) => {
    if (url.startsWith('https://challenges.cloudflare.com/')) {
      assert.equal(init.body.get('secret'), 'ts-secret');
      assert.equal(init.body.get('remoteip'), '203.0.113.7');
      return Response.json(verdict);
    }
    return Response.json({ id: 'email_123' });
  };
  const missing = await ask();
  assert.equal(missing.status, 422);
  assert.equal((await missing.json()).error.code, 'challenge_required');
  assert.equal((await ask('a1', { turnstile_token: 'tok' })).status, 403);
  verdict = { success: true, hostname: 'evil.example', action: 'report_request' };
  assert.equal((await ask('a1', { turnstile_token: 'tok' })).status, 403);
  verdict = { success: true, hostname: 'www.lracdimension.online', action: 'report_request' };
  assert.equal((await ask('a1', { turnstile_token: 'tok' })).status, 202);
});

test('TURNSTILE_REQUIRED without a secret refuses requests instead of running unprotected', async () => {
  seedAudit();
  h.env.TURNSTILE_REQUIRED = 'true';
  const res = await ask();
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, 'not_configured');
});

// ------------------------------------------------------- delivery failures

test('a permanent Resend refusal fails the request at once and the owner is told', async () => {
  seedAudit();
  live();
  h.respond = (url, init) => {
    const body = JSON.parse(init.body);
    if (body.html) return Response.json({ message: 'Invalid `to` field.' }, { status: 422 });
    return Response.json({ id: 'email_owner' });
  };
  const { id } = await (await ask()).json();
  const row = request(id);
  assert.equal(row.status, 'failed');
  assert.match(row.last_error, /422/);
  assert.equal(reportMail().length, 1); // not retried
  assert.match(ownerMail()[0].body.subject, /^\[LRACDIMENSION\] Report NOT delivered \(failed\): example\.com — Jane Doe$/);
  assert.deepEqual(events(id), ['requested', 'dispatched', 'processing', 'summarized', 'send_failed', 'failed', 'owner_notified']);
});

test('a transient Resend error is retried with the same idempotency key', async () => {
  seedAudit();
  live();
  let n = 0;
  h.respond = (url, init) => {
    if (JSON.parse(init.body).html && n++ === 0) return Response.json({ message: 'internal' }, { status: 500 });
    return Response.json({ id: 'email_ok' });
  };
  const { id } = await (await ask()).json();
  assert.equal(request(id).status, 'sent');
  const keys = reportMail().map((c) => c.headers['idempotency-key']);
  assert.deepEqual(keys, [`report-${id}-1`, `report-${id}-1`]);
});

test('without Resend the request is marked skipped; a dry run renders without sending', async () => {
  seedAudit();
  seedAudit('a2');
  const skipped = await (await ask()).json();
  assert.equal(request(skipped.id).status, 'skipped');
  h.env.REPORT_EMAIL_DRY_RUN = 'true';
  const dry = await (await ask('a2')).json();
  const row = request(dry.id);
  assert.equal(row.status, 'sent');
  assert.match(row.email_id, /^dry-run-/);
  assert.equal(resendCalls().length, 0);
});

// ---------------------------------------------------------- unsubscribe

test('one-click unsubscribe suppresses the address for every later request', async () => {
  seedAudit();
  seedAudit('a2');
  live();
  const { id } = await (await ask()).json();
  const url = reportMail()[0].body.headers['List-Unsubscribe'].slice(1, -1);
  const path = new URL(url).pathname;
  assert.equal((await h.call(path)).status, 405);
  const res = await h.call(path, { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: '' } });
  assert.equal(res.status, 200);
  const supp = h.env.DB.raw.prepare('SELECT * FROM email_suppressions').get();
  assert.equal(supp.reason, 'unsubscribed');
  assert.match(supp.detail, /one-click/);
  assert.ok(events(id).includes('unsubscribed'));
  const blocked = await ask('a2');
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error.code, 'suppressed');
  assert.equal((await h.call(`/api/vector/unsubscribe/${id}.${'A'.repeat(32)}`, { method: 'POST', body: {} })).status, 404);
  assert.equal(await readUnsubscribeToken(h.env, 'garbage'), null);
});

// -------------------------------------------------------- Resend webhook

const WEBHOOK_KEY = Buffer.from('a-webhook-signing-key-32-bytes!!').toString('base64');
function signed(payload, { ts = Math.floor(Date.now() / 1000), key = WEBHOOK_KEY } = {}) {
  const body = JSON.stringify(payload);
  const id = 'msg_1';
  const sig = createHmac('sha256', Buffer.from(key, 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
  return { method: 'POST', body, headers: { 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': `v1,bad v1,${sig}`, Origin: '' } };
}

test('a signed bounce suppresses the address and marks the request; bad signatures are refused', async () => {
  seedAudit();
  live();
  h.env.RESEND_WEBHOOK_SECRET = `whsec_${WEBHOOK_KEY}`;
  const { id } = await (await ask()).json();
  const bounce = { type: 'email.bounced', data: { email_id: 'email_123', to: ['jane@example.com'], bounce: { type: 'Permanent', subType: 'General', message: 'mailbox does not exist' } } };
  assert.equal((await h.call('/api/webhooks/resend', signed(bounce, { key: Buffer.from('another-key-entirely-32-bytes!!!').toString('base64') }))).status, 401);
  assert.equal((await h.call('/api/webhooks/resend', signed(bounce, { ts: Math.floor(Date.now() / 1000) - 3600 }))).status, 401);
  assert.equal((await h.call('/api/webhooks/resend', signed(bounce))).status, 200);
  assert.equal(request(id).status, 'bounced');
  assert.equal(h.env.DB.raw.prepare('SELECT reason FROM email_suppressions').get().reason, 'bounced');
  assert.equal((await h.call('/api/webhooks/resend', signed({ type: 'email.delivered', data: { email_id: 'email_123' } }))).status, 200);
  assert.deepEqual(events(id).slice(-2), ['bounced', 'delivered']);
});

// A reply to john@ as Resend stores it (GET /emails/receiving/{id}).
const RECEIVED = {
  object: 'email',
  id: 'rcv_1',
  from: 'jane@client.example',
  to: ['john@lracdimension.online'],
  subject: 'Re: Your website report: example.com scored 72/100',
  html: '<p>Thanks! Can you fix the <b>HSTS</b> issue?</p>',
  text: 'Thanks! Can you fix the HSTS issue?',
  headers: { from: 'Jane Doe <jane@client.example>' },
  reply_to: [],
  authentication: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
  created_at: '2026-11-28T09:00:00.000Z',
  attachments: [{ id: 'att_1', filename: 'screenshot.png', size: 2048 }]
};
const inbound = (overrides = {}) => {
  const mail = { ...RECEIVED, ...overrides };
  h.respond = (url) => {
    if (url === 'https://api.resend.com/emails/receiving/rcv_1') return Response.json(mail);
    if (url.startsWith('https://api.resend.com/emails/receiving/rcv_1/attachments')) {
      return Response.json({ object: 'list', has_more: false, data: [{ id: 'att_1', filename: 'screenshot.png', size: 2048, content_type: 'image/png', download_url: 'https://inbound-cdn.resend.com/att_1?sig=x', expires_at: '2026-11-28T10:00:00Z' }] });
    }
    if (url === 'https://api.resend.com/emails') return Response.json({ id: 'fwd_1' });
    return new Response('not found', { status: 404 });
  };
};

test('mail to the domain is forwarded to the private inbox, replying to the sender, once', async () => {
  live();
  h.env.RESEND_WEBHOOK_SECRET = `whsec_${WEBHOOK_KEY}`;
  inbound();
  const evt = { type: 'email.received', data: { email_id: 'rcv_1', from: 'jane@client.example', to: ['john@lracdimension.online'], subject: RECEIVED.subject } };
  const res = await h.call('/api/webhooks/resend', signed(evt));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { received: true, forwarded: true });
  const [fwd] = resendCalls();
  assert.deepEqual(fwd.body.to, ['owner@example.com']);
  assert.equal(fwd.body.from, 'Jane Doe via LRACDIMENSION <hello@lracdimension.online>');
  assert.equal(fwd.body.reply_to, 'jane@client.example');
  assert.equal(fwd.body.subject, RECEIVED.subject);
  assert.equal(fwd.headers['idempotency-key'], 'inbound-rcv_1');
  assert.ok(fwd.body.html.includes('<b>HSTS</b>') && fwd.body.html.includes('Jane Doe &lt;jane@client.example&gt;'));
  assert.ok(fwd.body.text.includes('To: john@lracdimension.online'));
  assert.deepEqual(fwd.body.attachments, [{ filename: 'screenshot.png', path: 'https://inbound-cdn.resend.com/att_1?sig=x' }]);
  // A webhook retry sends the same request under the same key, so Resend drops the duplicate.
  await h.call('/api/webhooks/resend', signed(evt));
  assert.equal(resendCalls().at(-1).headers['idempotency-key'], 'inbound-rcv_1');
});

test('forwarding flags failed sender checks, skips its own mail, and retries on upstream trouble', async () => {
  live();
  h.env.RESEND_WEBHOOK_SECRET = `whsec_${WEBHOOK_KEY}`;
  inbound({ attachments: [], authentication: { spf: 'fail', dkim: 'fail', dmarc: 'fail' } });
  await h.call('/api/webhooks/resend', signed({ type: 'email.received', data: { email_id: 'rcv_1', from: 'jane@client.example' } }));
  const [fwd] = resendCalls();
  assert.match(fwd.body.subject, /^\[unverified sender\] /);
  assert.ok(fwd.body.html.includes('Sender checks failed'));
  assert.equal(fwd.body.attachments, undefined);

  // Our own sending address (an auto-reply bouncing back) is never forwarded: no loops.
  const own = await h.call('/api/webhooks/resend', signed({ type: 'email.received', data: { email_id: 'rcv_1', from: 'hello@lracdimension.online' } }));
  assert.equal((await own.json()).reason, 'own address');
  assert.equal(resendCalls().length, 1);

  // Resend unreachable: a 5xx, so Resend retries the webhook later.
  h.respond = () => new Response('busy', { status: 503 });
  assert.equal((await h.call('/api/webhooks/resend', signed({ type: 'email.received', data: { email_id: 'rcv_1', from: 'jane@client.example' } }))).status, 502);
});

test('the webhook is off until its secret is set', async () => {
  assert.equal((await h.call('/api/webhooks/resend', signed({ type: 'email.delivered', data: {} }))).status, 503);
});

// ----------------------------------------------------------------- admin

test('admin: list, stats, retry and erase all need the key', async () => {
  seedAudit();
  seedAudit('a2');
  live();
  h.respond = (url, init) => (JSON.parse(init.body).html ? Response.json({ message: 'Domain not verified' }, { status: 403 }) : Response.json({ id: 'e' }));
  const { id } = await (await ask()).json();
  assert.equal(request(id).status, 'failed');
  for (const [path, method] of [['/api/vector/report-requests', 'GET'], ['/api/vector/report-stats', 'GET'], [`/api/vector/report-requests/${id}/retry`, 'POST'], ['/api/vector/report-requests/erase', 'POST']]) {
    assert.equal((await h.call(path, { method, body: method === 'POST' ? {} : undefined })).status, 401, path);
  }
  const admin = { 'X-Admin-Key': 'admin-secret' };
  const list = await (await h.call('/api/vector/report-requests?status=failed', { headers: admin })).json();
  assert.deepEqual(list.map((r) => [r.id, r.url, r.health_score]), [[id, 'https://example.com/', 72]]);

  h.respond = () => Response.json({ id: 'email_after_fix' });
  const retry = await h.call(`/api/vector/report-requests/${id}/retry`, { method: 'POST', headers: admin });
  assert.equal(retry.status, 202);
  const row = request(id);
  assert.equal(row.status, 'sent');
  assert.equal(row.attempts, 2);
  assert.equal(reportMail().at(-1).headers['idempotency-key'], `report-${id}-2`);
  assert.equal((await h.call(`/api/vector/report-requests/${id}/retry`, { method: 'POST', headers: admin })).status, 409);

  const stats = await (await h.call('/api/vector/report-stats', { headers: admin })).json();
  assert.equal(stats.today.sent, 1);
  assert.equal(stats.daily_cap, 40);
  assert.equal(stats.workflow, 'inline');

  const token = tokenIn(reportMail().at(-1));
  const erased = await (await h.call('/api/vector/report-requests/erase', { method: 'POST', headers: admin, body: { email: 'JANE@example.com' } })).json();
  assert.deepEqual(erased, { erased: 1, suppressed: true });
  const gone = request(id);
  assert.equal(gone.email, '');
  assert.equal(gone.name, '');
  assert.equal(gone.anonymized, 1);
  assert.equal((await h.call('/api/vector/report', { headers: { Authorization: `Bearer ${token}` } })).status, 404);
  assert.equal((await ask('a2')).status, 409); // suppressed after erasure
});

// ------------------------------------------------------------------- cron

test('the cron re-dispatches requests left queued, and anonymises old ones', async () => {
  seedAudit();
  seedAudit('a2');
  live();
  h.env.REPORT_WORKFLOW = { create: async () => {} }; // accepted, then never ran
  const { id } = await (await ask()).json();
  const old = new Date(Date.now() - 2 * 3600_000).toISOString();
  h.env.DB.raw.prepare('UPDATE report_requests SET updated_at = ? WHERE id = ?').run(old, id);
  delete h.env.REPORT_WORKFLOW;
  const at = new Date();
  at.setUTCMinutes(2);
  const out = await reportMaintenance(h.env, h.ctx(), at.getTime());
  await Promise.all(h.pending.splice(0));
  assert.equal(out.recovered, 1);
  assert.equal(request(id).status, 'sent');
  assert.ok(events(id).includes('recovered'));

  const { id: oldId } = await (await ask('a2', { email: 'old@example.com' })).json();
  h.env.DB.raw.prepare('UPDATE report_requests SET created_at = ? WHERE id = ?').run(new Date(Date.now() - 400 * 86_400_000).toISOString(), oldId);
  await reportMaintenance(h.env, h.ctx(), at.getTime());
  const anon = request(oldId);
  assert.equal(anon.anonymized, 1);
  assert.equal(anon.email, '');
  assert.equal(request(id).anonymized, 0);
});

// ------------------------------------------------------------ the email

test('the email greets only a plain first name, caps the issue list, and stays under Gmail clipping', () => {
  const many = Array.from({ length: 40 }, (_, n) => ISSUE('seo', `code_${n}`, n < 5 ? 'high' : 'low', `Issue number ${n}`, 'x'.repeat(2000)));
  const base = {
    audit: { url: 'https://example.com/', health_score: 41, scores: SCORES, summary: { final_url: 'https://example.com/' }, completed_at: '2026-11-27T10:00:00Z' },
    results: CATS.map((c) => ({ category: c, score: SCORES[c] })),
    issues: many,
    prescription: many.map((i, n) => ({ position: n + 1, severity: i.severity, action: i.recommendation, issue_code: i.code })),
    summary: 'Summary.',
    summarySource: 'rules',
    reportUrl: 'https://site/vector/report/#t=abc',
    linkDays: 30,
    unsubscribeUrl: 'https://site/vector/unsubscribe/#t=x',
    siteUrl: 'https://site',
    canReply: true
  };
  const mail = renderReportEmail({ ...base, name: 'http://spam.example Bob' });
  assert.ok(mail.html.includes('Hi there,'));
  assert.ok(mail.html.includes(`${40 - MAX_ISSUES} more lower-priority issues are listed in the online report.`));
  assert.ok(Buffer.byteLength(mail.html) < 102 * 1024, `html is ${Buffer.byteLength(mail.html)} bytes`);
  assert.ok(!mail.text.includes('x'.repeat(300)));
  assert.equal(renderReportEmail({ ...base, name: 'María José' }).html.includes('Hi María,'), true);
  assert.equal(maskEmail('ab@example.com'), 'a*@example.com');
});
