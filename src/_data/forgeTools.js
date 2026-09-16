/**
 * Forge tool registry. `mode` decides where processing happens:
 *   client → runs in the browser, nothing leaves the page
 *   server → POST /api/forge/<slug>/run through the validated fetcher
 */
import toolSeo from './toolSeo.js';

const tools = [
  { slug: 'json-formatter', name: 'JSON formatter and validator', category: 'Developer', mode: 'client', summary: 'Format, minify, and validate JSON with the exact line and column of any error.' },
  { slug: 'regex-tester', name: 'Regex tester', category: 'Developer', mode: 'client', summary: 'Test a JavaScript regular expression against sample text with flags, match list, and capture groups.' },
  { slug: 'timestamp-converter', name: 'Timestamp converter', category: 'Developer', mode: 'client', summary: 'Unix seconds or milliseconds to ISO 8601 and local time, and back.' },
  { slug: 'url-parser', name: 'URL parser, encoder, decoder', category: 'URL', mode: 'client', summary: 'Break a URL into parts, read the query string as a table, encode or decode a string.' },
  { slug: 'redirect-checker', name: 'Redirect checker', category: 'URL', mode: 'server', summary: 'Follow a URL hop by hop and report each redirect, its status code, and the final destination.' },
  { slug: 'robots-validator', name: 'robots.txt validator', category: 'SEO', mode: 'server', summary: 'Fetch and parse a site\'s robots.txt: groups, rules, sitemaps, and mistakes.' },
  { slug: 'sitemap-validator', name: 'Sitemap validator', category: 'SEO', mode: 'server', summary: 'Fetch a sitemap or index, check it is well-formed, count entries, and flag foreign hosts and bad dates.' },
  { slug: 'metadata-checker', name: 'Metadata checker', category: 'SEO', mode: 'server', summary: 'Read a page\'s title, description, canonical, Open Graph, and Twitter tags, and list what is missing.' },
  { slug: 'canonical-checker', name: 'Canonical checker', category: 'SEO', mode: 'server', summary: 'Resolve a page\'s canonical URL and check it is absolute, single, self-referencing, and https.' },
  { slug: 'slug-generator', name: 'Slug generator', category: 'Content', mode: 'client', summary: 'Turn a title into a URL-safe slug, with optional stop-word removal.' },
  { slug: 'text-analyzer', name: 'Text and readability analyzer', category: 'Content', mode: 'client', summary: 'Words, sentences, paragraphs, reading time, and a Flesch reading-ease score, live as you type.' }
];

/* Attach the search-facing copy (title, description, guide, FAQ) from toolSeo.js. */
export default tools.map((t) => ({ ...t, seo: toolSeo[t.slug] || null }));
