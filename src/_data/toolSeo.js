/**
 * Search-facing copy for the tool pages. Titles target the phrases people
 * actually type ("redirect checker", "robots.txt validator") rather than the
 * dimension names. `guide` renders below the tool as plain sections; `faq`
 * renders as an accordion and as FAQPage structured data. Every claim here
 * describes what the tool does today; nothing is aspirational.
 */
export default {
  'json-formatter': {
    title: 'JSON Formatter and Validator',
    description: 'Format, minify, and validate JSON online. Reports the exact line and column of any syntax error. Nothing you paste leaves your browser.',
    guide: [
      { h: 'What this JSON formatter does', p: ['Paste any JSON and choose Format to indent it for reading or Minify to strip whitespace for transport. Validate parses the text with the browser\'s own JSON parser, so the verdict matches what JavaScript would accept.', 'When the input is invalid, the tool reports the line and column where parsing stopped and the parser\'s message. That is usually a trailing comma, a single-quoted string, an unquoted key, or a missing bracket.'] },
      { h: 'When to use it', p: ['Reading an API response that arrived on one line. Checking a configuration file before a deploy. Shrinking a payload to see its real size. Finding the one character that breaks a JSON file a colleague sent.'] },
      { h: 'Privacy', p: ['This tool runs entirely in your browser. The text is never sent to a server, so it is safe for payloads that contain tokens, customer records, or anything else you would not paste into a random website.'] }
    ],
    faq: [
      { q: 'Is this JSON validator free?', a: 'Yes. There is no account, no limit, and no upload. The page is a static file and the work happens in your browser.' },
      { q: 'Why does it say my JSON is invalid when it looks fine?', a: 'The most common causes are a trailing comma after the last item, single quotes instead of double quotes, comments, or an unquoted key. JSON is stricter than JavaScript object syntax.' },
      { q: 'Does formatting change my data?', a: 'No. Formatting and minifying only change whitespace. Key order and values are preserved exactly.' },
      { q: 'What is the size limit?', a: 'Whatever your browser can hold in a text field. Multi-megabyte files work; very large ones may take a moment to parse.' }
    ]
  },
  'regex-tester': {
    title: 'Regex Tester — JavaScript regular expressions',
    description: 'Test a regular expression against sample text with flags, a live match list, and capture groups. JavaScript syntax, runs in your browser.',
    guide: [
      { h: 'What this regex tester does', p: ['Type a pattern and sample text and the tool lists every match as you type, with the index of each match and the contents of its capture groups. Flags for global, case-insensitive, multiline, dot-all, and unicode are toggles, so you can see how each one changes the result.', 'Because it uses the browser\'s JavaScript engine, what matches here is exactly what will match in Node.js or in a browser script. Patterns for Python, PCRE, or Go can differ in lookbehind support and named-group syntax.'] },
      { h: 'Reading the output', p: ['Each match shows its full text and its position. Numbered groups appear in order; named groups appear by name. An empty match list with no error means the pattern is valid but matches nothing in the sample, which is usually a flag problem: forgetting the global flag stops after the first match, and forgetting case-insensitive misses capitalised text.'] }
    ],
    faq: [
      { q: 'Which regex flavour does this use?', a: 'JavaScript, as implemented by your browser. It supports lookahead, lookbehind, named groups, and unicode property escapes in current browsers.' },
      { q: 'Why does my pattern only find one match?', a: 'Enable the global flag. Without it, a JavaScript regular expression stops at the first match.' },
      { q: 'Is my text sent anywhere?', a: 'No. Pattern and sample stay in the page.' }
    ]
  },
  'timestamp-converter': {
    title: 'Unix Timestamp Converter',
    description: 'Convert Unix timestamps in seconds or milliseconds to ISO 8601 and local time, or convert a date to epoch. Detects the unit automatically.',
    guide: [
      { h: 'What this timestamp converter does', p: ['Paste a Unix timestamp and the tool shows it as an ISO 8601 string in UTC and as local time in your browser\'s timezone. Paste a date instead and it returns the epoch value in seconds and milliseconds. Ten-digit values are treated as seconds and thirteen-digit values as milliseconds, which covers every timestamp you will meet in logs, databases, and APIs.'] },
      { h: 'Why the unit matters', p: ['A common bug is treating milliseconds as seconds, which produces dates around the year 50000, or the reverse, which produces January 1970. The tool shows both interpretations so the mistake is visible immediately.'] }
    ],
    faq: [
      { q: 'What is a Unix timestamp?', a: 'The number of seconds since 1 January 1970 00:00:00 UTC. Many systems store it in milliseconds instead, which is the same count multiplied by one thousand.' },
      { q: 'Which timezone is used for local time?', a: 'The timezone your browser reports. The UTC value is shown alongside so there is no ambiguity.' },
      { q: 'Can I convert a date to a timestamp?', a: 'Yes. Enter an ISO 8601 date or anything your browser can parse and the tool returns seconds and milliseconds.' }
    ]
  },
  'url-parser': {
    title: 'URL Parser, Encoder and Decoder',
    description: 'Parse any URL into scheme, host, path, and query parameters shown as a table, and encode or decode URL components. Runs in your browser.',
    guide: [
      { h: 'What this URL parser does', p: ['Paste a URL and the tool separates it into scheme, username, host, port, path, query string, and fragment, then lists every query parameter as a name and value with percent-encoding removed. The encoder and decoder handle a single component, so you can prepare a value for a query string or read one back.'] },
      { h: 'When to use it', p: ['Decoding a tracking link to see what it carries. Checking which parameters an integration actually sends. Building a URL by hand and needing to encode an ampersand, a space, or a non-Latin character correctly.'] }
    ],
    faq: [
      { q: 'What is the difference between encodeURI and encodeURIComponent?', a: 'Encoding a component escapes every reserved character including slashes and ampersands, which is what you want for a single query value. Encoding a whole URL leaves the structural characters alone. This tool encodes components.' },
      { q: 'Does it handle international domain names?', a: 'Yes. The host is shown as the browser resolves it, which converts unicode hostnames to their punycode form.' }
    ]
  },
  'redirect-checker': {
    title: 'Redirect Checker — trace 301 and 302 chains',
    description: 'Enter a URL and follow every redirect hop by hop. See each status code, the final destination, and whether the chain is longer than it should be.',
    guide: [
      { h: 'What this redirect checker does', p: ['The tool requests the address you enter and follows each redirect one step at a time, recording the status code and location of every hop until it reaches a final page or a limit. You get the full chain, not just the end, which is what you need to find loops, double hops, and http-to-https-to-www detours.', 'Requests go through the same validated fetcher that Vector uses: public http and https only, private and internal addresses refused, every hop re-checked, and a cap on redirects and response size.'] },
      { h: 'Why redirect chains matter', p: ['Each hop is a round trip before the visitor sees anything, and search engines pass slightly less signal through every extra redirect. Two hops are common after a migration, for example http to https and then non-www to www. The fix is to redirect straight to the final address in one step and to update internal links so they point at the destination directly.'] },
      { h: 'Reading the status codes', p: ['301 and 308 are permanent and are the right choice for moved pages. 302 and 307 are temporary and tell search engines to keep the old URL indexed. A 200 at the end means the chain resolved. A 404 or 500 at the end means the redirect points at a broken page.'] }
    ],
    faq: [
      { q: 'How many redirects does it follow?', a: 'Up to the fetcher\'s limit of five hops. A chain longer than that is reported as too long, which is itself a finding worth fixing.' },
      { q: 'Why does a site show a 403 here but open in my browser?', a: 'Some hosts and CDNs block automated clients with a 403 or a challenge page. The redirect chain up to that point is still accurate; the final page just refused a non-browser request.' },
      { q: 'Is a 302 bad for SEO?', a: 'Not by itself, but a permanent move served as a 302 can keep the old URL in the index longer. Use a 301 for pages that are not coming back.' }
    ]
  },
  'robots-validator': {
    title: 'robots.txt Validator',
    description: 'Fetch and parse any site\'s robots.txt. See each user-agent group, its allow and disallow rules, sitemap directives, and syntax mistakes that block crawling.',
    guide: [
      { h: 'What this robots.txt validator does', p: ['Enter a domain and the tool fetches its robots.txt, splits it into user-agent groups, and lists the allow and disallow rules for each. It reports the sitemap directives, counts the lines, and flags problems: rules that appear before any user-agent line, paths that do not start with a slash, unknown directives, sitemap lines that are not absolute URLs, and a missing sitemap directive.', 'It also raises the one mistake that matters most: a wildcard group that disallows the root, which tells every crawler to stay out of the whole site.'] },
      { h: 'Why check robots.txt', p: ['A single misplaced line can remove a site from search results, and the file is easy to break during a migration or a staging copy going live. Checking it after every deploy takes seconds and prevents the most expensive SEO accident there is.'] }
    ],
    faq: [
      { q: 'What does "Disallow: /" mean?', a: 'It blocks the entire site for the user-agents in that group. Under a wildcard user-agent it blocks all crawlers, which is appropriate for staging and catastrophic for production.' },
      { q: 'Does robots.txt remove pages from Google?', a: 'No. It stops crawling, not indexing. A blocked page can still appear in results without a snippet. To remove a page, allow crawling and use a noindex meta tag.' },
      { q: 'What if the site has no robots.txt?', a: 'The tool reports the status it received. A 404 is fine; crawlers treat it as "crawl everything". A 500 or a timeout is worth investigating because some crawlers back off when the file errors.' }
    ]
  },
  'sitemap-validator': {
    title: 'XML Sitemap Validator',
    description: 'Fetch a sitemap.xml or sitemap index, confirm it is well-formed, count its URLs, and flag entries on other hosts or with invalid lastmod dates.',
    guide: [
      { h: 'What this sitemap validator does', p: ['Enter a sitemap URL and the tool fetches it, identifies whether it is a URL set or a sitemap index, checks that the XML parses, counts the entries, and shows a sample. It flags URLs that point at a different host than the sitemap itself, which search engines ignore, and lastmod values that are not valid dates.'] },
      { h: 'Why sitemaps go wrong', p: ['Generators often emit the staging hostname, keep deleted pages, or write lastmod as a build time so every page looks freshly changed. None of those break the file, but all of them waste crawl budget and teach search engines to distrust the dates. The tool surfaces the first two directly and gives you the sample to spot the third.'] }
    ],
    faq: [
      { q: 'Where is my sitemap?', a: 'Most sites serve it at /sitemap.xml, and the robots.txt should point to it with a Sitemap line. The robots.txt validator on this site shows that line.' },
      { q: 'How many URLs can a sitemap hold?', a: 'Fifty thousand URLs or fifty megabytes uncompressed. Larger sites split into several files listed in a sitemap index.' },
      { q: 'Does the tool check every URL in the sitemap?', a: 'No. It validates the file and its entries; it does not fetch each page. Use Vector for a per-page examination.' }
    ]
  },
  'metadata-checker': {
    title: 'Meta Tag Checker — title, description, OG',
    description: 'Read a page\'s title, meta description, canonical, Open Graph and Twitter tags in one view, with lengths and a list of what is missing.',
    guide: [
      { h: 'What this meta tag checker does', p: ['Enter a page URL and the tool fetches it and reads the tags that control how the page appears in search results and link previews: the title and its length, the meta description, the canonical URL, robots directives, and every Open Graph and Twitter card tag. Missing or empty tags are listed so you know what to add.'] },
      { h: 'What good looks like', p: ['A title under about sixty characters so it is not cut off in results. A description between roughly seventy and one hundred and sixty characters that reads like a sentence. One canonical that points at the page itself. An og:title, og:description, and an og:image of at least 1200 by 630 pixels so shares on LinkedIn, Facebook, and messaging apps show a proper card.'] }
    ],
    faq: [
      { q: 'Why does my link preview show the wrong image?', a: 'Platforms cache the first version they fetched. Fix the og:image tag, then use the platform\'s debugger to refresh the cache.' },
      { q: 'Do I need Twitter card tags if I have Open Graph?', a: 'Twitter falls back to Open Graph for most fields. Adding twitter:card with the value summary_large_image is enough to get the large preview.' },
      { q: 'Does it check structured data?', a: 'Not yet. It reads the head tags listed above. Vector\'s SEO analyzer covers robots.txt and sitemaps as well.' }
    ]
  },
  'canonical-checker': {
    title: 'Canonical URL Checker',
    description: 'Check a page\'s canonical tag: whether it exists, is absolute, is the only one, points at itself, uses https, and whether a Link header sets a different value.',
    guide: [
      { h: 'What this canonical checker does', p: ['Enter a page URL and the tool fetches it, records any redirects on the way, and inspects the canonical link tag and the HTTP Link header. It reports whether the canonical is absolute, whether the page declares exactly one, whether it points back at the page itself, whether it uses https, and whether the header and the tag disagree.'] },
      { h: 'Why canonicals matter', p: ['The canonical tells search engines which address is the real one when the same content is reachable under several URLs, for example with and without a trailing slash or a tracking parameter. A canonical that points at the wrong page hands that page\'s ranking to another URL. A canonical that points at an http address on an https site, or at a page that redirects, sends conflicting signals and is quietly ignored.'] }
    ],
    faq: [
      { q: 'Should every page have a canonical?', a: 'Yes, and on most pages it should point at the page itself. It costs nothing and prevents parameter and slash variants from splitting signals.' },
      { q: 'What is a self-referencing canonical?', a: 'A canonical whose URL is the page\'s own address. It is the normal case; the tool reports when it is missing.' },
      { q: 'Can a canonical point at another domain?', a: 'It can, for syndicated content. For everything else a cross-domain canonical is usually a mistake left over from a migration.' }
    ]
  },
  'slug-generator': {
    title: 'URL Slug Generator',
    description: 'Convert any title into a lowercase, hyphenated, URL-safe slug. Optional stop-word removal. Runs in your browser.',
    guide: [
      { h: 'What this slug generator does', p: ['Type a title and the tool produces a slug: lowercase, accents stripped, punctuation removed, spaces turned into single hyphens, and no leading or trailing hyphen. Turn on stop-word removal to drop words like "the", "and", and "of" for a shorter address.'] },
      { h: 'What makes a good slug', p: ['Short enough to read in a search result, made of the words a person would search for, and stable, because changing a slug later means a redirect. Dates and numbers are fine when they carry meaning; category words repeated from the folder are not.'] }
    ],
    faq: [
      { q: 'Should I remove stop words from slugs?', a: 'Usually yes for long titles. Keep them when removing one changes the meaning, for example "to be or not to be".' },
      { q: 'Are underscores or hyphens better?', a: 'Hyphens. Search engines treat them as word separators; underscores join words together.' }
    ]
  },
  'text-analyzer': {
    title: 'Readability Checker — Flesch score, word count',
    description: 'Paste text to count words, sentences, and paragraphs, estimate reading time, and get a Flesch reading-ease score as you type. Runs in your browser.',
    guide: [
      { h: 'What this readability checker does', p: ['Paste or type text and the tool updates live: words, sentences, paragraphs, characters, an estimated reading time at an ordinary reading speed, and a Flesch reading-ease score computed from sentence length and syllables per word using the standard formula.'] },
      { h: 'Reading the Flesch score', p: ['Higher is easier. Scores in the sixties and seventies read like plain English for a general audience; scores below fifty read like academic or legal text. Long sentences and long words both lower it, so the two fastest fixes are splitting sentences and swapping long words for short ones. Service pages, product descriptions, and emails to clients usually do well above sixty.'] }
    ],
    faq: [
      { q: 'What reading speed is used?', a: 'A typical adult speed of around two hundred words per minute, rounded up to whole minutes.' },
      { q: 'How is the Flesch reading-ease score calculated?', a: 'From the formula 206.835 minus 1.015 times words per sentence, minus 84.6 times syllables per word. Syllables are estimated, so treat the score as a guide rather than a measurement.' },
      { q: 'Is my text stored?', a: 'No. Everything runs in your browser and nothing is sent to a server.' }
    ]
  }
};
