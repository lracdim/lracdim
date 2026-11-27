/**
 * Small helpers shared by the studio modules: query shorthands, dates, request
 * validation and the activity log.
 *
 * Validation throws `Invalid`; the router turns it into the Worker's usual 422
 * envelope, {error: {code: 'validation', message, fields: [{field, message}]}}.
 * Request and response fields are camelCase, as the Python engine's were.
 */
import { newId, nowIso } from '../http.js';

export { newId, nowIso };

/* ------------------------------------------------------------ queries */

/** D1 rejects `undefined` bindings; the studio code treats it as NULL. */
const clean = (args) => args.map((a) => (a === undefined ? null : a));

export const stmt = (env, sql, ...args) => env.DB.prepare(sql).bind(...clean(args));
export const all = async (env, sql, ...args) => (await stmt(env, sql, ...args).all()).results || [];
export const first = (env, sql, ...args) => stmt(env, sql, ...args).first();
export const run = (env, sql, ...args) => stmt(env, sql, ...args).run();
/** Writes that must land together. D1 runs a batch as one transaction. */
export const batch = (env, statements) => (statements.length ? env.DB.batch(statements) : Promise.resolve([]));

export function parseJson(v, fallback) {
  if (v === null || v === undefined || v === '') return fallback;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------ dates (UTC) */

export const DAY_MS = 86_400_000;
export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export const thisMonth = (now = Date.now()) => today(now).slice(0, 7);
export const addDays = (isoDay, n) => new Date(Date.parse(`${isoDay}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const daysUntil = (isoDay, now = Date.now()) =>
  isoDay ? Math.round((Date.parse(`${String(isoDay).slice(0, 10)}T00:00:00Z`) - Date.parse(`${today(now)}T00:00:00Z`)) / DAY_MS) : null;
export const monthRange = (month) => {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // day 0 of the next month
  return { start, end };
};
export const previousMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 15)).toISOString().slice(0, 7);
};

export const round1 = (n) => Math.round(n * 10) / 10;
export const money = (n) => Math.round(n * 100) / 100;
export const sum = (rows, f) => rows.reduce((a, r) => a + (Number(f(r)) || 0), 0);
export const avg = (values) => (values.length ? sum(values, (v) => v) / values.length : null);

/* ------------------------------------------------------------ validation */

export class Invalid extends Error {
  constructor(field, message) {
    super(`${field}: ${message}`);
    this.field = field;
    this.detail = message;
  }
}

/** Throws Invalid when an HTTP-level problem should answer 4xx with a custom code. */
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { status, code });
  }
}

export const notFound = (what = 'Not found.') => new HttpError(404, 'not_found', what);
export const conflict = (message) => new HttpError(409, 'conflict', message);

const present = (v) => v !== undefined && v !== null && v !== '';

export function str(body, field, { min = 0, max = 5000, required = false, fallback = null } = {}) {
  const v = body[field];
  if (!present(v)) {
    if (required) throw new Invalid(field, 'This field is required.');
    return fallback;
  }
  if (typeof v !== 'string') throw new Invalid(field, 'Must be text.');
  const t = v.trim();
  if (required && !t) throw new Invalid(field, 'This field is required.');
  if (t.length < min) throw new Invalid(field, `Must be at least ${min} characters.`);
  if (t.length > max) throw new Invalid(field, `Must be at most ${max} characters.`);
  return t;
}

export function oneOf(body, field, values, { required = false, fallback = null } = {}) {
  const v = body[field];
  if (!present(v)) {
    if (required) throw new Invalid(field, 'This field is required.');
    return fallback;
  }
  if (!values.includes(v)) throw new Invalid(field, `Must be one of: ${values.join(', ')}.`);
  return v;
}

export function number(body, field, { min = -Infinity, max = Infinity, integer = false, required = false, fallback = null } = {}) {
  const v = body[field];
  if (!present(v)) {
    if (required) throw new Invalid(field, 'This field is required.');
    return fallback;
  }
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new Invalid(field, 'Must be a number.');
  if (integer && !Number.isInteger(n)) throw new Invalid(field, 'Must be a whole number.');
  if (n < min || n > max) throw new Invalid(field, `Must be from ${min} to ${max}.`);
  return n;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date as YYYY-MM-DD (the first ten characters of an ISO timestamp are accepted). */
export function day(body, field, { required = false, fallback = null } = {}) {
  const v = body[field];
  if (!present(v)) {
    if (required) throw new Invalid(field, 'This field is required.');
    return fallback;
  }
  const d = String(v).slice(0, 10);
  if (!ISO_DAY.test(d) || new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d) throw new Invalid(field, 'Dates must be YYYY-MM-DD.');
  return d;
}

export function bool(body, field, fallback = false) {
  const v = body[field];
  if (!present(v)) return fallback;
  if (typeof v !== 'boolean') throw new Invalid(field, 'Must be true or false.');
  return v;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function email(body, field, { required = true } = {}) {
  const v = str(body, field, { min: 3, max: 200, required });
  if (v === null) return null;
  if (!EMAIL.test(v)) throw new Invalid(field, 'Enter a valid email address.');
  return v.toLowerCase();
}

export const isMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));

/* ------------------------------------------------------------ activity log */

/** The actor recorded for a user; an admin viewing as a client is named too. */
export const actorName = (user) => (user.impersonatorName ? `${user.name} (via ${user.impersonatorName})` : user.name);

/** A prepared insert into studio_activity, so it can join the batch of the change it records. */
export const logStmt = (env, actor, action, target, detail = '') =>
  stmt(env, 'INSERT INTO studio_activity (at, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)', nowIso(), String(actor).slice(0, 200), action, String(target || '').slice(0, 300), String(detail || '').slice(0, 500));

export const activityOut = (a) => ({ id: String(a.id), at: a.at, actor: a.actor, action: a.action, target: a.target, detail: a.detail });
