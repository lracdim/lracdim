#!/usr/bin/env node
/**
 * Create (or update) a studio dashboard admin.
 *
 *   npm run studio:create-admin            # the live D1 database (--remote)
 *   npm run studio:create-admin -- --local # the local database used by `npm run dev`
 *
 * Asks for the email, the name and the password (typed twice, never echoed),
 * hashes the password here with the same PBKDF2 format the Worker verifies
 * (pbkdf2$100000$<salt base64>$<hash base64>, see src/studio/auth.js) and runs
 * one `wrangler d1 execute lracdim-api` with an INSERT … ON CONFLICT(email) DO
 * UPDATE. Running it again for the same address changes the name and password
 * and signs that admin out everywhere. An address that already belongs to a
 * client portal user is left alone.
 *
 * Neither the password nor its hash is printed, and wrangler's output is
 * captured and scrubbed of the hash before anything is shown. Wrangler is run
 * as `node <wrangler.js>` rather than through npx, so the SQL reaches it as a
 * single argument with no shell quoting in between (which matters on Windows).
 */
import { spawnSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const ITERATIONS = 100_000; // must match PBKDF2_ITERATIONS in src/studio/auth.js
const MIN_PASSWORD = 12;
const DATABASE = 'lracdim-api';
const workerDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const local = args.includes('--local');

function ask(question) {
  return new Promise((done) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      done(answer.trim());
    });
  });
}

/** Read a line from the terminal without echoing it. */
function askHidden(question) {
  if (!process.stdin.isTTY) {
    console.error('The password must be typed in an interactive terminal.');
    process.exit(1);
  }
  return new Promise((done) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          done(value);
          return;
        }
        if (ch === '\u0003') {
          // Ctrl+C
          stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

/** A SQL string literal: single quotes doubled; control characters are refused before this. */
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const hasControl = (s) => /[\u0000-\u001f\u007f]/.test(s);

/** The Worker's password format, computed with node:crypto. */
export function hashPassword(password) {
  const salt = randomBytes(16);
  return `pbkdf2$${ITERATIONS}$${salt.toString('base64')}$${pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256').toString('base64')}`;
}

/** The statements sent to `wrangler d1 execute`, separated by ';'. */
export function adminSql({ email, name, hash, id = randomUUID().replace(/-/g, ''), now = new Date().toISOString() }) {
  return [
    'INSERT INTO studio_users (id, email, name, role, client_id, password_hash, disabled, created_at) ' +
      `VALUES (${lit(id)}, ${lit(email)}, ${lit(name)}, 'admin', NULL, ${lit(hash)}, 0, ${lit(now)}) ` +
      "ON CONFLICT(email) DO UPDATE SET name = excluded.name, password_hash = excluded.password_hash, disabled = 0 WHERE studio_users.role = 'admin'",
    // A new password signs this admin out everywhere.
    `DELETE FROM studio_sessions WHERE user_id = (SELECT id FROM studio_users WHERE email = ${lit(email)} AND role = 'admin')`,
    `SELECT role FROM studio_users WHERE email = ${lit(email)}`
  ].join('; ');
}

async function main() {
  if (args.some((a) => !['--local', '--remote'].includes(a))) {
    console.error('Usage: node scripts/studio-create-admin.mjs [--local]');
    process.exit(2);
  }
  console.log(`Studio admin for the ${local ? 'LOCAL' : 'LIVE (remote)'} database "${DATABASE}".\n`);
  const email = (await ask('Email: ')).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200 || hasControl(email)) {
    console.error('That is not a valid email address.');
    process.exit(1);
  }
  const name = await ask('Name: ');
  if (name.length < 1 || name.length > 120 || hasControl(name)) {
    console.error('Enter a name of 1 to 120 characters.');
    process.exit(1);
  }
  const password = await askHidden(`Password (at least ${MIN_PASSWORD} characters): `);
  if (password.length < MIN_PASSWORD || password.length > 200) {
    console.error(`The password must be ${MIN_PASSWORD} to 200 characters long.`);
    process.exit(1);
  }
  const again = await askHidden('Password again: ');
  if (again !== password) {
    console.error('The passwords do not match.');
    process.exit(1);
  }

  const hash = hashPassword(password);
  const sql = adminSql({ email, name, hash });

  const wrangler = createRequire(import.meta.url).resolve('wrangler/bin/wrangler.js', { paths: [workerDir] });
  console.log(`\nRunning wrangler d1 execute ${DATABASE} ${local ? '--local' : '--remote'} …`);
  const res = spawnSync(process.execPath, [wrangler, 'd1', 'execute', DATABASE, local ? '--local' : '--remote', '--yes', '--json', '--command', sql], {
    cwd: workerDir,
    encoding: 'utf8',
    shell: false
  });
  const scrub = (text) => String(text || '').split(hash).join('[hash]');
  if (res.status !== 0) {
    console.error('wrangler failed:\n' + scrub(res.stderr || res.stdout));
    console.error(local ? 'Did you run `npm run db:migrate:local` first?' : 'Are you logged in (`npx wrangler login`) and is migration 0005 applied (`npm run db:migrate:remote`)?');
    process.exit(1);
  }
  let role = null;
  try {
    const out = JSON.parse(res.stdout);
    const last = Array.isArray(out) ? out[out.length - 1] : null;
    role = last?.results?.[0]?.role ?? null;
  } catch {
    // Older or newer wrangler output: fall through to the generic message.
  }
  if (role === 'client') {
    console.error(`${email} belongs to a client portal user, so it was not changed. Use another address for the admin.`);
    process.exit(1);
  }
  console.log(`Done. ${email} can sign in to the studio dashboard as an admin.`);
}

// Run only when executed, so the tests can import hashPassword and adminSql.
const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && samePath(resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
}
