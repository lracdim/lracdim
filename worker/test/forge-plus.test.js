import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  analyzeDkim,
  analyzeDmarc,
  analyzeEmail,
  analyzeMx,
  analyzeSpf,
  analyzeStructuredData,
  dkimKeyBits,
  emailDomain,
  groupPages,
  txtValue
} from '../src/forge-plus.js';

test('emailDomain accepts domains, URLs and addresses and rejects junk', () => {
  assert.equal(emailDomain('Example.com'), 'example.com');
  assert.equal(emailDomain('https://www.example.com/contact?x=1'), 'example.com');
  assert.equal(emailDomain('you@mail.example.co.uk'), 'mail.example.co.uk');
  assert.equal(emailDomain('localhost'), null);
  assert.equal(emailDomain('not a domain'), null);
});

test('txtValue joins split, quoted TXT strings', () => {
  assert.equal(txtValue('"v=spf1 include:_spf.google.com " "~all"'), 'v=spf1 include:_spf.google.com ~all');
  assert.equal(txtValue('v=DMARC1; p=none'), 'v=DMARC1; p=none');
});

test('SPF: missing, duplicated, +all and a healthy record', () => {
  assert.equal(analyzeSpf(['google-site-verification=x']).status, 'fail');
  assert.equal(analyzeSpf(['v=spf1 -all', 'v=spf1 ~all']).status, 'fail');
  assert.equal(analyzeSpf(['v=spf1 +all']).points, 0);
  const ok = analyzeSpf(['v=spf1 include:spf.titan.email ~all']);
  assert.equal(ok.status, 'pass');
  assert.deepEqual(ok.senders, ['Titan']);
  const many = analyzeSpf([`v=spf1 ${Array.from({ length: 11 }, (_, i) => `include:s${i}.example.com`).join(' ')} -all`]);
  assert.equal(many.status, 'fail');
});

test('DMARC: none is a warning, reject passes, missing fails', () => {
  assert.equal(analyzeDmarc([]).status, 'fail');
  const none = analyzeDmarc(['v=DMARC1; p=none;']);
  assert.equal(none.status, 'warn');
  assert.ok(none.points < 30);
  const strict = analyzeDmarc(['v=DMARC1; p=reject; rua=mailto:d@example.com']);
  assert.equal(strict.status, 'pass');
  assert.equal(strict.points, 30);
});

test('DKIM: key size estimate, revoked keys and nothing found', () => {
  const key2048 = 'A'.repeat(392);
  assert.equal(dkimKeyBits(key2048), 2048);
  assert.equal(dkimKeyBits('A'.repeat(216)), 1024);
  const found = analyzeDkim([{ selector: 'resend', records: [`p=${key2048}`] }, { selector: 'old', records: ['v=DKIM1; p='] }]);
  assert.equal(found.status, 'pass');
  assert.equal(found.keys.find((k) => k.selector === 'old').revoked, true);
  assert.equal(analyzeDkim([{ selector: 'google', records: [] }]).status, 'warn');
  assert.equal(analyzeDkim([{ selector: 'k1', records: [`v=DKIM1; k=rsa; p=${'A'.repeat(216)}`] }]).status, 'warn');
});

test('MX: provider detection and send-only domains', () => {
  const mx = analyzeMx(['20 mx2.titan.email.', '10 mx1.titan.email.']);
  assert.equal(mx.provider, 'Titan');
  assert.equal(mx.mx[0].host, 'mx1.titan.email');
  assert.equal(analyzeMx([]).status, 'warn');
});

test('analyzeEmail scores and grades the four checks together', () => {
  const r = analyzeEmail({
    domain: 'example.com',
    rootTxt: ['v=spf1 include:_spf.google.com -all'],
    dmarcTxt: ['v=DMARC1; p=reject; rua=mailto:d@example.com'],
    mx: ['1 smtp.google.com.'],
    dkim: [{ selector: 'google', records: [`v=DKIM1; k=rsa; p=${'A'.repeat(392)}`] }],
    bimi: [],
    mtaSts: [],
    selector: null
  });
  assert.equal(r.score, 100);
  assert.equal(r.grade, 'A');
  assert.equal(r.problems.length, 0);
});

test('structured data: types, missing required properties, invalid JSON and suggestions', () => {
  const html = `<html><head>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Acme"},{"@type":"WebSite","name":"Acme","url":"https://acme.test"}]}</script>
    <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Q?","acceptedAnswer":{"@type":"Answer","text":"A"}}]}</script>
    <script type="application/ld+json">{ broken </script>
  </head><body><h2>How much does it cost?</h2></body></html>`;
  const r = analyzeStructuredData(html);
  assert.deepEqual(r.types.sort(), ['FAQPage', 'Organization', 'WebSite']);
  assert.ok(r.problems.some((p) => /Organization is missing required url/.test(p)));
  assert.ok(r.problems.some((p) => /not valid JSON/.test(p)));
  assert.equal(r.blocks.length, 3);
  assert.ok(r.suggestions.some((s) => s.startsWith('BreadcrumbList')));
});

test('structured data: a page with none says so', () => {
  const r = analyzeStructuredData('<html><body><p>Hello</p></body></html>');
  assert.equal(r.blocks.length, 0);
  assert.ok(r.problems[0].startsWith('No structured data'));
});

test('llms.txt grouping keeps same-origin pages, skips archives and titles slugs', () => {
  const pages = groupPages(
    ['https://acme.test/', 'https://acme.test/services/', 'https://acme.test/blog/first-post/', 'https://acme.test/tag/news/', 'https://other.test/x', 'https://acme.test/services'],
    'https://acme.test'
  );
  assert.deepEqual(pages.map((p) => [p.section, p.title]), [['Main', 'Home'], ['Pages', 'Services'], ['blog', 'First post']]);
});

test('llms.txt titles keep common acronyms upper-case', () => {
  const [page] = groupPages(['https://acme.test/tools/json-formatter/'], 'https://acme.test');
  assert.equal(page.title, 'JSON formatter');
});

test('llms.txt grouping treats www and the bare domain as the same site', () => {
  const pages = groupPages(['https://www.acme.test/', 'https://www.acme.test/about/'], 'https://acme.test');
  assert.equal(pages.length, 2);
});
