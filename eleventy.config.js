export default function (eleventyConfig) {
  // Self-host runtime dependencies.
  eleventyConfig.addPassthroughCopy({ 'node_modules/three/build/three.module.js': 'assets/vendor/three/three.module.js' });
  eleventyConfig.addPassthroughCopy({ 'node_modules/three/build/three.core.js': 'assets/vendor/three/three.core.js' });
  eleventyConfig.addPassthroughCopy({ 'node_modules/@fontsource/archivo/files/archivo-latin-400-normal.woff2': 'assets/fonts/archivo-400.woff2' });
  eleventyConfig.addPassthroughCopy({ 'node_modules/@fontsource/archivo/files/archivo-latin-600-normal.woff2': 'assets/fonts/archivo-600.woff2' });
  eleventyConfig.addPassthroughCopy({ 'node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2': 'assets/fonts/mono-400.woff2' });
  // Pass static assets straight through.
  eleventyConfig.addPassthroughCopy({ 'src/assets': 'assets' });
  eleventyConfig.addWatchTarget('src/assets');

  // Demo template assets. Each demo owns assets/demos/<slug>/ and nothing
  // outside it — theme CSS and app JS are loaded only by layouts/demo.njk.
  eleventyConfig.addPassthroughCopy({ 'src/assets/demos': 'assets/demos' });

  // Cloudflare Pages / Netlify platform files.
  eleventyConfig.addPassthroughCopy({ 'src/_headers': '_headers' });
  eleventyConfig.addPassthroughCopy({ 'src/_redirects': '_redirects' });
  eleventyConfig.addWatchTarget('src/assets/demos');

  // Zero-pad an index into a section marker: 0 -> "01"
  eleventyConfig.addFilter('pad', (n, width = 2) =>
    String(Number(n) + 1).padStart(width, '0')
  );

  // Slugify for anchors/ids.
  eleventyConfig.addFilter('slug', (str) =>
    String(str)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );

  eleventyConfig.addFilter('year', () => new Date().getFullYear());

  eleventyConfig.addFilter('date_iso', (d) => new Date(d).toISOString());

  // Minutes to read at ~220 wpm, minimum 1. Strips tags and front matter.
  eleventyConfig.addFilter('reading_time', (html) => {
    const words = String(html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 220));
  });
  eleventyConfig.addFilter('word_count', (html) =>
    String(html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
  );

  // "9 September 2026" for article dates.
  eleventyConfig.addFilter('date_long', (d) =>
    new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  );

  // First N items of an array — used for card previews.
  eleventyConfig.addFilter('slice_first', (arr, n) =>
    Array.isArray(arr) ? arr.slice(0, n) : []
  );

  eleventyConfig.addFilter('urlencode', (str) => encodeURIComponent(String(str)));

  // Serialize a data object into a <script type="application/json"> payload.
  // Used to hand a demo's clinic.json to its client-side app without a fetch.
  eleventyConfig.addFilter('json', (value) =>
    JSON.stringify(value == null ? null : value).replace(/</g, '\\u003c')
  );

  /**
   * collections.demoTemplates
   *
   * Every page inside src/demos/<slug>/ is tagged "demo" by its directory data
   * file, so getFilteredByTag('demo') returns all of a demo's pages. The
   * catalogue wants one entry per TEMPLATE, so this keeps only each demo's
   * root page — the one whose URL is exactly /demos/<slug>/.
   *
   * Adding a new template therefore requires no catalogue edit: drop in a
   * folder with a demoMeta block and it appears here.
   */
  eleventyConfig.addCollection('demoTemplates', (collectionApi) =>
    collectionApi
      .getFilteredByTag('demo')
      .filter((item) => {
        const meta = item.data.demoMeta;
        return meta && meta.slug && item.url === `/demos/${meta.slug}/`;
      })
      .sort((a, b) =>
        String(a.data.demoMeta.name).localeCompare(String(b.data.demoMeta.name))
      )
  );

  return {
    dir: {
      input: 'src',
      output: '_site',
      includes: '_includes',
      data: '_data'
    },
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
    templateFormats: ['njk', 'md', 'html']
  };
}
