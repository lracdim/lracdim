/**
 * Analysis runner.
 *
 * A browser cannot read a third-party origin's HTML directly — CORS returns
 * an opaque response. So:
 *
 *   1. If site.scanEndpoint is configured (the Cloudflare Worker in
 *      workers/scan/), fetch the real document through it.   mode: 'live'
 *   2. Otherwise fall back to a deterministic profile derived from the URL
 *      string, and say so in the report.                      mode: 'profiled'
 *
 * The report carries `mode` so the UI can never present a profiled run as
 * a live scan.
 */

import { analyzeWebsite } from './engine.js';

const CFG = window.LRACDIM || {};
const FETCH_TIMEOUT_MS = 12000;

/** Deterministic synthetic markup, seeded by the URL string. */
function profileHTML(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) hash = url.charCodeAt(i) + ((hash << 5) - hash);
  const seed = Math.abs(hash);

  const domDepth = 5 + (seed % 25);
  const scriptCount = 5 + (seed % 25);
  const imgCount = 5 + (seed % 40);
  const hasAlt = seed % 2 === 0;

  let html =
    '<!DOCTYPE html><html lang="' +
    (seed % 20 === 0 ? '' : 'en') +
    '"><head><title>Operational profile for ' +
    url +
    '</title><meta name="description" content="Structural profile generated from the public URL signature."></head><body><h1>Main Title</h1><div id="app">';

  let closers = '';
  for (let i = 0; i < domDepth; i++) {
    html += `<div><p>Structural content level ${i} with representative body copy.</p>`;
    closers += '</div>';
  }
  html += closers;

  for (let i = 0; i < scriptCount; i++) html += `<script src="script-${i}.js"><\/script>`;
  for (let i = 0; i < imgCount; i++) {
    html += `<img src="img-${i}.jpg" ${hasAlt && i % 3 !== 0 ? 'alt="An image"' : ''} />`;
  }

  return html + '</div></body></html>';
}

/** Normalise bare input like "company.com" into a URL. */
export function normalizeUrl(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function liveFetch(url) {
  const endpoint = new URL(CFG.scanEndpoint);
  endpoint.searchParams.set('url', url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint.toString(), { signal: controller.signal, mode: 'cors' });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { error: data && data.error ? data.error : `Scanner returned ${res.status}.` };
    }
    return data;
  } catch (err) {
    return { error: err && err.name === 'AbortError' ? 'The scanner timed out.' : 'The scanner could not be reached.' };
  } finally {
    clearTimeout(timer);
  }
}

export async function runAnalysis(rawUrl) {
  const url = normalizeUrl(rawUrl);

  let html = null;
  let loadTimeSeconds = 0;
  let mode = 'profiled';
  let finalUrl = url;
  let liveError = null;

  if (CFG.scanEndpoint) {
    const live = await liveFetch(url);
    if (live.error) {
      liveError = live.error;
    } else {
      html = live.html;
      loadTimeSeconds = live.loadMs / 1000;
      finalUrl = live.finalUrl || url;
      mode = 'live';
    }
  }

  if (html === null) {
    await new Promise((r) => setTimeout(r, 900));
    html = profileHTML(url);
    loadTimeSeconds = 0.5 + (Math.abs(url.length * 37) % 200) / 100;
  }

  const report = analyzeWebsite(html, finalUrl, loadTimeSeconds);
  report.mode = mode;
  report.liveError = liveError;
  return report;
}
