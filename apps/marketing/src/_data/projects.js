/**
 * Named projects — every entry and every fact here comes from the résumé
 * (JCGD_resume.pdf, "Work experience" and "Notable projects"). `kind` keeps
 * the résumé's own distinctions: client work is client work, a demo is a
 * demo, a concept is a concept. No metric is stated that the résumé does not
 * state, and "result" describes what was delivered, not an outcome figure.
 *
 * Fields used by the case-study page (project.njk) via _data/portfolio.js:
 *   kind      – Client work / Internal tool / Portfolio demo / Redesign concept / …
 *   role      – my role on the project
 *   context   – what the project is and who it is for
 *   approach  – what I built and how
 *   facts     – delivered features (bullet list)
 *   result    – delivery status, stated plainly
 */
import { loadContent } from '../../lib/content-data.js';

/* Authored as Markdown with front matter in /content/projects, one file per
   project, so the CMS and the site read the same files. The order below is the
   order the résumé presents them in; a project not listed sorts last. */
const ORDER = [
  'spade-website',
  'argus',
  'spade-handler',
  'spade-inbox',
  'content-pipeline',
  'spade-academy',
  'rankking',
  'meridian',
  'paha',
  'eskwela',
  'st-clair',
  'delta-one',
  'brewfest',
  'bakerich',
  'lracdimension',
];

export default loadContent('projects').sort((a, b) => {
  const ai = ORDER.indexOf(a.slug);
  const bi = ORDER.indexOf(b.slug);
  return (ai === -1 ? ORDER.length : ai) - (bi === -1 ? ORDER.length : bi);
});
