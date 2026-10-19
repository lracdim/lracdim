import { Page } from '../page.js';
import { pyRound } from '../scoring.js';
import { finding as F, result } from './base.js';

export function content(ctx) {
  const page = ctx.page;
  const visible = (els) => els.filter((el) => !el.skipped);
  const text = page.visibleText();
  const words = text ? text.split(' ') : [];
  const wordCount = words.length;
  const htmlLen = Math.max(1, ctx.fetched.body.byteLength);
  const ratio = pyRound(text.length / htmlLen, 3);
  const headings = {};
  for (let i = 1; i <= 6; i++) headings[`h${i}`] = visible(page.all(`h${i}`)).length;
  const paragraphs = visible(page.all('p'));
  const longParas = paragraphs.filter((p) => Page.spaced(p).split(/\s+/).filter(Boolean).length > 150);
  const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim());
  const avgSentence = pyRound(wordCount / Math.max(1, sentences.length), 1);
  const placeholder = /lorem ipsum|coming soon|under construction/i.test(text);
  const lists = visible(page.all('ul', 'ol')).length;

  const metrics = {
    word_count: wordCount,
    text_to_html_ratio: ratio,
    headings,
    paragraphs: paragraphs.length,
    long_paragraphs: longParas.length,
    avg_sentence_words: avgSentence,
    lists,
    placeholder_text: placeholder
  };
  const findings = [];
  if (wordCount < 120) {
    findings.push(F('thin_content', 'high', 'Very little text content', `${wordCount} words of visible text.`, 'Search engines and visitors have almost nothing to evaluate the page by.', 'Write the page: what it is, who it is for, what to do next.', 'The page can rank and convert on its own merits.'));
  } else if (wordCount < 300) {
    findings.push(F('light_content', 'medium', 'Light text content', `${wordCount} words of visible text.`, 'Short pages compete poorly for informational searches.', 'Expand the page with specific, useful detail.', 'More queries the page can answer.'));
  }
  if (ratio < 0.08 && wordCount > 0) {
    findings.push(F('low_text_ratio', 'low', 'Low text-to-markup ratio', `Visible text is ${pyRound(ratio * 100)}% of the document.`, 'Most of the download is markup and code rather than content.', 'Trim wrappers and inline code; keep content in the document.', 'Leaner page for the same content.'));
  }
  if (Object.values(headings).reduce((a, b) => a + b, 0) === 0 && wordCount > 200) {
    findings.push(F('no_headings', 'medium', 'No headings', 'No h1 to h6 elements.', 'Long text without structure is hard to scan and to outline.', 'Break content into sections with headings.', 'Scannable, navigable content.'));
  }
  if (longParas.length) {
    findings.push(F('long_paragraphs', 'low', 'Very long paragraphs', `${longParas.length} paragraphs exceed 150 words.`, 'Dense blocks are skipped on screens.', 'Split paragraphs; use lists where the content is a list.', 'Higher reading completion.'));
  }
  if (placeholder) {
    findings.push(F('placeholder_text', 'high', 'Placeholder text is live', 'Text such as lorem ipsum, coming soon, or under construction was found.', 'The page publishes unfinished content.', 'Replace placeholders or unpublish the page.', 'No unfinished content in production.'));
  }
  return result('content', findings, metrics);
}
