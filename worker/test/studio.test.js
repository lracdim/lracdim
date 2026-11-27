/**
 * The studio dashboard API (/api/studio): sign-in, sessions and invites,
 * admin versus client access, the pipeline built from real leads, websites
 * on Signal and Vector, support SLAs, invoices and the command centre.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { hashPassword, verifyPassword } from '../src/studio/auth.js';
import { rollupUptime } from '../src/studio/sites.js';
import { slaState } from '../src/studio/views.js';

let h;
beforeEach(() => {
  h = setup();
});
afterEach(() => h.restore());

const API = '/api/studio';
const PASSWORD = 'correct horse battery staple';
const hex = (n) => n.toString(16).padStart(32, '0');
const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const day = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const sql = (q, ...args) => h.env.DB.raw.prepare(q).run(...args);
const row = (q, ...args) => h.env.DB.raw.prepare(q).get(...args);
const rows = (q, ...args) => h.env.DB.raw.prepare(q).all(...args);

async function call(path, { token, ...opts } = {}) {
  const res = await h.call(`${API}${path}`, { ...opts, headers: { ...(token ? auth(token) : {}), ...(opts.headers || {}) } });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

let seq = 100;
async function seedUser({ email, role = 'admin', clientId = null, name = role === 'admin' ? 'Owner' : 'Client Person', password = PASSWORD, disabled = 0 }) {
  const id = hex(seq++);
  sql('INSERT INTO studio_users (id, email, name, role, client_id, password_hash, disabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, email, name, role, clientId, password ? await hashPassword(password) : null, disabled, iso());
  return id;
}

function seedClient(company, { plan = 'Growth', status = 'active', mrr = 890, hours = 6, renewal = day(200), nps = null } = {}) {
  const id = hex(seq++);
  sql(
    "INSERT INTO studio_clients (id, company, contact_name, email, phone, plan, mrr, included_hours, status, industry, since, renewal_date, notes, nps, created_at, updated_at) VALUES (?, ?, 'Pat Contact', ?, '', ?, ?, ?, ?, '', ?, ?, '', ?, ?, ?)",
    id,
    company,
    `${company.toLowerCase().replace(/\W+/g, '')}@example.com`,
    plan,
    mrr,
    hours,
    status,
    day(-100),
    renewal,
    nps,
    iso(),
    iso()
  );
  return id;
}

async function signIn(email, password = PASSWORD, ip) {
  const res = await call('/v1/auth/login', { method: 'POST', body: { email, password }, ip });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

async function adminToken() {
  await seedUser({ email: 'owner@example.com' });
  return signIn('owner@example.com');
}

async function clientWithLogin(company, email) {
  const clientId = seedClient(company);
  await seedUser({ email, role: 'client', clientId, name: `${company} Person` });
  return { clientId, token: await signIn(email) };
}

/* ------------------------------------------------------------ passwords and sign-in */

test('password hashes use the documented PBKDF2 format and verify', async () => {
  const stored = await hashPassword('s3cret-pass-phrase');
  assert.match(stored, /^pbkdf2\$100000\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$/);
  assert.equal(await verifyPassword('s3cret-pass-phrase', stored), true);
  assert.equal(await verifyPassword('wrong', stored), false);
  assert.equal(await verifyPassword('anything', null), false);
  assert.equal(await verifyPassword('anything', 'garbage'), false);
});

test('the create-admin script hashes the way the Worker verifies, and its SQL creates, updates and protects', async () => {
  const script = await import('../scripts/studio-create-admin.mjs');
  const hash = script.hashPassword('owner password one');
  assert.equal(await verifyPassword('owner password one', hash), true);
  h.env.DB.raw.exec(script.adminSql({ email: 'owner@example.com', name: "O'Brien", hash }));
  assert.equal(row('SELECT name FROM studio_users').name, "O'Brien");
  assert.ok(await signIn('owner@example.com', 'owner password one'));
  // Running it again changes the password and signs the admin out.
  h.env.DB.raw.exec(script.adminSql({ email: 'owner@example.com', name: 'Owner', hash: script.hashPassword('owner password two') }));
  assert.equal(rows('SELECT * FROM studio_users').length, 1);
  assert.equal(rows('SELECT * FROM studio_sessions').length, 0);
  assert.ok(await signIn('owner@example.com', 'owner password two'));
  // A client user's address is never turned into an admin.
  await seedUser({ email: 'client@example.com', role: 'client', clientId: seedClient('Client Co') });
  h.env.DB.raw.exec(script.adminSql({ email: 'client@example.com', name: 'Sneaky', hash }));
  assert.equal(row("SELECT role FROM studio_users WHERE email = 'client@example.com'").role, 'client');
});

test('login returns a session that works, and only its hash is stored', async () => {
  await seedUser({ email: 'owner@example.com' });
  const res = await call('/v1/auth/login', { method: 'POST', body: { email: ' Owner@Example.com ', password: PASSWORD } });
  assert.equal(res.status, 200);
  assert.match(res.body.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(res.body.user.role, 'admin');
  assert.equal(res.body.user.password_hash, undefined);
  const sessions = rows('SELECT * FROM studio_sessions');
  assert.equal(sessions.length, 1);
  assert.notEqual(sessions[0].token_hash, res.body.token);
  assert.ok(Date.parse(sessions[0].expires_at) - Date.now() > 11.9 * 3600_000);
  const me = await call('/v1/auth/me', { token: res.body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.email, 'owner@example.com');
  assert.ok(row('SELECT last_login_at FROM studio_users').last_login_at);
});

test('a wrong password and an unknown address get the same generic 401', async () => {
  await seedUser({ email: 'owner@example.com' });
  const wrong = await call('/v1/auth/login', { method: 'POST', body: { email: 'owner@example.com', password: 'nope' } });
  const unknown = await call('/v1/auth/login', { method: 'POST', body: { email: 'nobody@example.com', password: PASSWORD } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.error.message, unknown.body.error.message);
  assert.equal(rows('SELECT * FROM studio_sessions').length, 0);
});

test('a disabled user cannot sign in', async () => {
  await seedUser({ email: 'gone@example.com', disabled: 1 });
  assert.equal((await call('/v1/auth/login', { method: 'POST', body: { email: 'gone@example.com', password: PASSWORD } })).status, 401);
});

test('login is rate limited per IP', async () => {
  await seedUser({ email: 'owner@example.com' });
  for (let i = 0; i < 10; i++) {
    assert.equal((await call('/v1/auth/login', { method: 'POST', body: { email: `guess${i}@example.com`, password: 'x' } })).status, 401);
  }
  const blocked = await call('/v1/auth/login', { method: 'POST', body: { email: 'owner@example.com', password: PASSWORD } });
  assert.equal(blocked.status, 429);
  // Another IP is unaffected.
  assert.equal((await call('/v1/auth/login', { method: 'POST', body: { email: 'owner@example.com', password: PASSWORD }, ip: '198.51.100.9' })).status, 200);
});

test('an expired session is refused and removed; logout ends a session', async () => {
  const token = await adminToken();
  sql('UPDATE studio_sessions SET expires_at = ?', iso(1000));
  const expired = await call('/v1/admin/overview', { token });
  assert.equal(expired.status, 401);
  assert.equal(expired.body.error.code, 'session_expired');
  assert.equal(rows('SELECT * FROM studio_sessions').length, 0);

  const fresh = await signIn('owner@example.com');
  assert.equal((await call('/v1/auth/logout', { method: 'POST', token: fresh })).status, 200);
  assert.equal((await call('/v1/auth/me', { token: fresh })).status, 401);
});

test('no token is a 401, a malformed token too, and unknown studio paths are 404 before auth', async () => {
  assert.equal((await call('/v1/admin/overview')).status, 401);
  assert.equal((await call('/v1/admin/overview', { token: 'not-a-token' })).status, 401);
  const unknown = await call('/v1/admin/nothing-here');
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, 'not_found');
});

/* ------------------------------------------------------------ authorisation */

test('a client cannot use admin routes and only ever sees its own data', async () => {
  const admin = await adminToken();
  const a = await clientWithLogin('Alpha Dental', 'alpha@example.com');
  const b = await clientWithLogin('Beta Coffee', 'beta@example.com');

  for (const path of ['/v1/admin/overview', '/v1/admin/clients', `/v1/admin/clients/${a.clientId}`, '/v1/admin/prospects']) {
    const res = await call(path, { token: a.token });
    assert.equal(res.status, 403, path);
  }
  assert.equal((await call('/v1/client/overview', { token: admin })).status, 403);

  const ticket = await call('/v1/client/tickets', { method: 'POST', token: b.token, body: { subject: 'Change the hours', body: 'Open until 6 on Fridays.', priority: 'high' } });
  assert.equal(ticket.status, 201);
  assert.equal(ticket.body.company, 'Beta Coffee');
  assert.equal((await call(`/v1/client/tickets/${ticket.body.id}`, { token: a.token })).status, 404);
  assert.equal((await call(`/v1/client/tickets/${ticket.body.id}/messages`, { method: 'POST', token: a.token, body: { body: 'hi' } })).status, 404);
  assert.deepEqual((await call('/v1/client/tickets', { token: a.token })).body, []);
  assert.equal((await call('/v1/client/tickets', { token: b.token })).body.length, 1);

  const site = await call('/v1/admin/sites', { method: 'POST', token: admin, body: { clientId: b.clientId, name: 'Beta main site', url: 'beta-coffee.example' } });
  assert.equal(site.status, 201, JSON.stringify(site.body));
  assert.equal((await call(`/v1/client/sites/${site.body.id}/health`, { token: a.token })).status, 404);
  assert.equal((await call(`/v1/client/sites/${site.body.id}/scan`, { method: 'POST', token: a.token })).status, 404);
  assert.equal((await call(`/v1/client/sites/${site.body.id}/health`, { token: b.token })).status, 200);
  assert.deepEqual((await call('/v1/client/sites', { token: a.token })).body, []);
});

test('view as client: a client session with the admin recorded, which cannot reach admin routes', async () => {
  const admin = await adminToken();
  const a = await clientWithLogin('Alpha Dental', 'alpha@example.com');
  const imp = await call(`/v1/admin/clients/${a.clientId}/impersonate`, { method: 'POST', token: admin });
  assert.equal(imp.status, 200);
  assert.equal(imp.body.user.role, 'client');
  assert.ok(imp.body.user.impersonatedBy);
  assert.ok(Date.parse(imp.body.expiresAt) - Date.now() <= 3600_000);
  assert.equal((await call('/v1/client/overview', { token: imp.body.token })).status, 200);
  assert.equal((await call('/v1/admin/overview', { token: imp.body.token })).status, 403);
  const me = await call('/v1/auth/me', { token: imp.body.token });
  assert.equal(me.body.impersonatorName, 'Owner');
  await call('/v1/client/tickets', { method: 'POST', token: imp.body.token, body: { subject: 'Test as client', body: 'Checking the portal.' } });
  assert.ok(rows("SELECT actor FROM studio_activity WHERE action = 'ticket.created'")[0].actor.includes('(via Owner)'));
});

/* ------------------------------------------------------------ pipeline from real leads */

function seedLeads() {
  const contactId = hex(1);
  const reportId = hex(2);
  const goneId = hex(3);
  sql(
    "INSERT INTO contact_submissions (id, name, email, company, project_type, problem, desired_outcome, timeline, budget_range, website, classification, notified, created_at) VALUES (?, 'Ada Lovelace', 'ada@example.com', 'Engines Ltd', 'Web Application', 'We need a booking portal for our workshops.', 'Bookings online', '1-3 months', '$5k-$15k', 'https://engines.example', '{}', 1, ?)",
    contactId,
    iso(2 * 86_400_000)
  );
  sql("INSERT INTO websites (id, host, url, created_at) VALUES ('w1', 'shop.example', 'https://shop.example/', ?)", iso());
  sql(
    "INSERT INTO audits (id, website_id, url, status, stage, stages, health_score, scores, created_at, completed_at, listed) VALUES (?, 'w1', 'https://shop.example/', 'completed', 'report', '[]', 64, ?, ?, ?, 1)",
    hex(50),
    JSON.stringify({ seo: 70, ai: 90, technical: 80 }),
    iso(),
    iso()
  );
  for (const [id, anonymized, name] of [[reportId, 0, 'Grace Hopper'], [goneId, 1, '']]) {
    sql(
      "INSERT INTO report_requests (id, audit_id, name, email, email_hash, company, note, consent_version, ip_key, status, anonymized, created_at, updated_at) VALUES (?, ?, ?, ?, 'h', NULL, 'Checkout is slow', 'v', 'k', 'sent', ?, ?, ?)",
      id,
      hex(50),
      name,
      anonymized ? '' : 'grace@example.com',
      anonymized,
      iso(86_400_000),
      iso()
    );
  }
  return { contactId, reportId, goneId };
}

test('prospects are the real leads: inquiries and report requests, with the audit score, anonymised ones skipped', async () => {
  const token = await adminToken();
  const { contactId, reportId } = seedLeads();
  const res = await call('/v1/admin/prospects', { token });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((p) => p.id), [`report-${reportId}`, `contact-${contactId}`]);
  const [report, contact] = res.body;
  assert.equal(report.source, 'Vector report');
  assert.equal(report.company, 'shop.example');
  assert.equal(report.healthScore, 64);
  assert.equal(report.visibility, 80);
  assert.equal(report.message, 'Checkout is slow');
  assert.equal(contact.source, 'Project inquiry');
  assert.equal(contact.company, 'Engines Ltd');
  assert.equal(contact.website, 'https://engines.example');
  assert.equal(contact.details.projectType, 'Web Application');
  assert.equal(contact.stage, 'new');
  assert.equal(contact.value, 0);
});

test('prospect updates live in the overlay, and converting creates the client once', async () => {
  const token = await adminToken();
  const { contactId } = seedLeads();
  const id = `contact-${contactId}`;
  const upd = await call(`/v1/admin/prospects/${id}`, { method: 'PATCH', token, body: { stage: 'proposal', value: 12000, notes: 'Wants it before March.' } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.stage, 'proposal');
  assert.equal(upd.body.value, 12000);
  const overlay = row('SELECT * FROM studio_prospects');
  assert.deepEqual([overlay.source, overlay.source_id, overlay.stage, overlay.notes], ['contact', contactId, 'proposal', 'Wants it before March.']);
  // The lead itself is untouched and not duplicated.
  assert.equal(row('SELECT COUNT(*) AS n FROM contact_submissions').n, 1);
  assert.equal((await call(`/v1/admin/prospects/${id}`, { method: 'PATCH', token, body: { stage: 'sideways' } })).status, 422);
  assert.equal((await call(`/v1/admin/prospects/contact-${hex(999)}`, { method: 'PATCH', token, body: { stage: 'won' } })).status, 404);

  const conv = await call(`/v1/admin/prospects/${id}/convert`, { method: 'POST', token, body: { plan: 'Scale' } });
  assert.equal(conv.status, 201, JSON.stringify(conv.body));
  assert.equal(conv.body.client.company, 'Engines Ltd');
  assert.equal(conv.body.client.plan, 'Scale');
  assert.equal(conv.body.client.mrr, 1850);
  assert.equal(conv.body.client.email, 'ada@example.com');
  assert.equal(conv.body.invite, null);
  assert.equal(conv.body.client.siteCount, 1); // the inquiry's website went into monitoring
  const after = (await call('/v1/admin/prospects', { token })).body.find((p) => p.id === id);
  assert.equal(after.stage, 'won');
  assert.equal(after.clientId, conv.body.client.id);
  assert.equal((await call(`/v1/admin/prospects/${id}/convert`, { method: 'POST', token, body: {} })).status, 409);
});

/* ------------------------------------------------------------ websites: Signal and Vector */

test('adding a site registers a studio Signal target and runs its first check', async () => {
  const token = await adminToken();
  const clientId = seedClient('Gamma Gym');
  const res = await call('/v1/admin/sites', { method: 'POST', token, body: { clientId, name: 'Gamma site', url: 'gamma-gym.example', platform: 'WordPress' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const target = row('SELECT * FROM monitoring_targets');
  assert.equal(target.source, 'studio');
  assert.equal(target.host, 'gamma-gym.example');
  assert.equal(target.name, 'gamma-gym.example'); // the client's site name stays out of Signal
  assert.equal(row('SELECT target_id FROM studio_sites').target_id, target.id);
  assert.equal(target.status, 'operational');
  assert.ok(rows("SELECT * FROM signal_events WHERE target_id = ? AND kind = 'check'", target.id).length >= 1);
  assert.equal(res.body.monitoring.targetId, target.id);
  assert.equal(res.body.sslDaysLeft, null);
  assert.equal(res.body.domainDaysLeft, null);
  assert.equal(res.body.health, null);

  // Studio targets are kept off the public board and the public events feed.
  assert.deepEqual(await (await h.call('/api/signal/targets')).json(), []);
  sql("INSERT INTO signal_events (id, target_id, kind, level, message, created_at) VALUES ('ev1', ?, 'incident', 'critical', 'Website unavailable', ?)", target.id, iso());
  assert.deepEqual(await (await h.call('/api/signal/events')).json(), []);

  // The same host again for this client is refused; an unsafe address is a 422.
  assert.equal((await call('/v1/admin/sites', { method: 'POST', token, body: { clientId, name: 'Again', url: 'https://gamma-gym.example/' } })).status, 409);
  const bad = await call('/v1/admin/sites', { method: 'POST', token, body: { clientId, name: 'Local', url: 'http://localhost:8080' } });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error.fields[0].field, 'url');
});

test('a host already registered by a public scan is reused and moved to the studio cadence', async () => {
  const token = await adminToken();
  const clientId = seedClient('Delta Plants');
  sql("INSERT INTO monitoring_targets (id, name, url, host, enabled, source, status, created_at) VALUES ('t-public', 'delta.example', 'https://delta.example/', 'delta.example', 1, 'public', 'operational', ?)", iso());
  const res = await call('/v1/admin/sites', { method: 'POST', token, body: { clientId, name: 'Delta', url: 'delta.example' } });
  assert.equal(res.status, 201);
  assert.equal(rows('SELECT * FROM monitoring_targets').length, 1);
  assert.equal(row("SELECT source FROM monitoring_targets WHERE id = 't-public'").source, 'studio');
  assert.equal(res.body.monitoring.targetId, 't-public');
  // Removing the site stops the checks.
  assert.equal((await call(`/v1/admin/sites/${res.body.id}`, { method: 'DELETE', token })).status, 200);
  assert.equal(row("SELECT enabled FROM monitoring_targets WHERE id = 't-public'").enabled, 0);
});

test('uptime comes from Signal checks rolled up by day; health from the latest Vector audit', async () => {
  const token = await adminToken();
  const clientId = seedClient('Epsilon Law');
  const site = (await call('/v1/admin/sites', { method: 'POST', token, body: { clientId, name: 'Epsilon', url: 'epsilon-law.example' } })).body;
  const targetId = site.monitoring.targetId;
  sql('DELETE FROM signal_events');
  const at = (min) => new Date(Date.now() - min * 60_000).toISOString();
  for (let i = 0; i < 9; i++) sql("INSERT INTO signal_events (id, target_id, kind, level, message, response_ms, created_at) VALUES (?, ?, 'check', 'info', 'Operational · 200 · 300 ms', 300, ?)", `c${i}`, targetId, at(i * 5 + 1));
  sql("INSERT INTO signal_events (id, target_id, kind, level, message, response_ms, created_at) VALUES ('down', ?, 'check', 'info', 'Unavailable · 503 · 900 ms', 900, ?)", targetId, at(50));
  sql("INSERT INTO signal_events (id, target_id, kind, level, message, status_code, created_at) VALUES ('inc', ?, 'incident', 'critical', 'Website unavailable', 503, ?)", targetId, at(50));
  sql("INSERT INTO signal_events (id, target_id, kind, level, message, created_at) VALUES ('rec', ?, 'recovered', 'info', 'Website recovered', ?)", targetId, at(45));
  await rollupUptime(h.env, Date.now(), { days: 2 });

  sql("INSERT INTO websites (id, host, url, created_at) VALUES ('w-eps', 'epsilon-law.example', 'https://epsilon-law.example/', ?)", iso());
  const scores = { technical: 90, seo: 60, performance: 80, accessibility: 100, security: 70, links: 100, content: 100, ai: 80 };
  const results = Object.entries(scores).map(([category, score]) => ({ category, score, metrics: category === 'links' ? { broken: ['https://epsilon-law.example/x'] } : {} }));
  const issues = [{ category: 'seo', code: 'no_description', severity: 'high', title: 'Missing meta description', evidence: 'None found.', explanation: 'Why.', recommendation: 'Add one.', impact: 'Better snippets.' }];
  sql(
    "INSERT INTO audits (id, website_id, url, status, stage, stages, health_score, scores, summary, results, issues, prescription, listed, created_at, completed_at) VALUES (?, 'w-eps', 'https://epsilon-law.example', 'completed', 'report', '[]', 84, ?, '{}', ?, ?, '[]', 0, ?, ?)",
    hex(60),
    JSON.stringify(scores),
    JSON.stringify(results),
    JSON.stringify(issues),
    iso(),
    iso()
  );

  const [summary] = (await call('/v1/admin/sites', { token })).body;
  assert.equal(summary.uptime30, 90);
  assert.equal(summary.avgResponseMs, 360);
  assert.equal(summary.incidents7d, 1);
  assert.equal(summary.health, 84);
  assert.equal(summary.visibility, 70);
  assert.equal(summary.openIssues, 1);

  const report = (await call(`/v1/admin/sites/${site.id}/health`, { token })).body;
  assert.equal(report.audit.health_score, 84);
  assert.equal(report.audit.issues[0].recommendation, 'Add one.');
  assert.equal(report.brokenLinks, 1);
  assert.equal(report.uptime.pct30, 90);
  assert.equal(report.uptime.incidents[0].minutes, 5);
  assert.equal(report.ssl.expiresAt, null);
});

test('an admin audit is a Vector examination, unlisted, polled until it finishes', async () => {
  const token = await adminToken();
  const page = '<!DOCTYPE html><html lang="en"><head><title>Prospect Studio home</title><meta name="viewport" content="width=device-width"></head><body><h1>Hello</h1><p>Words.</p></body></html>';
  h.respond = () => new Response(page, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  const start = await call('/v1/admin/audits', { method: 'POST', token, body: { url: 'prospect.example' } });
  assert.equal(start.status, 202, JSON.stringify(start.body));
  assert.equal(start.body.status, 'queued');
  assert.equal(row('SELECT listed FROM audits').listed, 0);
  const detail = await call(`/v1/admin/audits/${start.body.id}`, { token });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.audit.status, 'completed', JSON.stringify(detail.body.audit.error_message));
  assert.equal(detail.body.results.length, 8);
  assert.equal(typeof detail.body.audit.health_score, 'number');
  const list = (await call('/v1/admin/audits', { token })).body;
  assert.equal(list[0].id, start.body.id);
  assert.equal(list[0].source, 'studio');
  // Not on the public recent list.
  assert.deepEqual(await (await h.call('/api/vector/recent')).json(), []);
  assert.equal((await call('/v1/admin/audits', { method: 'POST', token, body: { url: 'http://127.0.0.1/' } })).status, 422);
});

/* ------------------------------------------------------------ support */

test('ticket SLA states follow services.py', () => {
  const t = (hoursAgo, sla, extra = {}) => ({ created_at: iso(hoursAgo * 3600_000), sla_hours: sla, status: 'open', first_reply_at: null, ...extra });
  assert.equal(slaState(t(1, 24)).slaState, 'pending');
  assert.equal(slaState(t(21, 24)).slaState, 'due_soon');
  assert.equal(slaState(t(3, 2)).slaState, 'breached');
  assert.equal(slaState(t(30, 24, { status: 'resolved' })).slaState, 'met');
  assert.equal(slaState(t(5, 8, { first_reply_at: iso(4 * 3600_000) })).slaState, 'met');
  const missed = slaState(t(10, 2, { first_reply_at: iso(5 * 3600_000) }));
  assert.equal(missed.slaState, 'missed');
  assert.equal(missed.firstResponseHours, 5);
});

test('ticket flow: client opens with the priority SLA, admin reply meets it, client reply reopens', async () => {
  const admin = await adminToken();
  const a = await clientWithLogin('Alpha Dental', 'alpha@example.com');
  const opened = (await call('/v1/client/tickets', { method: 'POST', token: a.token, body: { subject: 'Site is down', body: 'Nothing loads.', priority: 'urgent', category: 'incident' } })).body;
  assert.equal(opened.number, 1001);
  assert.equal(opened.slaHours, 2);
  assert.equal(opened.slaState, 'due_soon'); // a 2 h target is inside the 4 h "due soon" window from the start
  assert.equal(opened.messages.length, 1);
  const second = (await call('/v1/client/tickets', { method: 'POST', token: a.token, body: { subject: 'Another one', body: 'Low priority.', priority: 'low' } })).body;
  assert.equal(second.number, 1002);
  assert.equal(second.slaHours, 72);
  assert.equal(second.slaState, 'pending');

  const replied = (await call(`/v1/admin/tickets/${opened.id}/messages`, { method: 'POST', token: admin, body: { body: 'Looking now.' } })).body;
  assert.equal(replied.status, 'in_progress');
  assert.equal(replied.slaState, 'met');
  assert.equal(replied.messages.at(-1).role, 'admin');
  const resolved = (await call(`/v1/admin/tickets/${opened.id}`, { method: 'PATCH', token: admin, body: { status: 'resolved' } })).body;
  assert.equal(resolved.status, 'resolved');
  const reopened = (await call(`/v1/client/tickets/${opened.id}/messages`, { method: 'POST', token: a.token, body: { body: 'It is down again.' } })).body;
  assert.equal(reopened.status, 'open');
  const list = (await call('/v1/admin/tickets', { token: admin })).body;
  assert.equal(list.length, 2);
  assert.equal(list.find((x) => x.id === opened.id).lastMessage, 'It is down again.');
  assert.equal(list.find((x) => x.id === opened.id).messageCount, 3);
});

/* ------------------------------------------------------------ invoices */

test('invoice totals, numbering, overdue and payment', async () => {
  const admin = await adminToken();
  const a = await clientWithLogin('Alpha Dental', 'alpha@example.com');
  const inv = await call('/v1/admin/invoices', {
    method: 'POST',
    token: admin,
    body: { clientId: a.clientId, kind: 'project', dueInDays: 14, items: [{ description: 'Design', quantity: 2.5, unitPrice: 100.1 }, { description: 'Build', quantity: 1, unitPrice: 999.99 }] }
  });
  assert.equal(inv.status, 201, JSON.stringify(inv.body));
  assert.equal(inv.body.amount, 1250.24);
  assert.equal(inv.body.number, 'LD-2026001');
  assert.equal(inv.body.status, 'sent');
  const draft = (await call('/v1/admin/invoices', { method: 'POST', token: admin, body: { clientId: a.clientId, send: false, items: [{ description: 'Extra', quantity: 1, unitPrice: 50 }] } })).body;
  assert.equal(draft.number, 'LD-2026002');
  assert.equal(draft.status, 'draft');
  assert.equal((await call('/v1/admin/invoices', { method: 'POST', token: admin, body: { clientId: a.clientId, items: [] } })).status, 422);

  // Past its due date a sent invoice is overdue without anyone marking it.
  sql('UPDATE studio_invoices SET due_at = ? WHERE id = ?', day(-40), inv.body.id);
  const report = (await call('/v1/admin/invoices', { token: admin })).body;
  assert.equal(report.items.find((i) => i.id === inv.body.id).status, 'overdue');
  assert.equal(report.aging['31-60'], 1250.24);
  const billing = (await call('/v1/client/billing', { token: a.token })).body;
  assert.equal(billing.overdue, 1250.24);
  assert.equal(billing.invoices.length, 1); // the draft is not shown to the client
  const rowView = (await call('/v1/admin/clients', { token: admin })).body[0];
  assert.equal(rowView.overdue, 1250.24);
  assert.equal(rowView.churnRisk, 'medium');

  const paid = (await call(`/v1/admin/invoices/${inv.body.id}`, { method: 'PATCH', token: admin, body: { status: 'paid' } })).body;
  assert.equal(paid.status, 'paid');
  assert.equal(paid.paidAt, day(0));
  const ov = (await call('/v1/admin/overview', { token: admin })).body;
  assert.equal(ov.revenue.thisMonth, 1250.24);
  assert.equal(ov.receivables.overdue, 0);
});

/* ------------------------------------------------------------ invites */

test('invite flow: client created with portal access, link accepted once, then normal sign-in', async () => {
  const admin = await adminToken();
  const res = await call('/v1/admin/clients', { method: 'POST', token: admin, body: { company: 'Zeta Builders', contactName: 'Zoe Zeta', email: 'Zoe@Zeta.example', plan: 'Essentials', portalAccess: true } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.client.mrr, 390);
  const { token, email, expiresAt } = res.body.invite;
  assert.equal(email, 'zoe@zeta.example');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(Date.parse(expiresAt) - Date.now() > 6.9 * 86_400_000);
  const user = row('SELECT * FROM studio_users WHERE email = ?', 'zoe@zeta.example');
  assert.equal(user.disabled, 1);
  assert.equal(user.password_hash, null);
  assert.notEqual(row('SELECT token_hash FROM studio_invites').token_hash, token);
  assert.equal((await call('/v1/auth/login', { method: 'POST', body: { email, password: 'anything-at-all' } })).status, 401);
  // A portal user needs a unique address.
  assert.equal((await call('/v1/admin/clients', { method: 'POST', token: admin, body: { company: 'Copy', contactName: 'Zoe Two', email, portalAccess: true } })).status, 409);

  const info = await call('/v1/auth/invite-info', { method: 'POST', body: { token } });
  assert.equal(info.status, 200);
  assert.equal(info.body.company, 'Zeta Builders');
  assert.equal((await call('/v1/auth/accept-invite', { method: 'POST', body: { token, password: 'short' } })).status, 422);
  const accepted = await call('/v1/auth/accept-invite', { method: 'POST', body: { token, password: 'a-long-new-password' } });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.user.role, 'client');
  assert.equal((await call('/v1/client/overview', { token: accepted.body.token })).status, 200);
  assert.equal((await call('/v1/auth/accept-invite', { method: 'POST', body: { token, password: 'another-long-password' } })).status, 404);
  assert.ok(await signIn('zoe@zeta.example', 'a-long-new-password'));

  // A new invite resets the password and ends the old sessions.
  const again = await call(`/v1/admin/clients/${res.body.client.id}/invite`, { method: 'POST', token: admin, body: {} });
  assert.equal(again.status, 201);
  await call('/v1/auth/accept-invite', { method: 'POST', body: { token: again.body.invite.token, password: 'the-reset-password' } });
  assert.equal((await call('/v1/client/overview', { token: accepted.body.token })).status, 401);

  sql('UPDATE studio_invites SET expires_at = ?', iso(1000));
  const third = await call(`/v1/admin/clients/${res.body.client.id}/invite`, { method: 'POST', token: admin, body: {} });
  sql('UPDATE studio_invites SET expires_at = ?', iso(1000));
  assert.equal((await call('/v1/auth/invite-info', { method: 'POST', body: { token: third.body.invite.token } })).status, 404);
});

/* ------------------------------------------------------------ command centre and empty states */

test('a brand-new studio (no clients, no leads) gets sensible empty views', async () => {
  const token = await adminToken();
  const ov = (await call('/v1/admin/overview', { token })).body;
  assert.equal(ov.mrr, 0);
  assert.equal(ov.sites.total, 0);
  assert.equal(ov.sites.avgHealth, null);
  assert.equal(ov.support.avgFirstResponseHours, null);
  assert.equal(ov.pipeline.winRate, null);
  assert.equal(ov.revenue.series.length, 12);
  assert.deepEqual(ov.attention, []);
  for (const path of ['/v1/admin/clients', '/v1/admin/sites', '/v1/admin/prospects', '/v1/admin/projects', '/v1/admin/tickets', '/v1/admin/audits']) {
    assert.deepEqual((await call(path, { token })).body, [], path);
  }
  assert.deepEqual((await call('/v1/admin/invoices', { token })).body.items, []);
  assert.deepEqual((await call('/v1/admin/worklog', { token })).body.perClient, []);
  assert.equal((await call('/v1/admin/settings', { token })).body.team.length, 1);
});

test('overview numbers: MRR, client counts, pipeline, capacity, renewals, attention', async () => {
  const token = await adminToken();
  const active = seedClient('Active Co', { plan: 'Growth', mrr: 890, hours: 6, renewal: day(20) });
  seedClient('Onboarding Co', { plan: 'Essentials', status: 'onboarding', mrr: 390, hours: 2 });
  seedClient('Paused Co', { plan: 'Scale', status: 'paused', mrr: 1850, hours: 15 });
  seedClient('Gone Co', { plan: 'Scale', status: 'churned', mrr: 1850, hours: 15 });
  seedLeads();
  await call(`/v1/admin/prospects/contact-${hex(1)}`, { method: 'PATCH', token, body: { stage: 'call_booked', value: 5000 } });
  await call(`/v1/admin/prospects/report-${hex(2)}`, { method: 'PATCH', token, body: { stage: 'lost' } });
  await call('/v1/admin/worklog', { method: 'POST', token, body: { clientId: active, date: day(0), category: 'maintenance', title: 'Plugin updates', minutes: 120 } });
  const project = (await call('/v1/admin/projects', { method: 'POST', token, body: { clientId: active, name: 'Rebuild', dueDate: day(30), budget: 9000, hoursBudget: 60 } })).body;
  await call(`/v1/admin/projects/${project.id}/milestones`, { method: 'POST', token, body: { title: 'Homepage design', dueDate: day(10) } });
  const withMs = (await call('/v1/admin/projects', { token })).body[0];
  await call(`/v1/admin/projects/${project.id}/milestones/${withMs.milestones[0].id}`, { method: 'PATCH', token, body: { status: 'awaiting_approval' } });

  const ov = (await call('/v1/admin/overview', { token })).body;
  assert.equal(ov.mrr, 1280);
  assert.equal(ov.arr, 15360);
  assert.deepEqual(ov.clients, { active: 1, onboarding: 1, paused: 1, churned: 1 });
  assert.deepEqual(ov.mrrByPlan.map((p) => [p.plan, p.clients, p.mrr]), [['Essentials', 1, 390], ['Growth', 1, 890], ['Scale', 0, 0]]);
  assert.equal(ov.pipeline.openCount, 1);
  assert.equal(ov.pipeline.openValue, 5000);
  assert.equal(ov.pipeline.winRate, 0);
  assert.equal(ov.capacity.hoursUsed, 2);
  assert.equal(ov.capacity.hoursIncluded, 8);
  assert.equal(ov.capacity.utilisation, 25);
  assert.equal(ov.projects.active, 1);
  assert.deepEqual(ov.renewals.map((r) => [r.company, r.days]), [['Active Co', 20]]);
  assert.ok(ov.attention.some((a) => a.kind === 'approval' && a.title.includes('Homepage design')));
  assert.ok(ov.activity.some((a) => a.action === 'work.logged'));

  // The client approves it from the portal.
  await seedUser({ email: 'active@example.com', role: 'client', clientId: active });
  const ct = await signIn('active@example.com');
  const cov = (await call('/v1/client/overview', { token: ct })).body;
  assert.equal(cov.approvals.length, 1);
  assert.equal(cov.hours.used, 2);
  assert.equal(cov.scores.health, null);
  const approved = await call(`/v1/client/projects/${project.id}/milestones/${withMs.milestones[0].id}/approve`, { method: 'POST', token: ct });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.milestones[0].status, 'done');
  assert.ok(approved.body.milestones[0].approvedBy);
  assert.equal((await call(`/v1/client/projects/${project.id}/milestones/${withMs.milestones[0].id}/approve`, { method: 'POST', token: ct })).status, 409);
  const month = day(0).slice(0, 7);
  const rep = (await call(`/v1/client/reports/${month}`, { token: ct })).body;
  assert.equal(rep.work.hours, 2);
  assert.equal(rep.uptime, null);
  assert.equal((await call('/v1/client/reports/2026-13', { token: ct })).status, 422);
});

test('the dashboard origin passes preflight for every method it uses', async () => {
  h.env.STUDIO_ORIGINS = 'http://localhost:5174';
  const res = await h.call('/api/studio/v1/admin/sites/x', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5174', 'Access-Control-Request-Method': 'DELETE', 'Access-Control-Request-Headers': 'authorization, content-type' }
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5174');
  for (const m of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) assert.match(res.headers.get('access-control-allow-methods'), new RegExp(m));
  assert.match(res.headers.get('access-control-allow-headers'), /Authorization/);
  const got = await h.call('/api/studio/health', { headers: { Origin: 'http://localhost:5174' } });
  assert.equal(got.headers.get('access-control-allow-origin'), 'http://localhost:5174');
});
