/**
 * FORGE. Client tools run locally; server tools call the API through the
 * validated fetcher. Each tool binds to its [data-tool] root.
 */
import { api, esc, hasApi } from './api.js';

function setStatus(root, text, isError = false) {
  const el = root.querySelector('[data-status]');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('is-error', !!isError);
}

async function copyText(root, text) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(root, 'Copied.');
  } catch {
    setStatus(root, 'Copy is not available here. Select the text and copy it manually.', true);
  }
}

const table = (caption, rows) => `<table class="forge-table"><caption class="overline">${esc(caption)}</caption><tbody>${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v}</td></tr>`).join('')}</tbody></table>`;
const problems = (list) => `<p class="overline" style="margin-top:22px">Problems</p>${list.length ? `<ul class="forge-problems">${list.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '<p class="forge-status">None found.</p>'}`;

/* ---- client tools ----------------------------------------------------- */
function initJson(root) {
  const input = root.querySelector('#json-in');
  const output = root.querySelector('#json-out');
  const run = (mode) => {
    const raw = input.value.trim();
    if (!raw) return setStatus(root, 'Paste some JSON first.', true);
    try {
      const value = JSON.parse(raw);
      output.value = mode === 'minify' ? JSON.stringify(value) : JSON.stringify(value, null, 2);
      const kind = Array.isArray(value) ? `array of ${value.length}` : value && typeof value === 'object' ? `object with ${Object.keys(value).length} keys` : typeof value;
      setStatus(root, `Valid JSON: ${kind}. ${output.value.length.toLocaleString()} characters ${mode === 'minify' ? 'minified' : 'formatted'}.`);
    } catch (err) {
      output.value = '';
      const m = /position (\d+)/.exec(err.message);
      let where = '';
      if (m) {
        const pos = Number(m[1]);
        where = ` at line ${raw.slice(0, pos).split('\n').length}, column ${pos - raw.lastIndexOf('\n', pos - 1)}`;
      }
      setStatus(root, `Invalid JSON${where}: ${err.message.replace(/^JSON\.parse: /, '')}`, true);
    }
  };
  root.querySelector('[data-action="format"]').addEventListener('click', () => run('format'));
  root.querySelector('[data-action="minify"]').addEventListener('click', () => run('minify'));
  root.querySelector('[data-action="copy"]').addEventListener('click', () => output.value && copyText(root, output.value));
}

function initUrl(root) {
  const input = root.querySelector('#url-in');
  const out = root.querySelector('[data-output]');
  root.querySelector('[data-action="parse"]').addEventListener('click', () => {
    const raw = input.value.trim();
    if (!raw) return setStatus(root, 'Enter a URL first.', true);
    let u;
    try {
      u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      out.innerHTML = '';
      return setStatus(root, 'That is not a valid URL.', true);
    }
    const params = [...u.searchParams.entries()];
    out.innerHTML = table('Parts', [['Protocol', esc(u.protocol.replace(':', ''))], ['Host', esc(u.hostname)], ['Port', esc(u.port || '(default)')], ['Path', esc(u.pathname)], ['Query', esc(u.search || '(none)')], ['Fragment', esc(u.hash || '(none)')], ['Origin', esc(u.origin)]]) + (params.length ? table(`Query parameters (${params.length})`, params.map(([k, v]) => [k, esc(v || '(empty)')])) : '');
    setStatus(root, `Parsed. ${params.length} query parameter${params.length === 1 ? '' : 's'}.`);
  });
  root.querySelector('[data-action="encode"]').addEventListener('click', () => {
    if (!input.value) return setStatus(root, 'Enter text first.', true);
    out.innerHTML = `<pre class="forge-pre">${esc(encodeURIComponent(input.value))}</pre>`;
    setStatus(root, 'Encoded with encodeURIComponent.');
  });
  root.querySelector('[data-action="decode"]').addEventListener('click', () => {
    if (!input.value) return setStatus(root, 'Enter text first.', true);
    try {
      out.innerHTML = `<pre class="forge-pre">${esc(decodeURIComponent(input.value.replace(/\+/g, ' ')))}</pre>`;
      setStatus(root, 'Decoded.');
    } catch {
      setStatus(root, 'That string contains a malformed percent-escape.', true);
    }
  });
}

const STOP = new Set(['a', 'an', 'the', 'of', 'is', 'to', 'and', 'or', 'in', 'on', 'for', 'at', 'by', 'with']);
export function slugify(text, dropStop = false) {
  let words = String(text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (dropStop) {
    const kept = words.filter((w) => !STOP.has(w));
    if (kept.length) words = kept;
  }
  return words.join('-');
}
function initSlug(root) {
  const input = root.querySelector('#slug-in');
  const out = root.querySelector('#slug-out');
  const opt = root.querySelector('[data-opt="stopwords"]');
  const run = () => (out.textContent = slugify(input.value, opt.checked));
  input.addEventListener('input', run);
  opt.addEventListener('change', run);
  root.querySelector('[data-action="copy"]').addEventListener('click', () => out.textContent && copyText(root, out.textContent));
}

function initTime(root) {
  const input = root.querySelector('#time-in');
  const out = root.querySelector('[data-output]');
  const relative = (date) => {
    const diff = (date.getTime() - Date.now()) / 1000;
    const abs = Math.abs(diff);
    const [n, unit] = abs < 60 ? [abs, 'second'] : abs < 3600 ? [abs / 60, 'minute'] : abs < 86400 ? [abs / 3600, 'hour'] : [abs / 86400, 'day'];
    const r = Math.round(n);
    return `${r} ${unit}${r === 1 ? '' : 's'} ${diff < 0 ? 'ago' : 'from now'}`;
  };
  const render = (date, label) => {
    if (Number.isNaN(date.getTime())) {
      out.innerHTML = '';
      return setStatus(root, 'Enter Unix seconds, milliseconds, or an ISO 8601 date.', true);
    }
    out.innerHTML = table(label, [['Unix seconds', Math.floor(date.getTime() / 1000)], ['Unix milliseconds', date.getTime()], ['ISO 8601 (UTC)', esc(date.toISOString())], ['Local', esc(date.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' }))], ['Relative', esc(relative(date))]]);
    setStatus(root, '');
  };
  root.querySelector('[data-action="convert"]').addEventListener('click', () => {
    const raw = input.value.trim();
    if (!raw) return setStatus(root, 'Enter a value first.', true);
    if (/^-?\d+$/.test(raw)) {
      const n = Number(raw);
      return render(new Date(Math.abs(n) > 1e11 ? n : n * 1000), Math.abs(n) > 1e11 ? 'Read as milliseconds' : 'Read as seconds');
    }
    render(new Date(raw), 'Read as date string');
  });
  root.querySelector('[data-action="now"]').addEventListener('click', () => {
    const now = new Date();
    input.value = String(Math.floor(now.getTime() / 1000));
    render(now, 'Now');
  });
}

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/e$/, '').replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}
function initText(root) {
  const input = root.querySelector('#text-in');
  const out = root.querySelector('[data-output]');
  const run = () => {
    const t = input.value;
    const words = t.trim() ? t.trim().split(/\s+/) : [];
    const sentences = t.trim() ? (t.match(/[^.!?]+[.!?]+(\s|$)/g) || [t.trim()]).length : 0;
    const paragraphs = t.trim() ? t.trim().split(/\n\s*\n/).length : 0;
    const syl = words.reduce((a, w) => a + syllables(w), 0);
    const ease = words.length && sentences ? Math.round(206.835 - 1.015 * (words.length / sentences) - 84.6 * (syl / words.length)) : null;
    const easeLabel = ease == null ? '—' : ease >= 70 ? `${ease} · easy` : ease >= 50 ? `${ease} · fairly difficult` : ease >= 30 ? `${ease} · difficult` : `${ease} · very difficult`;
    const minutes = Math.round((words.length / 220) * 10) / 10;
    out.innerHTML = [['Words', words.length], ['Characters', t.length], ['Sentences', sentences], ['Paragraphs', paragraphs], ['Words / sentence', sentences ? (words.length / sentences).toFixed(1) : 0], ['Reading time', words.length ? `${minutes < 1 ? '< 1' : minutes} min` : '0 min'], ['Reading ease', easeLabel]]
      .map(([k, v]) => `<div><span class="project-type">${esc(k)}</span><strong>${esc(String(v))}</strong></div>`)
      .join('');
  };
  input.addEventListener('input', run);
  run();
}

function initRegex(root) {
  const pattern = root.querySelector('#re-pattern');
  const flags = root.querySelector('#re-flags');
  const text = root.querySelector('#re-text');
  const out = root.querySelector('[data-output]');
  const run = () => {
    if (!pattern.value) {
      out.innerHTML = '';
      return setStatus(root, '');
    }
    let re;
    try {
      re = new RegExp(pattern.value, flags.value.replace(/[^gimsuy]/g, ''));
    } catch (e) {
      out.innerHTML = '';
      return setStatus(root, `Invalid pattern: ${e.message}`, true);
    }
    const matches = [];
    if (re.global) {
      let m;
      while ((m = re.exec(text.value)) && matches.length < 500) {
        matches.push(m);
        if (m[0] === '') re.lastIndex++;
      }
    } else {
      const m = re.exec(text.value);
      if (m) matches.push(m);
    }
    const highlighted = re.global ? esc(text.value).replace(new RegExp(re.source, re.flags), (s) => `<mark>${s}</mark>`) : esc(text.value);
    out.innerHTML = `<pre class="forge-pre">${highlighted || '<span class="fine-print">No test text.</span>'}</pre>` + (matches.length ? table(`Matches (${matches.length})`, matches.slice(0, 50).map((m, i) => [`#${i + 1} @${m.index}`, esc(m[0]) + (m.length > 1 ? ` <span class="fine-print">groups: ${m.slice(1).map((g, j) => `$${j + 1}=${esc(g ?? '')}`).join(', ')}</span>` : '')])) : '');
    setStatus(root, `${matches.length} match${matches.length === 1 ? '' : 'es'}.`);
  };
  [pattern, flags, text].forEach((el) => el.addEventListener('input', run));
}

/* ---- server tools ----------------------------------------------------- */
const RENDER = {
  'redirect-checker': (r) => table('Redirect path', [['Requested', esc(r.requested)], ['Final URL', esc(r.final_url)], ['Final status', r.final_status], ['Hops', r.hop_count]]) + (r.hops.length ? table('Hops', r.hops.map((h, i) => [`${i + 1} · ${h.status}`, `${esc(h.from)} → ${esc(h.to)}`])) : '') + problems(r.problems),
  'robots-validator': (r) => table('robots.txt', [['URL', esc(r.url)], ['Status', r.status], ['Found', r.found ? 'yes' : 'no'], ['Lines', r.lines ?? '—'], ['Blocks all crawling', r.blocks_all ? 'YES' : 'no']]) + (r.groups && r.groups.length ? table('Groups', r.groups.map((g) => [g.agents.join(', ') || '(none)', g.rules.map((x) => `${esc(x.type)}: ${esc(x.value) || '(empty)'}`).join('<br>') || '(no rules)'])) : '') + (r.sitemaps && r.sitemaps.length ? table('Sitemaps', r.sitemaps.map((s, i) => [`${i + 1}`, esc(s)])) : '') + problems(r.problems),
  'sitemap-validator': (r) => table('Sitemap', [['URL', esc(r.url)], ['Status', r.status], ['Type', esc(r.type || 'unknown')], ['Entries', r.entries], ['Truncated read', r.truncated ? 'yes' : 'no']]) + (r.sample.length ? table('Sample entries', r.sample.map((s, i) => [`${i + 1}`, esc(s)])) : '') + problems(r.problems),
  'metadata-checker': (r) => table('Page', [['URL', esc(r.url)], ['Status', r.status], ['Title', `${esc(r.title) || '(missing)'} <span class="fine-print">${r.title_length} chars</span>`], ['Canonical', esc(r.canonical || '(missing)')]]) + table('Meta tags', Object.entries(r.meta).map(([k, v]) => [k, esc(v)])) + problems(r.problems),
  'canonical-checker': (r) => table('Canonical', [['Requested', esc(r.requested)], ['Final URL', esc(r.url)], ['Status', r.status], ['Canonical', esc(r.canonical || '(none)')], ['Self-referencing', r.self_referencing ? 'yes' : 'no'], ['Link header canonical', r.header_canonical ? 'yes' : 'no'], ['Redirects', r.redirects.length]]) + problems(r.problems)
};

function initServer(root) {
  const form = root.querySelector('[data-server-form]');
  const input = root.querySelector('#tool-url');
  const btn = root.querySelector('[data-action="run"]');
  const out = root.querySelector('[data-output]');
  const slug = root.dataset.tool;
  if (!hasApi()) {
    btn.disabled = true;
    setStatus(root, 'The engine is not connected on this deployment, so this tool cannot fetch other sites here.', true);
    return;
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return setStatus(root, 'Enter a URL first.', true);
    btn.disabled = true;
    btn.textContent = 'Running…';
    out.innerHTML = '';
    setStatus(root, 'Fetching through the engine…');
    try {
      const res = await api(`/api/forge/${slug}/run`, { method: 'POST', body: { url }, timeout: 30000 });
      out.innerHTML = (RENDER[slug] || ((r) => `<pre class="forge-pre">${esc(JSON.stringify(r, null, 2))}</pre>`))(res.result);
      setStatus(root, `Done in ${res.processing_ms} ms.`);
    } catch (err) {
      out.innerHTML = '';
      setStatus(root, err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Run ↗';
    }
  });
}

export function initForge() {
  const tools = { 'json-formatter': initJson, 'url-parser': initUrl, 'slug-generator': initSlug, 'timestamp-converter': initTime, 'text-analyzer': initText, 'regex-tester': initRegex };
  document.querySelectorAll('[data-tool]').forEach((root) => {
    const init = root.dataset.mode === 'server' ? initServer : tools[root.dataset.tool];
    if (init) init(root);
  });
}
