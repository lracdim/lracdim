/**
 * Read a content type from the repository's /content directory.
 *
 * Projects and services are data, not prose: their front matter carries every
 * field the templates use, and the Markdown body is unused for now. Keeping
 * them here means the CMS, the GitHub adapter, and the site all read one set
 * of files.
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { CONTENT_ROOT } from './content-sync.js';

export function loadContent(type, { sortBy } = {}) {
  const dir = path.join(CONTENT_ROOT, type);
  if (!fs.existsSync(dir)) return [];
  const items = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const parsed = matter(fs.readFileSync(path.join(dir, name), 'utf8'));
      return { ...parsed.data, body: parsed.content.trim() };
    })
    .filter((item) => !item.draft);
  if (sortBy) items.sort((a, b) => String(a[sortBy] ?? '').localeCompare(String(b[sortBy] ?? '')));
  return items;
}
