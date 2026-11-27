/**
 * Forge tool registry. `mode` decides where processing happens:
 *   client → runs in the browser, nothing leaves the page
 *   server → POST /api/forge/<slug>/run through the validated fetcher
 *   hybrid → built in the browser, with a check that calls /api/forge/<api>/run
 * custom: true (or hybrid) renders partials/forge/<slug>.njk instead of the generic URL form.
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
  { slug: 'schema-generator', name: 'Structured data generator and checker', category: 'AI visibility', mode: 'hybrid', api: 'structured-data', summary: 'Build JSON-LD for FAQ, local business, organisation, article, product and service pages, and check what a live page already declares.' },
  { slug: 'ai-crawler-policy', name: 'AI crawler policy builder', category: 'AI visibility', mode: 'hybrid', api: 'robots-validator', summary: 'Choose which AI crawlers may read your site, from GPTBot and ClaudeBot to PerplexityBot and Google-Extended, and get the robots.txt lines.' },
  { slug: 'llms-txt-generator', name: 'llms.txt generator', category: 'AI visibility', mode: 'hybrid', api: 'llms-txt', summary: 'Draft an llms.txt for any site from its home page and sitemap, then edit it and download the file.' },
  { slug: 'email-deliverability', name: 'Email deliverability checker', category: 'Email', mode: 'server', custom: true, summary: 'Check a domain\'s SPF, DKIM, DMARC and MX records, with a score and a plain-language fix for each problem.' },  { slug: 'slug-generator', name: 'Slug generator', category: 'Content', mode: 'client', summary: 'Turn a title into a URL-safe slug, with optional stop-word removal.' },
  { slug: 'text-analyzer', name: 'Text and readability analyzer', category: 'Content', mode: 'client', summary: 'Words, sentences, paragraphs, reading time, and a Flesch reading-ease score, live as you type.' }
];

/* Attach the search-facing copy (title, description, guide, FAQ) from toolSeo.js. */
export default tools.map((t) => ({ ...t, seo: toolSeo[t.slug] || null }));
