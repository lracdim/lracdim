/**
 * Browser QA for the built site. Requires:
 *   - the site served at SITE (default http://localhost:8099)
 *   - Chrome at CHROME (default Windows install path)
 *   - optionally the API at the site's configured apiBase (Vector/Signal/
 *     Forge server tools are exercised only when the API answers)
 *
 * Checks: console errors, failed requests, horizontal overflow at five
 * widths, navigation, dimension pages, Vector flow, Forge tools, Signal
 * dashboard, intake form submission, project and research pages.
 */
import puppeteer from 'puppeteer-core';

const SITE = process.env.SITE || 'http://localhost:8099';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = { pass: [], fail: [] };
const check = (name, ok, detail = '') => (ok ? results.pass : results.fail).push(name + (detail ? ` — ${detail}` : ''));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
const consoleErrors = [];
const failedRequests = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('requestfailed', (r) => { if (!r.url().includes('favicon')) failedRequests.push(`${r.url()} ${r.failure()?.errorText || ''}`); });
page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(SITE) && !r.url().includes('favicon')) failedRequests.push(`${r.url()} ${r.status()}`); });

const apiBase = await (async () => {
  await page.goto(SITE + '/', { waitUntil: 'networkidle2' });
  return page.evaluate(() => (window.LRACDIM && window.LRACDIM.apiBase) || '');
})();
let apiUp = false;
if (apiBase) {
  try {
    apiUp = (await (await fetch(apiBase + '/api/health')).json()).ok === true;
  } catch {}
}
console.log(`site ${SITE} · api ${apiBase || '(none)'} ${apiUp ? 'up' : 'down'}`);

// 1. Overflow + load at five widths
const pages = ['/', '/work/', '/work/spade-website/', '/vector/', '/signal/', '/forge/', '/forge/json-formatter/', '/forge/robots-validator/', '/research/', '/research/designing-a-website-health-scoring-engine/', '/about/', '/start/'];
for (const w of [320, 375, 768, 1024, 1440]) {
  await page.setViewport({ width: w, height: 900 });
  for (const p of pages) {
    await page.goto(SITE + p, { waitUntil: 'networkidle2' });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(`no overflow ${w} ${p}`, over <= 0, over > 0 ? `${over}px` : '');
  }
}
await page.setViewport({ width: 1440, height: 900 });

// 2. Navigation and dimensions
await page.goto(SITE + '/', { waitUntil: 'networkidle2' });
const nav = await page.$$eval('.header__nav a', (as) => as.map((a) => a.textContent.trim()));
check('primary nav is the five dimensions', JSON.stringify(nav) === JSON.stringify(['Work', 'Vector', 'Signal', 'Forge', 'Research']), nav.join(','));
check('dimension selector has five cards', (await page.$$('.dim-card')).length === 5);
for (const p of ['/work/', '/vector/', '/signal/', '/forge/', '/research/']) {
  await page.goto(SITE + p, { waitUntil: 'networkidle2' });
  check(`dimension head on ${p}`, !!(await page.$('.dim-head h1')));
}

// 3. Vector
await page.goto(SITE + '/vector/', { waitUntil: 'networkidle2' });
await page.type('#vector-url', 'localhost');
await page.click('[data-vector-submit]');
await wait(300);
check('vector rejects private address client-side', (await page.$eval('[data-vector-error]', (e) => e.textContent)).length > 0);
if (apiUp) {
  await page.goto(SITE + '/vector/?url=example.com', { waitUntil: 'networkidle2' });
  let done = false;
  for (let i = 0; i < 60 && !done; i++) {
    await wait(1000);
    done = await page.evaluate(() => !document.querySelector('[data-vector-report]').hidden || !document.querySelector('[data-vector-state="failed"]').hidden);
  }
  const report = await page.evaluate(() => ({
    visible: !document.querySelector('[data-vector-report]').hidden,
    failed: !document.querySelector('[data-vector-state="failed"]').hidden,
    health: document.querySelector('.vector-health__score b')?.textContent,
    categories: document.querySelectorAll('.vector-table:not(.vector-table--metrics) tr').length,
    issues: document.querySelectorAll('.vector-issue').length,
    rx: document.querySelectorAll('.vector-rx li').length,
    stages: [...document.querySelectorAll('.vector-stages li')].map((l) => l.dataset.state),
    url: location.pathname
  }));
  check('vector engine report renders', report.visible && !report.failed, JSON.stringify(report));
  check('vector report has seven categories', report.categories === 7, String(report.categories));
  check('vector report has issues and prescription', report.issues > 0 && report.rx > 0);
  check('vector url is addressable', /^\/vector\/audit\/[a-z0-9]+\/$/.test(report.url), report.url);
  const shareUrl = SITE + (report.url.includes('/audit/') ? `/vector/audit/?id=${report.url.split('/')[3]}` : '/vector/');
  await page.goto(shareUrl, { waitUntil: 'networkidle2' });
  await wait(2500);
  check('stored report loads by id', await page.evaluate(() => !document.querySelector('[data-vector-report]').hidden));
} else {
  await page.goto(SITE + '/vector/?url=example.com', { waitUntil: 'networkidle2' });
  await wait(4000);
  check('vector browser-mode report renders', await page.evaluate(() => !document.querySelector('[data-vector-report]').hidden));
}

// 4. Forge client tools
await page.goto(SITE + '/forge/json-formatter/', { waitUntil: 'networkidle2' });
await page.type('#json-in', '{"a":1}');
await page.click('[data-action="format"]');
check('json formatter formats', (await page.$eval('#json-out', (e) => e.value)).includes('"a": 1'));
await page.goto(SITE + '/forge/regex-tester/', { waitUntil: 'networkidle2' });
await page.type('#re-pattern', '(\\w+)@(\\w+)\\.com');
await page.type('#re-text', 'jane@example.com and bob@test.com');
await wait(200);
check('regex tester finds matches', (await page.$eval('#regex-tester [data-status]', (e) => e.textContent)).startsWith('2 match'));
await page.goto(SITE + '/forge/text-analyzer/', { waitUntil: 'networkidle2' });
await page.type('#text-in', 'The cat sat on the mat. It was warm.');
check('text analyzer computes reading ease', (await page.$eval('#text-analyzer [data-output]', (e) => e.textContent)).includes('Reading ease'));
if (apiUp) {
  await page.goto(SITE + '/forge/metadata-checker/', { waitUntil: 'networkidle2' });
  await page.type('#tool-url', 'https://example.com/');
  await page.click('[data-action="run"]');
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) {
    await wait(1000);
    ok = await page.evaluate(() => document.querySelectorAll('#metadata-checker .forge-table').length > 0);
  }
  check('server tool renders a result', ok);
}

// 5. Signal
await page.goto(SITE + '/signal/', { waitUntil: 'networkidle2' });
await wait(2500);
const signal = await page.evaluate(() => ({ cards: document.querySelectorAll('.signal-card').length, empty: !!document.querySelector('.signal-empty'), status: document.querySelector('[data-signal-status]')?.textContent }));
check('signal shows either targets or an honest empty state', signal.cards > 0 || signal.empty, JSON.stringify(signal));
if (apiUp && signal.cards > 0) {
  const href = await page.$eval('.signal-card h3 a', (a) => a.getAttribute('href'));
  await page.goto(SITE + `/signal/site/?id=${href.split('/')[3]}`, { waitUntil: 'networkidle2' });
  await wait(2500);
  check('signal target page renders events', (await page.$$('.signal-events li')).length > 0);
}

// 6. Intake form
await page.goto(SITE + '/start/', { waitUntil: 'networkidle2' });
await page.click('button[type="submit"]');
await wait(200);
check('intake blocks empty submission', (await page.$$('.intake__field.is-invalid')).length > 0);
if (apiUp) {
  await page.type('#st-name', 'QA Runner');
  await page.type('#st-email', 'qa@example.com');
  await page.select('#st-need', 'Automation');
  await page.type('#st-msg', 'Automated QA submission: the intake form should store this through the API.');
  await page.click('button[type="submit"]');
  let done = false;
  for (let i = 0; i < 10 && !done; i++) {
    await wait(500);
    done = await page.evaluate(() => !document.querySelector('[data-start-done]').hidden);
  }
  check('intake submits to the API', done, await page.evaluate(() => document.querySelector('[data-start-done-copy]')?.textContent || document.querySelector('[data-start-status]')?.textContent));
}

// 7. Project and research pages
await page.goto(SITE + '/work/lracdimension/', { waitUntil: 'networkidle2' });
const sections = await page.$$eval('.case-body section h2', (hs) => hs.map((h) => h.textContent));
check('case study has the full structure', ['Overview', 'The problem', 'What I built', 'Architecture', 'Result'].every((s) => sections.includes(s)), sections.join('|'));
check('case study links across dimensions', (await page.$$('.related-list li')).length >= 2);
await page.goto(SITE + '/research/building-a-safe-website-crawler/', { waitUntil: 'networkidle2' });
check('research entry renders sections', (await page.$$eval('.prose h2', (hs) => hs.map((h) => h.textContent))).includes('Trade-offs'));

// 8. Mobile drawer + keyboard
await page.setViewport({ width: 375, height: 812 });
await page.goto(SITE + '/', { waitUntil: 'networkidle2' });
await page.click('[data-nav-toggle]');
await wait(400);
check('mobile drawer opens with dimensions', (await page.$$('.drawer__link')).length >= 5);
await page.keyboard.press('Escape');
await wait(300);
check('drawer closes on Escape', await page.evaluate(() => !document.querySelector('[data-drawer]').classList.contains('is-open')));

check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
check('no failed requests', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '));

await browser.close();
console.log(`\nPASS ${results.pass.length}`);
for (const f of results.fail) console.log(`FAIL ${f}`);
process.exit(results.fail.length ? 1 : 0);
