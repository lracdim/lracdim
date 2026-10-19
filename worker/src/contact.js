/**
 * Project intake: validate, classify (rule-based, internal only), persist,
 * notify. Ported from the Python API's routes/contact.py and
 * services/contact_service.py; the request and response shapes are the same.
 */
import { error, json, safeEqual } from './http.js';
import { hit } from './ratelimit.js';
import { acknowledge, notify } from './notify.js';

export const PROJECT_TYPES = ['Website', 'Web Application', 'Business System', 'Automation', 'Data / Analytics', 'AI System', 'Other'];

const KEYWORDS = {
  'Application Development': ['app', 'portal', 'dashboard', 'login', 'account', 'users', 'platform', 'lms', 'hrms', 'booking'],
  'WordPress Development': ['wordpress', 'wp', 'elementor', 'plugin', 'theme'],
  Automation: ['automat', 'n8n', 'zapier', 'workflow', 'email', 'notification', 'pipeline', 'sync'],
  'Database Engineering': ['database', 'postgres', 'records', 'reporting', 'report', 'data', 'csv', 'spreadsheet', 'excel'],
  'SEO and Performance': ['seo', 'google', 'ranking', 'traffic', 'slow', 'speed', 'performance'],
  'AI Integration': ['ai', 'chatbot', 'gpt', 'llm', 'assistant']
};

const BASE_COMPLEXITY = { Website: 1, 'Web Application': 3, 'Business System': 3, Automation: 2, 'Data / Analytics': 2, 'AI System': 3, Other: 2 };

/** Rule-based recommendation for triage. Not a promise, not shown to the submitter. */
export function classify(projectType, text, budget, timeline) {
  const lowered = text.toLowerCase();
  const services = Object.keys(KEYWORDS).filter((name) => KEYWORDS[name].some((w) => lowered.includes(w)));
  const score = (BASE_COMPLEXITY[projectType] ?? 2) + Math.min(2, Math.floor(services.length / 2)) + (text.length > 600 ? 1 : 0);
  return {
    project_type: projectType,
    complexity: score <= 2 ? 'Low' : score <= 3 ? 'Medium' : 'High',
    likely_services: services.length ? services : ['Discovery call'],
    urgency: (timeline || '').toLowerCase().startsWith('as soon') ? 'High' : 'Normal',
    budget_range: budget || 'undisclosed',
    method: 'keyword rules v1'
  };
}

// [required, min, max] per text field.
const TEXT_FIELDS = {
  name: [true, 2, 120],
  company: [false, 0, 160],
  problem: [true, 10, 5000],
  current_system: [false, 0, 2000],
  desired_outcome: [false, 0, 2000],
  timeline: [false, 0, 64],
  budget_range: [false, 0, 64],
  additional: [false, 0, 5000],
  website: [false, 0, 2048]
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns {data, fields}; `fields` lists every rejected field, in form order. */
export function validate(body) {
  const fields = [];
  const data = {};
  const reject = (field, message) => fields.push({ field, message });

  const text = (key) => {
    const [required, min, max] = TEXT_FIELDS[key];
    const v = body[key];
    if (v === undefined || v === null || v === '') {
      if (required) reject(key, 'This field is required.');
      return null;
    }
    if (typeof v !== 'string') return reject(key, 'Must be text.'), null;
    const t = v.trim();
    if (required && t.length < min) return reject(key, `Must be at least ${min} characters.`), null;
    if (t.length > max) return reject(key, `Must be at most ${max} characters.`), null;
    return t || null;
  };

  data.name = text('name');
  const email = body.email;
  if (typeof email !== 'string' || !email.trim()) reject('email', 'This field is required.');
  else if (email.trim().length > 255 || !EMAIL.test(email.trim())) reject('email', 'Enter a valid email address.');
  else data.email = email.trim().toLowerCase();
  data.company = text('company');
  if (!PROJECT_TYPES.includes(body.project_type)) reject('project_type', `Must be one of: ${PROJECT_TYPES.join(', ')}`);
  else data.project_type = body.project_type;
  for (const key of ['problem', 'current_system', 'desired_outcome', 'timeline', 'budget_range', 'additional', 'website']) {
    data[key] = text(key);
  }
  return { data, fields };
}

export async function createSubmission(env, data) {
  const text = [data.problem, data.current_system, data.desired_outcome, data.additional].map((v) => v || '').join(' ');
  const row = {
    id: crypto.randomUUID().replace(/-/g, ''),
    ...data,
    classification: classify(data.project_type, text, data.budget_range, data.timeline),
    created_at: new Date().toISOString()
  };
  await env.DB.prepare(
    'INSERT INTO contact_submissions (id, name, email, company, project_type, problem, current_system, desired_outcome, ' +
      'timeline, budget_range, additional, website, classification, notified, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)'
  )
    .bind(row.id, row.name, row.email, row.company, row.project_type, row.problem, row.current_system, row.desired_outcome,
      row.timeline, row.budget_range, row.additional, row.website, JSON.stringify(row.classification), row.created_at)
    .run();
  return row;
}

const MAX_BODY = 64 * 1024;

export async function submit(request, env, ctx) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await hit(env, ctx, 'contact', ip, env.RATE_LIMIT_CONTACT || '5/hour'))) {
    return error(429, 'rate_limited', 'Too many requests. Try again later.');
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return error(413, 'too_large', 'The request is too large.');
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error(422, 'validation', 'The request body must be a JSON object.');

  if (typeof body.honeypot === 'string' && body.honeypot.trim()) {
    // Bots fill the hidden field. Acknowledge without storing or notifying.
    return json({ id: '0'.repeat(32), received: true, notified: false }, 201);
  }

  const { data, fields } = validate(body);
  if (fields.length) return error(422, 'validation', `${fields[0].field}: ${fields[0].message}`, fields);

  const row = await createSubmission(env, data);
  const delivered = await notify(env, `[LRACDIMENSION] New project inquiry: ${row.project_type} — ${row.name}`, {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    project_type: row.project_type,
    problem: row.problem,
    current_system: row.current_system,
    desired_outcome: row.desired_outcome,
    timeline: row.timeline,
    budget_range: row.budget_range,
    website: row.website,
    classification: row.classification
  });
  const notified = Object.values(delivered).some(Boolean);
  if (notified) await env.DB.prepare('UPDATE contact_submissions SET notified = 1 WHERE id = ?').bind(row.id).run();
  ctx.waitUntil(acknowledge(env, row.email, row.name, row.project_type, row.id));
  return json({ id: row.id, received: true, notified }, 201);
}

/** Admin: the latest 100 submissions. Same shape as the Python endpoint. */
export async function submissions(request, env) {
  const key = request.headers.get('X-Admin-Key') || '';
  if (!env.ADMIN_KEY || !(await safeEqual(key, env.ADMIN_KEY))) return error(401, 'unauthorized', 'An admin key is required.');
  const { results } = await env.DB.prepare(
    'SELECT id, created_at, name, email, company, project_type, timeline, budget_range, classification, notified ' +
      'FROM contact_submissions ORDER BY created_at DESC LIMIT 100'
  ).all();
  return json(results.map((r) => ({ ...r, classification: JSON.parse(r.classification || '{}'), notified: !!r.notified })));
}
