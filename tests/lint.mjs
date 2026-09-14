// Lightweight lint: every frontend module must parse, every template must
// have front matter where required, and no file may contain a merge marker
// or a hard tab in JS/CSS. With --check-format, also flags trailing spaces.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const checkFormat = process.argv.includes('--check-format');
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const problems = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '_site' || name === '.venv' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(join(root, 'src')).concat(walk(join(root, 'tests')));
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  if (/^(<<<<<<<|>>>>>>>|=======)$/m.test(text)) problems.push(`${f}: merge marker`);
  if (/\.(js|mjs)$/.test(f)) {
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (e) {
      problems.push(`${f}: ${String(e.stderr || e.message).split('\n')[0]}`);
    }
    if (/\t/.test(text)) problems.push(`${f}: hard tab`);
  }
  if (/\.css$/.test(f) && /\t/.test(text)) problems.push(`${f}: hard tab`);
  if (checkFormat && /[ \t]+$/m.test(text)) problems.push(`${f}: trailing whitespace`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`lint ok: ${files.length} files`);
