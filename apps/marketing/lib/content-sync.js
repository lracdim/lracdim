/**
 * Git-backed CMS → Eleventy input.
 *
 * Content is authored as Markdown under the repository's /content directory
 * so the dashboard's CMS, the GitHub adapter, and a human with an editor all
 * work on the same files. Eleventy only reads its own input directory, so the
 * files are mirrored into src/ before every build. The mirrors are generated
 * and git-ignored; /content is the source of truth.
 *
 * Mirrored: content/blog → src/research (URLs stay /research/<slug>/)
 *           content/pages → src/pages   (URLs are /<slug>/)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CONTENT_ROOT = path.resolve(here, '../../../content');

const MIRRORS = [
  { from: 'blog', to: 'src/research' },
  { from: 'pages', to: 'src/pages' }
];

function readMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ name, body: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

/** Copy only what changed, so Eleventy's watcher does not loop. */
function writeIfDifferent(file, body) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === body) return false;
  fs.writeFileSync(file, body);
  return true;
}

export function syncContent({ quiet = false } = {}) {
  let written = 0;
  let removed = 0;
  for (const mirror of MIRRORS) {
    const source = path.join(CONTENT_ROOT, mirror.from);
    const target = path.resolve(here, '..', mirror.to);
    fs.mkdirSync(target, { recursive: true });
    const files = readMarkdown(source);
    const expected = new Set(files.map((f) => f.name));
    for (const file of files) {
      if (writeIfDifferent(path.join(target, file.name), file.body)) written += 1;
    }
    // Drop mirrors whose source file was deleted in /content.
    for (const name of fs.readdirSync(target)) {
      if (name.endsWith('.md') && !expected.has(name)) {
        fs.unlinkSync(path.join(target, name));
        removed += 1;
      }
    }
  }
  if (!quiet && (written || removed)) {
    console.log(`[content] mirrored ${written} file(s), removed ${removed}`);
  }
  return { written, removed };
}
