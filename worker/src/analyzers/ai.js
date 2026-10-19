/**
 * AI visibility: can AI search and answer engines read and cite this site?
 * Ported from api/app/analyzers/ai_visibility.py; see that module for the
 * reasoning behind each check.
 */
import { Page } from '../page.js';
import { fetchCached, finding as F, origin, result } from './base.js';

// Crawlers that fetch pages so an AI product can cite them in answers.
const ANSWER_CRAWLERS = {
  'OAI-SearchBot': 'ChatGPT search',
  'ChatGPT-User': 'ChatGPT browsing',
  PerplexityBot: 'Perplexity',
  'Claude-SearchBot': 'Claude search',
  'Claude-User': 'Claude browsing'
};
// Crawlers that collect training data. Blocking them does not remove a site from answers.
const TRAINING_CRAWLERS = {
  GPTBot: 'OpenAI training',
  ClaudeBot: 'Anthropic training',
  'Google-Extended': 'Google AI training',
  CCBot: 'Common Crawl',
  'Applebot-Extended': 'Apple AI training'
};

/** Consecutive user-agent lines share the rules that follow them. */
export function parseRobotsGroups(text) {
  const groups = [];
  let agents = [];
  let rules = [];
  let inRules = false;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.split('#', 1)[0].trim();
    if (!line || !line.includes(':')) continue;
    const idx = line.indexOf(':');
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (inRules) {
        groups.push([agents, rules]);
        agents = [];
        rules = [];
        inRules = false;
      }
      agents.push(value.toLowerCase());
    } else if (key === 'allow' || key === 'disallow') {
      inRules = true;
      rules.push([key, value]);
    }
  }
  if (agents.length) groups.push([agents, rules]);
  return groups;
}

/** True when the group that applies to `agent` disallows the site root. */
export function isBlocked(groups, agent) {
  const name = agent.toLowerCase();
  const specific = groups.filter(([agents]) => agents.includes(name)).map(([, rules]) => rules);
  const applicable = specific.length ? specific : groups.filter(([agents]) => agents.includes('*')).map(([, rules]) => rules);
  return applicable.some((rules) => rules.some(([k, v]) => k === 'disallow' && v === '/') && !rules.some(([k, v]) => k === 'allow' && v === '/'));
}

async function textFile(ctx, url) {
  const r = await fetchCached(ctx, url, { timeout: 6000, maxBytes: 200_000 });
  if (!r || r.status !== 200 || (r.headers['content-type'] || '').includes('html')) return null;
  return r.text;
}

function structuredData(page) {
  const types = new Set();
  let invalid = 0;
  for (const tag of page.all('script').filter((s) => s.attrs.type === 'application/ld+json')) {
    let data;
    try {
      data = JSON.parse(Page.raw(tag));
    } catch {
      invalid++;
      continue;
    }
    const stack = [data];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) stack.push(...node);
      else if (node && typeof node === 'object') {
        const t = node['@type'];
        if (typeof t === 'string') types.add(t);
        else if (Array.isArray(t)) t.filter((x) => typeof x === 'string').forEach((x) => types.add(x));
        stack.push(...Object.values(node).filter((v) => v && typeof v === 'object'));
      }
    }
  }
  return [[...types].sort(), invalid];
}

export async function ai(ctx, { checkRemote = true } = {}) {
  const findings = [];
  const base = origin(ctx);
  let robotsText = null;
  let llmsState = 'not checked';
  if (checkRemote) {
    robotsText = await textFile(ctx, new URL('/robots.txt', base).toString());
    const llms = await textFile(ctx, new URL('/llms.txt', base).toString());
    llmsState = llms && llms.trim() && !llms.trimStart().toLowerCase().startsWith('<!doctype') ? 'present' : 'missing';
  }
  const groups = parseRobotsGroups(robotsText || '');
  const blockedAnswer = Object.entries(ANSWER_CRAWLERS).filter(([ua]) => isBlocked(groups, ua)).map(([ua, label]) => `${ua} (${label})`);
  const blockedTraining = Object.entries(TRAINING_CRAWLERS).filter(([ua]) => isBlocked(groups, ua)).map(([ua, label]) => `${ua} (${label})`);
  const [types, invalidBlocks] = structuredData(ctx.page);
  const text = ctx.page.visibleText();
  const words = text ? text.split(' ').length : 0;
  const scripts = ctx.page.all('script').filter((s) => 'src' in s.attrs).length;

  const metrics = {
    robots_txt: !checkRemote ? 'not checked' : robotsText !== null ? 'present' : 'missing',
    answer_crawlers_blocked: blockedAnswer,
    training_crawlers_blocked: blockedTraining,
    llms_txt: llmsState,
    structured_data_types: types,
    structured_data_invalid_blocks: invalidBlocks,
    html_text_words: words,
    note: 'Reads robots.txt, llms.txt, JSON-LD, and the HTML text. Does not query any AI product, so it reports whether AI crawlers can read the site, not whether any answer mentions it.'
  };

  if (blockedAnswer.length) {
    findings.push(F('ai_answer_crawlers_blocked', blockedAnswer.length >= 3 ? 'high' : 'medium', 'robots.txt blocks AI answer crawlers', `Blocked: ${blockedAnswer.join(', ')}.`, 'These crawlers fetch pages so AI assistants can cite them. A blocked site cannot appear as a source in those answers.', 'Allow the answer crawlers you want to be cited by. Training crawlers can stay blocked separately.', 'The site becomes eligible as a cited source in AI search answers.'));
  }
  if (!types.length && !invalidBlocks) {
    findings.push(F('ai_no_structured_data', 'medium', 'No structured data', 'No JSON-LD blocks found in the page.', 'Answer engines and search features use structured data to identify the organisation, person, or product a page describes.', 'Add JSON-LD for the site owner (Organization or Person) and the page type (WebSite, Article, Product, LocalBusiness).', 'Clearer entity signals for AI answers and rich results.'));
  }
  if (invalidBlocks) {
    findings.push(F('ai_invalid_structured_data', 'medium', 'Structured data does not parse', `${invalidBlocks} JSON-LD block(s) are not valid JSON.`, 'Parsers discard invalid blocks entirely, so the markup has no effect.', 'Validate the JSON-LD and fix the syntax error; a trailing comma is the usual cause.', 'The structured data is read instead of ignored.'));
  }
  if (words < 120 && scripts >= 1) {
    findings.push(F('ai_content_requires_js', 'medium', 'Page text may need JavaScript to appear', `Only ${words} words of text in the HTML, with ${scripts} external scripts.`, 'Most AI crawlers read the HTML without running JavaScript, so text rendered by scripts is invisible to them.', 'Render the main content on the server or at build time.', 'AI crawlers can read and quote the page.'));
  }
  if (checkRemote && llmsState === 'missing') {
    findings.push(F('ai_no_llms_txt', 'low', 'No llms.txt', 'GET /llms.txt did not return a text file.', 'llms.txt is an emerging convention for a plain-language summary of a site for language models. Few systems read it yet, so its absence costs little today.', 'Publish /llms.txt with a one-paragraph description of the site and links to its most important pages.', 'A ready summary for tools that adopt the convention.'));
  }
  return result('ai', findings, metrics);
}
