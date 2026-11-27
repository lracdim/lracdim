/**
 * Studio sign-in: password hashes, bearer sessions, portal invites.
 *
 * - Passwords: PBKDF2-SHA256, 100,000 iterations (the most WebCrypto in a
 *   Worker allows), 16-byte random salt, stored as
 *   `pbkdf2$100000$<salt base64>$<hash base64>`. scripts/studio-create-admin.mjs
 *   computes the same format with node:crypto.
 * - Sessions: 32 random bytes, base64url, sent as `Authorization: Bearer`.
 *   Only the token's SHA-256 is stored, with a 12-hour expiry; signing out
 *   deletes the row. An admin's "view as client" session belongs to the client
 *   user and records the admin in impersonator_id (one hour).
 * - Invites: a client user is created disabled and without a password. The
 *   admin gets a one-time link (token SHA-256 stored, 7 days); accepting it sets
 *   the password, enables the user and signs them in. Issuing a new invite to an
 *   active user works as an admin-initiated password reset.
 * - Login is rate limited per IP and per address and always answers the same
 *   generic message, after the same amount of hashing work, whether or not the
 *   address exists.
 */
import { clientIp } from '../http.js';
import { hit } from '../ratelimit.js';
import { b64url, ipHash, normalizeEmail, sha256Hex, timingSafeEqual } from '../secure.js';
import { HttpError, Invalid, actorName, batch, first, logStmt, newId, nowIso, run, stmt, str } from './util.js';

export const PBKDF2_ITERATIONS = 100_000;
export const SESSION_MS = 12 * 3600_000;
export const IMPERSONATION_MS = 3600_000;
export const INVITE_MS = 7 * 86_400_000;
export const MIN_PASSWORD = 10;
const MAX_PASSWORD = 200; // bounds the hashing work a request can ask for

const enc = new TextEncoder();
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(await pbkdf2(password, salt, PBKDF2_ITERATIONS))}`;
}

// Hashed against when there is no stored hash, so a missing account costs the same time as a wrong password.
const DUMMY_HASH = `pbkdf2$${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

export async function verifyPassword(password, stored) {
  let parts = String(stored || '').split('$');
  const usable = parts.length === 4 && parts[0] === 'pbkdf2' && Number(parts[1]) >= 1 && Number(parts[1]) <= PBKDF2_ITERATIONS;
  if (!usable) parts = DUMMY_HASH.split('$');
  let salt;
  try {
    salt = fromB64(parts[2]);
  } catch {
    salt = fromB64(DUMMY_HASH.split('$')[2]);
  }
  const got = toB64(await pbkdf2(String(password), salt, Number(parts[1])));
  return usable && timingSafeEqual(got, parts[3]);
}

export const newToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const tokenHash = (token) => sha256Hex(`studio-token:v1:${token}`);

/** The user as the API returns it: never the hash. */
export function publicUser(u, impersonator = null) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    clientId: u.client_id ?? null,
    active: !u.disabled && Boolean(u.password_hash),
    invited: !u.password_hash,
    lastLoginAt: u.last_login_at ?? null,
    createdAt: u.created_at,
    impersonatedBy: impersonator ? impersonator.id : null,
    impersonatorName: impersonator ? impersonator.name : null
  };
}

/** Statements that create a session; returns {token, expiresAt, statements}. */
async function sessionStatements(env, request, userId, { impersonatorId = null, ttl = SESSION_MS } = {}) {
  const token = newToken();
  const now = Date.now();
  const expiresAt = new Date(now + ttl).toISOString();
  const statements = [
    stmt(env, 'INSERT INTO studio_sessions (token_hash, user_id, impersonator_id, expires_at, created_at, ip_key) VALUES (?, ?, ?, ?, ?, ?)', await tokenHash(token), userId, impersonatorId, expiresAt, new Date(now).toISOString(), await ipHash(env, clientIp(request))),
    // Expired sessions are swept whenever a new one starts; the index makes this cheap.
    stmt(env, 'DELETE FROM studio_sessions WHERE expires_at < ?', new Date(now).toISOString())
  ];
  return { token, expiresAt, statements };
}

export async function startImpersonation(env, request, admin, clientUser) {
  const s = await sessionStatements(env, request, clientUser.id, { impersonatorId: admin.id, ttl: IMPERSONATION_MS });
  return s;
}

/**
 * The signed-in user for a request, or throws 401. Returns the public user
 * plus `sessionHash` (for sign-out) and `impersonating`.
 */
export async function authenticate(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'unauthorized', 'Sign in required.');
  if (!TOKEN.test(token)) throw new HttpError(401, 'session_expired', 'Your session has expired. Sign in again.');
  const hash = await tokenHash(token);
  const row = await first(
    env,
    'SELECT s.expires_at AS session_expires_at, s.impersonator_id, u.*, i.name AS imp_name, i.role AS imp_role, i.disabled AS imp_disabled ' +
      'FROM studio_sessions s JOIN studio_users u ON u.id = s.user_id LEFT JOIN studio_users i ON i.id = s.impersonator_id WHERE s.token_hash = ?',
    hash
  );
  if (!row || row.session_expires_at <= nowIso()) {
    if (row) await run(env, 'DELETE FROM studio_sessions WHERE token_hash = ?', hash);
    throw new HttpError(401, 'session_expired', 'Your session has expired. Sign in again.');
  }
  let impersonator = null;
  if (row.impersonator_id) {
    // A "view as client" session lives only as long as the admin behind it.
    if (row.imp_role !== 'admin' || row.imp_disabled) throw new HttpError(401, 'session_expired', 'Your session has expired. Sign in again.');
    impersonator = { id: row.impersonator_id, name: row.imp_name };
  } else if (row.disabled) {
    throw new HttpError(401, 'account_disabled', 'This account is not available.');
  }
  return { ...publicUser(row, impersonator), sessionHash: hash, impersonating: Boolean(impersonator) };
}

/* ------------------------------------------------------------ routes */

const GENERIC_LOGIN = 'Email or password is incorrect.';

export async function login({ request, env, ctx, body }) {
  const ip = clientIp(request);
  if (!(await hit(env, ctx, 'studio_login', ip, env.RATE_LIMIT_STUDIO_LOGIN || '10/hour'))) {
    throw new HttpError(429, 'rate_limited', 'Too many sign-in attempts. Try again later.');
  }
  const address = normalizeEmail(str(body, 'email', { min: 3, max: 200, required: true }));
  const password = body.password;
  if (typeof password !== 'string' || !password) throw new Invalid('password', 'This field is required.');
  if (password.length > MAX_PASSWORD) throw new HttpError(401, 'invalid_credentials', GENERIC_LOGIN);
  // A second limit per address slows guessing one account from many IPs.
  if (!(await hit(env, ctx, 'studio_login_email', `email:${address}`, env.RATE_LIMIT_STUDIO_LOGIN_EMAIL || '20/hour'))) {
    throw new HttpError(429, 'rate_limited', 'Too many sign-in attempts. Try again later.');
  }
  const user = await first(env, 'SELECT * FROM studio_users WHERE email = ?', address);
  const ok = await verifyPassword(password, user?.password_hash);
  if (!user || !ok || user.disabled) throw new HttpError(401, 'invalid_credentials', GENERIC_LOGIN);
  const s = await sessionStatements(env, request, user.id);
  const now = nowIso();
  await batch(env, [...s.statements, stmt(env, 'UPDATE studio_users SET last_login_at = ? WHERE id = ?', now, user.id), logStmt(env, user.name, 'auth.login', user.email)]);
  return { token: s.token, expiresAt: s.expiresAt, user: publicUser({ ...user, last_login_at: now }) };
}

export async function logout({ env, user }) {
  await run(env, 'DELETE FROM studio_sessions WHERE token_hash = ?', user.sessionHash);
  return { ok: true };
}

/** Statements creating a fresh invite for a user (older ones are withdrawn). */
export async function inviteStatements(env, userId, createdBy) {
  const token = newToken();
  const now = Date.now();
  const expiresAt = new Date(now + INVITE_MS).toISOString();
  return {
    token,
    expiresAt,
    statements: [
      stmt(env, 'DELETE FROM studio_invites WHERE user_id = ?', userId),
      stmt(env, 'INSERT INTO studio_invites (token_hash, user_id, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', await tokenHash(token), userId, createdBy, expiresAt, new Date(now).toISOString())
    ]
  };
}

async function findInvite(env, token) {
  if (typeof token !== 'string' || !TOKEN.test(token)) return null;
  return first(
    env,
    'SELECT i.token_hash, i.expires_at, u.*, c.company FROM studio_invites i JOIN studio_users u ON u.id = i.user_id LEFT JOIN studio_clients c ON c.id = u.client_id WHERE i.token_hash = ? AND i.expires_at > ?',
    await tokenHash(token),
    nowIso()
  );
}

const INVALID_INVITE = 'This invite link is invalid or has expired. Ask the studio for a new one.';

async function inviteLimit(request, env, ctx) {
  if (!(await hit(env, ctx, 'studio_invite', clientIp(request), env.RATE_LIMIT_STUDIO_INVITE || '20/hour'))) {
    throw new HttpError(429, 'rate_limited', 'Too many attempts. Try again later.');
  }
}

/** POST, so the token never lands in a URL or a log line. */
export async function inviteInfo({ request, env, ctx, body }) {
  await inviteLimit(request, env, ctx);
  const inv = await findInvite(env, body.token);
  if (!inv) throw new HttpError(404, 'invite_invalid', INVALID_INVITE);
  return { email: inv.email, name: inv.name, company: inv.company ?? null, expiresAt: inv.expires_at, reset: Boolean(inv.password_hash) };
}

export async function acceptInvite({ request, env, ctx, body }) {
  await inviteLimit(request, env, ctx);
  const password = body.password;
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) throw new Invalid('password', `Use at least ${MIN_PASSWORD} characters.`);
  if (password.length > MAX_PASSWORD) throw new Invalid('password', `Use at most ${MAX_PASSWORD} characters.`);
  const inv = await findInvite(env, body.token);
  if (!inv) throw new HttpError(404, 'invite_invalid', INVALID_INVITE);
  const hash = await hashPassword(password);
  const s = await sessionStatements(env, request, inv.id);
  const now = nowIso();
  await batch(env, [
    stmt(env, 'UPDATE studio_users SET password_hash = ?, disabled = 0, last_login_at = ? WHERE id = ?', hash, now, inv.id),
    stmt(env, 'DELETE FROM studio_invites WHERE user_id = ?', inv.id),
    // A new password ends every earlier session of this account.
    stmt(env, 'DELETE FROM studio_sessions WHERE user_id = ?', inv.id),
    ...s.statements,
    logStmt(env, inv.name, inv.password_hash ? 'auth.password_reset' : 'auth.invite_accepted', inv.email)
  ]);
  const user = await first(env, 'SELECT * FROM studio_users WHERE id = ?', inv.id);
  return { token: s.token, expiresAt: s.expiresAt, user: publicUser(user) };
}

export const me = ({ user }) => {
  const { sessionHash, impersonating, ...out } = user; // eslint-disable-line no-unused-vars
  return out;
};

export { actorName };
