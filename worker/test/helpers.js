/**
 * Test harness: D1 as a thin adapter over node:sqlite loaded with the real
 * migrations, fetch replaced by a recorder with a per-test responder, and a
 * `call` helper that runs the Worker and waits for its background work. No
 * test touches the network or Cloudflare.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import worker from '../src/index.js';

const MIGRATIONS = readdirSync(new URL('../migrations/', import.meta.url))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));

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

export function d1() {
  const db = new DatabaseSync(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  return {
    raw: db,
    prepare: (sql) => new Statement(db, sql),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
  };
}

export const SITE = 'https://www.lracdimension.online';
export const BASE_ENV = {
  CORS_ORIGINS: `${SITE},https://lracdimension.online,https://lracdimension.vercel.app`,
  RATE_LIMIT_CONTACT: '5/hour',
  RATE_LIMIT_AUDITS: '6/hour',
  RATE_LIMIT_TOOLS: '60/hour',
  RATE_LIMIT_SIGNAL: '10/hour',
  RATE_LIMIT_SALT: 'salt',
  ADMIN_KEY: 'admin-secret'
};

/** A public DNS answer for DNS-over-HTTPS lookups made by the SSRF check. */
export function dohAnswer(url, ip = '93.184.215.14') {
  const type = new URL(url).searchParams.get('type');
  const answer = type === 'A' ? [{ type: 1, data: ip }] : [];
  return new Response(JSON.stringify({ Status: 0, Answer: answer }), { headers: { 'Content-Type': 'application/dns-json' } });
}

/** Fresh environment, recorder and responder for one test. */
export function setup() {
  const h = {
    env: { ...BASE_ENV, DB: d1() },
    calls: [],
    pending: [],
    respond: () => new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }),
    realFetch: globalThis.fetch
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init.headers || {}).entries());
    let body = init.body;
    if (body instanceof ArrayBuffer) body = new TextDecoder().decode(body);
    h.calls.push({ url, method: init.method || 'GET', headers, redirect: init.redirect, body: typeof body === 'string' && body.startsWith('{') ? JSON.parse(body) : body });
    if (url.startsWith('https://cloudflare-dns.com/dns-query')) return dohAnswer(url);
    return h.respond(url, init);
  };
  h.restore = () => {
    globalThis.fetch = h.realFetch;
  };
  h.ctx = () => ({ waitUntil: (p) => h.pending.push(p) });
  h.call = async (path, { method = 'GET', body, headers = {}, ip = '203.0.113.7' } = {}) => {
    const init = { method, headers: { Origin: SITE, 'CF-Connecting-IP': ip, ...headers } };
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
      init.headers['Content-Type'] = 'application/json';
    }
    const res = await worker.fetch(new Request(`https://lracdim-api.example.workers.dev${path}`, init), h.env, h.ctx());
    await Promise.all(h.pending.splice(0));
    return res;
  };
  h.rows = (table) => h.env.DB.raw.prepare(`SELECT * FROM ${table}`).all();
  /** Calls other than DNS lookups. */
  h.outbound = () => h.calls.filter((c) => !c.url.startsWith('https://cloudflare-dns.com/'));
  return h;
}
