/**
 * FORGE — client-side tools. Every tool here runs locally; nothing is sent.
 * Each tool is a small init function bound to its [data-tool] root.
 */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

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
    setStatus(root, 'Copy is not available in this browser. Select the text and copy it manually.', true);
  }
}

/* 01 JSON --------------------------------------------------------------- */
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
        const line = raw.slice(0, pos).split('\n').length;
        const col = pos - raw.lastIndexOf('\n', pos - 1);
        where = ` at line ${line}, column ${col}`;
      }
      setStatus(root, `Invalid JSON${where}: ${err.message.replace(/^JSON\.parse: /, '')}`, true);
    }
  };
  root.querySelector('[data-action="format"]').addEventListener('click', () => run('format'));
  root.querySelector('[data-action="minify"]').addEventListener('click', () => run('minify'));
  root.querySelector('[data-action="copy"]').addEventListener('click', () => output.value && copyText(root, output.value));
}

/* 02 URL ---------------------------------------------------------------- */
function initUrl(root) {
  const input = root.querySelector('#url-in');
  const out = root.querySelector('[data-output]');
  const row = (k, v) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`;
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
    out.innerHTML = `<table class="forge-table"><caption class="overline">Parts</caption><tbody>${[
      ['Protocol', u.protocol.replace(':', '')],
      ['Host', u.hostname],
      ['Port', u.port || '(default)'],
      ['Path', u.pathname],
      ['Query', u.search || '(none)'],
      ['Fragment', u.hash || '(none)'],
      ['Origin', u.origin]
    ].map(([k, v]) => row(k, v)).join('')}</tbody></table>${
      params.length
        ? `<table class="forge-table"><caption class="overline">Query parameters (${params.length})</caption><tbody>${params.map(([k, v]) => row(k, v || '(empty)')).join('')}</tbody></table>`
        : ''
    }`;
    setStatus(root, `Parsed. ${params.length} query parameter${params.length === 1 ? '' : 's'}.`);
  });
  root.querySelector('[data-action="encode"]').addEventListener('click', () => {
    const raw = input.value;
    if (!raw) return setStatus(root, 'Enter text first.', true);
    out.innerHTML = `<pre class="forge-pre">${esc(encodeURIComponent(raw))}</pre>`;
    setStatus(root, 'Encoded with encodeURIComponent.');
  });
  root.querySelector('[data-action="decode"]').addEventListener('click', () => {
    const raw = input.value;
    if (!raw) return setStatus(root, 'Enter text first.', true);
    try {
      out.innerHTML = `<pre class="forge-pre">${esc(decodeURIComponent(raw.replace(/\+/g, ' ')))}</pre>`;
      setStatus(root, 'Decoded.');
    } catch {
      setStatus(root, 'That string contains a malformed percent-escape.', true);
    }
  });
}

/* 03 Slug --------------------------------------------------------------- */
const STOP = new Set(['a', 'an', 'the', 'of', 'is', 'to', 'and', 'or', 'in', 'on', 'for', 'at', 'by', 'with']);
export function slugify(text, dropStop = false) {
  let words = String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
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

/* 04 Timestamp ---------------------------------------------------------- */
function initTime(root) {
  const input = root.querySelector('#time-in');
  const out = root.querySelector('[data-output]');
  const render = (date, label) => {
    if (Number.isNaN(date.getTime())) {
      out.innerHTML = '';
      return setStatus(root, 'Enter Unix seconds, milliseconds, or an ISO 8601 date.', true);
    }
    const secs = Math.floor(date.getTime() / 1000);
    out.innerHTML = `<table class="forge-table"><caption class="overline">${esc(label)}</caption><tbody>${[
      ['Unix seconds', secs],
      ['Unix milliseconds', date.getTime()],
      ['ISO 8601 (UTC)', date.toISOString()],
      ['Local', date.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })],
      ['Relative', relative(date)]
    ].map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
    setStatus(root, '');
  };
  const relative = (date) => {
    const diff = (date.getTime() - Date.now()) / 1000;
    const abs = Math.abs(diff);
    const unit = abs < 60 ? [abs, 'second'] : abs < 3600 ? [abs / 60, 'minute'] : abs < 86400 ? [abs / 3600, 'hour'] : [abs / 86400, 'day'];
    const n = Math.round(unit[0]);
    return `${n} ${unit[1]}${n === 1 ? '' : 's'} ${diff < 0 ? 'ago' : 'from now'}`;
  };
  root.querySelector('[data-action="convert"]').addEventListener('click', () => {
    const raw = input.value.trim();
    if (!raw) return setStatus(root, 'Enter a value first.', true);
    if (/^-?\d+$/.test(raw)) {
      const n = Number(raw);
      const ms = Math.abs(n) > 1e11 ? n : n * 1000;
      return render(new Date(ms), Math.abs(n) > 1e11 ? 'Read as milliseconds' : 'Read as seconds');
    }
    render(new Date(raw), 'Read as date string');
  });
  root.querySelector('[data-action="now"]').addEventListener('click', () => {
    const now = new Date();
    input.value = String(Math.floor(now.getTime() / 1000));
    render(now, 'Now');
  });
}

/* 05 Text --------------------------------------------------------------- */
function initText(root) {
  const input = root.querySelector('#text-in');
  const out = root.querySelector('[data-output]');
  const run = () => {
    const t = input.value;
    const words = t.trim() ? t.trim().split(/\s+/).length : 0;
    const chars = t.length;
    const charsNoSpace = t.replace(/\s/g, '').length;
    const sentences = t.trim() ? (t.match(/[^.!?]+[.!?]+(\s|$)/g) || [t.trim()]).length : 0;
    const paragraphs = t.trim() ? t.trim().split(/\n\s*\n/).length : 0;
    const minutes = Math.max(0, Math.round((words / 220) * 10) / 10);
    out.innerHTML = [
      ['Words', words],
      ['Characters', chars],
      ['Without spaces', charsNoSpace],
      ['Sentences', sentences],
      ['Paragraphs', paragraphs],
      ['Reading time', words ? `${minutes < 1 ? '< 1' : minutes} min` : '0 min']
    ]
      .map(([k, v]) => `<div><span class="project-type">${esc(k)}</span><strong>${esc(v.toLocaleString ? v.toLocaleString() : v)}</strong></div>`)
      .join('');
  };
  input.addEventListener('input', run);
  run();
}

export function initForge() {
  const tools = { json: initJson, url: initUrl, slug: initSlug, time: initTime, text: initText };
  document.querySelectorAll('[data-tool]').forEach((root) => {
    const init = tools[root.dataset.tool];
    if (init) init(root);
  });
}
