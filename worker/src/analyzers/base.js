/**
 * Shared analyzer contract, ported from api/app/analyzers/base.py. Each
 * analyzer receives a context (the fetched document, parsed once) and returns
 * {category, findings, metrics}. Scores come from scoring.js, not from here.
 */
import { BudgetExhausted, FetchError, fetchPage } from '../fetcher.js';

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];

export function finding(code, severity, title, evidence, explanation, recommendation, impact) {
  if (!SEVERITIES.includes(severity)) throw new Error(`bad severity ${severity}`);
  return { code, severity, title, evidence, explanation, recommendation, impact };
}

export const result = (category, findings = [], metrics = {}) => ({ category, findings, metrics });

/** "1,234,567", as Python's f"{n:,}". */
export const thousands = (n) => n.toLocaleString('en-US');

/**
 * Fetch a small text file once per examination (robots.txt is read by both
 * the SEO and AI analyzers). Resolves to the fetched response or null.
 */
export async function fetchCached(ctx, url, opts) {
  ctx.cache ??= new Map();
  if (!ctx.cache.has(url)) {
    ctx.cache.set(
      url,
      fetchPage(url, { budget: ctx.budget, ...opts }).catch((err) => {
        if (err instanceof FetchError || err instanceof BudgetExhausted) return null;
        throw err;
      })
    );
  }
  return ctx.cache.get(url);
}

export const origin = (ctx) => `${ctx.scheme}://${ctx.host}/`;
