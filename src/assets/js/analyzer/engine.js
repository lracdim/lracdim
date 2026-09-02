/**
 * Diagnostic engine — vanilla ES-module port of the Elimate analyzer.
 *
 * Parses an HTML string with DOMParser, gathers DOM / network / accessibility
 * metrics, scores four axes, and derives a ranked bottleneck list.
 * Pure functions, no framework, no build step.
 */

/* -------------------------------------------------------------------------
   Metrics
   ------------------------------------------------------------------------- */

export function analyzeDOM(doc) {
  if (!doc || !doc.body) {
    return { domDepth: 0, linkCount: 0, buttonCount: 0, elementCount: 0 };
  }

  let maxDepth = 0;
  const traverse = (node, depth) => {
    if (depth > maxDepth) maxDepth = depth;
    for (const child of node.children) traverse(child, depth + 1);
  };
  traverse(doc.body, 0);

  return {
    domDepth: maxDepth,
    linkCount: doc.getElementsByTagName('a').length,
    buttonCount: doc.getElementsByTagName('button').length,
    elementCount: doc.body.getElementsByTagName('*').length
  };
}

export function analyzeNetwork(doc) {
  if (!doc) return { scriptCount: 0, cssCount: 0, imageCount: 0, totalAssets: 0 };

  const scriptCount = doc.getElementsByTagName('script').length;
  const imageCount = doc.getElementsByTagName('img').length;

  let cssCount = 0;
  for (const link of doc.getElementsByTagName('link')) {
    if ((link.getAttribute('rel') || '').toLowerCase() === 'stylesheet') cssCount++;
  }

  return { scriptCount, cssCount, imageCount, totalAssets: scriptCount + cssCount + imageCount };
}

export function analyzeAccessibility(doc) {
  if (!doc) return { missingAlt: 0, hasLang: false, semanticCount: 0 };

  let missingAlt = 0;
  for (const img of doc.getElementsByTagName('img')) {
    if (!img.getAttribute('alt')) missingAlt++;
  }

  const html = doc.getElementsByTagName('html')[0];
  const hasLang = html ? !!html.getAttribute('lang') : false;

  const semanticTags = ['header', 'nav', 'main', 'article', 'section', 'footer', 'aside'];
  const semanticCount = semanticTags.filter(
    (tag) => doc.getElementsByTagName(tag).length > 0
  ).length;

  return { missingAlt, hasLang, semanticCount };
}

/* -------------------------------------------------------------------------
   Scorers
   ------------------------------------------------------------------------- */

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

export function calculateUiUxScore(metrics) {
  let score = 100;

  if (metrics.domDepth > 30) score -= 20;
  else if (metrics.domDepth > 15) score -= 10;

  const interactive = metrics.linkCount + metrics.buttonCount;
  if (interactive > 0) {
    const ratio = metrics.elementCount / interactive;
    if (ratio < 2 || ratio > 50) score -= 5;
  }

  return clamp(score);
}

export function calculatePerformanceScore(metrics, loadTimeSeconds) {
  let score = 100;

  if (loadTimeSeconds > 3) score -= 40;
  else if (loadTimeSeconds > 2) score -= 20;
  else if (loadTimeSeconds > 1) score -= 10;

  if (metrics.scriptCount > 20) score -= 20;
  else if (metrics.scriptCount > 10) score -= 10;

  if (metrics.cssCount > 5) score -= 10;
  if (metrics.imageCount > 30) score -= 15;

  return clamp(score);
}

export function calculateContentWeight(doc) {
  if (!doc || !doc.body) return { score: 0, label: 'Unknown', wordCount: 0, ratio: 0 };

  const bodyText = doc.body.textContent || '';
  const htmlLength = doc.documentElement.innerHTML.length;
  const textLength = bodyText.replace(/\s+/g, ' ').length;
  const wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;
  const ratio = htmlLength > 0 ? textLength / htmlLength : 0;

  let score = 50;
  if (wordCount < 300) score -= 30;
  else if (wordCount > 2000) score += 10;
  else score += 20;

  if (ratio < 0.1) score -= 20;
  if (ratio > 0.5) score += 10;

  score = clamp(score);

  let label = 'Business';
  if (score <= 20) label = 'Amateur';
  else if (score <= 40) label = 'Beginner';
  else if (score <= 60) label = 'Business';
  else if (score <= 80) label = 'Professional';
  else label = 'Optimized';

  return { score, label, wordCount, ratio };
}

export function calculateSeoScore(doc) {
  if (!doc) return 0;
  let score = 0;

  const title = doc.title;
  if (title) {
    score += 20;
    if (title.length >= 10 && title.length <= 60) score += 10;
  }

  const metaDesc = doc.querySelector('meta[name="description"]');
  const descContent = metaDesc ? metaDesc.getAttribute('content') || '' : '';
  if (descContent) {
    score += 20;
    if (descContent.length > 50 && descContent.length < 160) score += 10;
  }

  const h1s = doc.getElementsByTagName('h1');
  if (h1s.length === 1) score += 20;
  else if (h1s.length > 1) score += 10;

  const images = doc.getElementsByTagName('img');
  let altScore = 20;
  if (images.length > 0) {
    let missing = 0;
    for (const img of images) if (!img.getAttribute('alt')) missing++;
    if (missing > 0) altScore = Math.floor(20 * ((images.length - missing) / images.length));
  }
  score += altScore;

  return clamp(score);
}

/* -------------------------------------------------------------------------
   Bottlenecks
   ------------------------------------------------------------------------- */

export function detectBottlenecks(metrics) {
  const list = [];
  let id = 1;

  const add = (severity, title, explanation, fix) =>
    list.push({ id: `b-${id++}`, severity, title, explanation, fix });

  if (metrics.scriptCount > 15) {
    add(
      'High',
      'Excessive JavaScript Execution',
      `Recovered ${metrics.scriptCount} script tags. This blocks the main thread.`,
      'Defer non-essential scripts and code-split bundles.'
    );
  }

  if (metrics.imageCount > 20) {
    add(
      'Medium',
      'High Asset Request Count',
      `Found ${metrics.imageCount} images on landing. Increases round-trip latency.`,
      'Lazy load below-fold images and serve WebP/AVIF.'
    );
  }

  if (metrics.missingAlt > 0) {
    add(
      'Medium',
      'Missing Image Descriptions',
      `${metrics.missingAlt} images lack ALT attributes, hurting accessibility and SEO.`,
      'Add descriptive alt text to all informational images.'
    );
  }

  if (!metrics.hasLang) {
    add(
      'Low',
      'Missing HTML Lang Attribute',
      'Document declaration lacks a language specifier.',
      'Add lang="en" (or the appropriate code) to the <html> tag.'
    );
  }

  if (metrics.domDepth > 20) {
    add(
      'Medium',
      'Excessive DOM Depth',
      `DOM tree depth is ${metrics.domDepth}, causing layout thrashing.`,
      'Flatten HTML structure and reduce wrapper divs.'
    );
  }

  if (metrics.semanticCount < 3) {
    add(
      'Low',
      'Thin Semantic Structure',
      `Only ${metrics.semanticCount} semantic landmarks detected. Machines cannot map the page.`,
      'Introduce header, nav, main, and footer landmarks.'
    );
  }

  const rank = { High: 3, Medium: 2, Low: 1 };
  return list.sort((a, b) => rank[b.severity] - rank[a.severity]);
}

/* -------------------------------------------------------------------------
   Orchestrator
   ------------------------------------------------------------------------- */

export function analyzeWebsite(htmlString, url, loadTimeSeconds = 0.5) {
  const doc = new DOMParser().parseFromString(htmlString, 'text/html');

  const domMetrics = analyzeDOM(doc);
  const netMetrics = analyzeNetwork(doc);
  const accessMetrics = analyzeAccessibility(doc);
  const metrics = { ...domMetrics, ...netMetrics, ...accessMetrics };

  const content = calculateContentWeight(doc);

  return {
    url,
    timestamp: new Date().toISOString(),
    scores: {
      uiux: calculateUiUxScore(metrics),
      performance: calculatePerformanceScore(metrics, loadTimeSeconds),
      contentWeight: content.score,
      seo: calculateSeoScore(doc)
    },
    metrics: {
      loadTimeSeconds,
      domDepth: domMetrics.domDepth,
      scriptCount: netMetrics.scriptCount,
      cssCount: netMetrics.cssCount,
      imageCount: netMetrics.imageCount,
      contentClassification: content.label
    },
    bottlenecks: detectBottlenecks(metrics)
  };
}
