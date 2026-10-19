/**
 * Worker tests on Node's test runner. D1 is a thin adapter over node:sqlite
 * loaded with the real migration, and fetch is replaced by a recorder, so no
 * test touches the network or Cloudflare.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import worker from '../src/index.js';
import { classify } from '../src/contact.js';
import { acknowledge, readable } from '../src/notify.js';

const MIGRATION = readFileSync(new URL('../migrations/0001_contact.sql', import.meta.url), 'utf8');

class Statement {
  constructor(db, sql, args = []) {
    Object.assign(this, { db, sql, args });
  }
  bind(...args) {
    return new Statement(this.db, this.sql, args);
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.args) ?? null;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.args), success: true };
  }
  async run() {
    const info = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(info.changes) } };
  }
}

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(MIGRATION);
  return { raw: db, prepare: (sql) => new Statement(db, sql) };
}

const SITE = 'https://www.lracdimension.online';
const BASE_ENV = {
  CORS_ORIGINS: `${SITE},https://lracdimension.online,https://lracdimension.vercel.app`,
  RATE_LIMIT_CONTACT: '5/hour',
  RATE_LIMIT_SALT: 'salt',
  ADMIN_KEY: 'admin-secret'
};

let env;
let calls;
let pending;
let respond;
const realFetch = globalThis.fetch;

beforeEach(() => {
  env = { ...BASE_ENV, DB: d1() };
  calls = [];
  pending = [];
  respond = () => new Response(JSON.stringify({ id: 'email_123' }), { status: 200 });
  globalThis.fetch = async (url, init = {}) => {
    const headers = Object.fromEntries(new Headers(init.headers || {}).entries());
    let body = init.body;
    if (body instanceof ArrayBuffer) body = new TextDecoder().decode(body);
    calls.push({ url: String(url), method: init.method || 'GET', headers, body: typeof body === 'string' && body.startsWith('{') ? JSON.parse(body) : body });
    return respond(String(url), init);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const ctx = () => ({ waitUntil: (p) => pending.push(p) });

async function call(path, { method = 'GET', body, headers = {}, ip = '203.0.113.7' } = {}) {
  const init = { method, headers: { Origin: SITE, 'CF-Connecting-IP': ip, ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  const res = await worker.fetch(new Request(`https://lracdim-api.example.workers.dev${path}`, init), env, ctx());
  await Promise.all(pending);
  return res;
}

const INTAKE = {
  name: 'Jane Doe',
  email: 'Jane@Example.com',
  company: 'Acme',
  project_type: 'Automation',
  problem: 'Leads arrive by email and someone retypes them into a spreadsheet every day.',
  timeline: 'As soon as possible',
  budget_range: null,
  honeypot: null
};

const rows = () => env.DB.raw.prepare('SELECT * FROM contact_submissions').all();

test('health reports the database and the forwarding mode', async () => {
  const res = await call('/api/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.database, 'd1');
  assert.equal(body.legacy, false);
  assert.equal(res.headers.get('access-control-allow-origin'), SITE);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

for (const origin of [SITE, 'https://lracdimension.online', 'https://lracdimension.vercel.app']) {
  test(`preflight allows ${origin}`, async () => {
    const res = await call('/api/contact', {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), origin);
    assert.match(res.headers.get('access-control-allow-headers'), /Content-Type/);
  });
}

test('preflight rejects other origins, and they get no CORS header', async () => {
  const pre = await call('/api/contact', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(pre.status, 400);
  const res = await call('/api/health', { headers: { Origin: 'https://evil.example' } });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('a valid submission is stored, classified and reported back', async () => {
  const res = await call('/api/contact', { method: 'POST', body: INTAKE });
  assert.equal(res.status, 201);
  const out = await res.json();
  assert.match(out.id, /^[0-9a-f]{32}$/);
  assert.equal(out.received, true);
  assert.equal(out.notified, false); // no channel configured
  const [row] = rows();
  assert.equal(row.id, out.id);
  assert.equal(row.email, 'jane@example.com');
  assert.equal(row.notified, 0);
  const cls = JSON.parse(row.classification);
  assert.equal(cls.urgency, 'High');
  // Same as the Python rules ("ai" also matches inside "email").
  assert.deepEqual(cls.likely_services, ['Automation', 'Database Engineering', 'AI Integration']);
  assert.equal(cls.complexity, 'Medium');
  assert.equal(calls.length, 0);
});

test('the owner alert goes through Resend with the visitor as reply-to', async () => {
  env.RESEND_API_KEY = 're_test';
  env.NOTIFY_EMAIL = 'owner@example.com';
  const out = await (await call('/api/contact', { method: 'POST', body: INTAKE })).json();
  assert.equal(out.notified, true);
  const [mail] = calls;
  assert.equal(mail.url, 'https://api.resend.com/emails');
  assert.equal(mail.headers.authorization, 'Bearer re_test');
  assert.equal(mail.headers['idempotency-key'], `notify-${out.id}`);
  assert.equal(mail.body.from, 'LRACDIMENSION <onboarding@resend.dev>');
  assert.deepEqual(mail.body.to, ['owner@example.com']);
  assert.equal(mail.body.reply_to, 'jane@example.com');
  assert.equal(mail.body.subject, '[LRACDIMENSION] New project inquiry: Automation — Jane Doe');
  assert.ok(mail.body.text.includes('Name: Jane Doe') && !mail.body.text.includes('Budget'));
  assert.equal(rows()[0].notified, 1);
});

test('the Sheets webhook gets the subject and payload, without following its redirect', async () => {
  env.NOTIFY_WEBHOOK = 'https://script.google.com/macros/s/abc/exec';
  respond = () => new Response(null, { status: 302, headers: { Location: 'https://script.googleusercontent.com/x' } });
  const out = await (await call('/api/contact', { method: 'POST', body: INTAKE })).json();
  assert.equal(out.notified, true);
  const [hook] = calls;
  assert.equal(hook.url, env.NOTIFY_WEBHOOK);
  assert.equal(hook.body.subject, '[LRACDIMENSION] New project inquiry: Automation — Jane Doe');
  assert.equal(hook.body.email, 'jane@example.com');
  assert.equal(hook.body.classification.method, 'keyword rules v1');
});

test('a failing channel never fails the submission', async () => {
  env.RESEND_API_KEY = 're_test';
  env.NOTIFY_EMAIL = 'owner@example.com';
  respond = () => new Response(JSON.stringify({ message: 'domain not verified' }), { status: 403 });
  const res = await call('/api/contact', { method: 'POST', body: INTAKE });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).notified, false);
  assert.equal(rows().length, 1);
});

test('validation errors name every rejected field in the API envelope', async () => {
  const res = await call('/api/contact', { method: 'POST', body: { ...INTAKE, name: 'J', email: 'not-an-email', project_type: 'Spaceship', problem: 'short' } });
  assert.equal(res.status, 422);
  const { error } = await res.json();
  assert.equal(error.code, 'validation');
  assert.deepEqual(error.fields.map((f) => f.field), ['name', 'email', 'project_type', 'problem']);
  assert.equal(error.message, 'name: Must be at least 2 characters.');
  assert.equal(rows().length, 0);
});

test('a body that is not a JSON object is rejected', async () => {
  for (const body of ['not json', '[1,2]']) {
    const res = await call('/api/contact', { method: 'POST', body });
    assert.equal(res.status, 422);
  }
});

test('honeypot submissions look accepted but store and send nothing', async () => {
  env.RESEND_API_KEY = 're_test';
  env.NOTIFY_EMAIL = 'owner@example.com';
  const res = await call('/api/contact', { method: 'POST', body: { ...INTAKE, honeypot: 'x' } });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { id: '0'.repeat(32), received: true, notified: false });
  assert.equal(rows().length, 0);
  assert.equal(calls.length, 0);
});

test('the sixth submission in an hour from one IP is rate limited; another IP is not', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await call('/api/contact', { method: 'POST', body: INTAKE })).status, 201);
  const sixth = await call('/api/contact', { method: 'POST', body: INTAKE });
  assert.equal(sixth.status, 429);
  assert.equal((await sixth.json()).error.code, 'rate_limited');
  assert.equal((await call('/api/contact', { method: 'POST', body: INTAKE, ip: '198.51.100.9' })).status, 201);
  // Only a hash of the IP is kept.
  const keys = env.DB.raw.prepare('SELECT ip_key FROM rate_hits').all().map((r) => r.ip_key);
  assert.ok(keys.every((k) => /^[0-9a-f]{32}$/.test(k)));
});

test('submissions need the admin key', async () => {
  await call('/api/contact', { method: 'POST', body: INTAKE });
  assert.equal((await call('/api/contact/submissions')).status, 401);
  assert.equal((await call('/api/contact/submissions', { headers: { 'X-Admin-Key': 'wrong' } })).status, 401);
  const res = await call('/api/contact/submissions', { headers: { 'X-Admin-Key': 'admin-secret' } });
  assert.equal(res.status, 200);
  const [first] = await res.json();
  assert.equal(first.email, 'jane@example.com');
  assert.equal(first.notified, false);
  assert.equal(first.classification.project_type, 'Automation');
});

test('project types match the form', async () => {
  const res = await call('/api/contact/project-types');
  assert.ok((await res.json()).includes('Data / Analytics'));
});

test('unported routes are forwarded to the Python API with the visitor IP and no Origin', async () => {
  env.LEGACY_API_ORIGIN = 'https://legacy.example';
  respond = () => new Response(JSON.stringify({ id: 'a1', status: 'queued' }), { status: 202, headers: { 'Content-Type': 'application/json' } });
  const res = await call('/api/vector/audits?x=1', { method: 'POST', body: { url: 'https://example.com' } });
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { id: 'a1', status: 'queued' });
  assert.equal(res.headers.get('access-control-allow-origin'), SITE);
  const [fwd] = calls;
  assert.equal(fwd.url, 'https://legacy.example/api/vector/audits?x=1');
  assert.equal(fwd.method, 'POST');
  assert.equal(fwd.headers['x-forwarded-for'], '203.0.113.7');
  assert.equal(fwd.headers.origin, undefined);
  assert.deepEqual(fwd.body, { url: 'https://example.com' });
});

test('an unreachable Python API is a clear 502; with forwarding off it is a 503', async () => {
  env.LEGACY_API_ORIGIN = 'https://legacy.example';
  respond = () => {
    throw new TypeError('fetch failed');
  };
  const down = await call('/api/signal/events?limit=40');
  assert.equal(down.status, 502);
  assert.equal((await down.json()).error.code, 'upstream_unreachable');
  delete env.LEGACY_API_ORIGIN;
  const off = await call('/api/signal/events?limit=40');
  assert.equal(off.status, 503);
  assert.equal(off.headers.get('access-control-allow-origin'), SITE);
});

test('classification matches the Python rules', () => {
  // Expected values are the output of api/app/services/contact_service.classify for the same input.
  const c = classify('Website', 'We need a WordPress site that is not slow, with a booking portal.', '$2k', 'Next month');
  assert.equal(c.complexity, 'Low');
  assert.deepEqual(c.likely_services, ['Application Development', 'WordPress Development', 'SEO and Performance']);
  assert.equal(c.urgency, 'Normal');
  assert.equal(c.budget_range, '$2k');
  assert.deepEqual(classify('Other', 'hello there', null, null).likely_services, ['Discovery call']);
});

test('the readable email skips empty fields and wraps long ones', () => {
  const text = readable({ name: 'Jane', budget_range: null, problem: 'x'.repeat(80), extra_note: 'hi' });
  assert.equal(text, `Name: Jane\nThe problem:\n${'x'.repeat(80)}\n\nExtra note: hi`);
});

test('the visitor acknowledgement waits for a verified sender', async () => {
  env.RESEND_API_KEY = 're_test';
  env.NOTIFY_EMAIL = 'owner@example.com';
  assert.equal(await acknowledge(env, 'jane@example.com', 'Jane Doe', 'Automation', 'abc'), false); // off by default
  env.RESEND_AUTOREPLY = 'true';
  assert.equal(await acknowledge(env, 'jane@example.com', 'Jane Doe', 'Automation', 'abc'), false); // resend.dev sender
  env.RESEND_FROM = 'John Carl <hello@lracdimension.online>';
  assert.equal(await acknowledge(env, 'jane@example.com', 'Jane Doe', 'Automation', 'abc'), true);
  const [mail] = calls;
  assert.deepEqual(mail.body.to, ['jane@example.com']);
  assert.equal(mail.body.reply_to, 'owner@example.com');
  assert.ok(mail.body.text.startsWith('Hi Jane,'));
  assert.equal(mail.headers['idempotency-key'], 'ack-abc');
});
