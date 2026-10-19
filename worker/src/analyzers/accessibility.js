import { Page } from '../page.js';
import { finding as F, result } from './base.js';

const LANDMARKS = ['header', 'nav', 'main', 'footer'];
const ROLES = { header: 'banner', nav: 'navigation', main: 'main', footer: 'contentinfo' };
const NOT_CONTROLS = ['hidden', 'submit', 'button', 'reset', 'image'];
const GENERIC = ['click here', 'read more', 'here', 'more', 'learn more'];

/** Static accessibility checks. Contrast needs computed styles and is not measured. */
export function accessibility(ctx) {
  const page = ctx.page;
  const findings = [];
  const imgs = page.all('img');
  const missingAlt = imgs.filter((i) => !('alt' in i.attrs));
  const inputs = page.all('input', 'select', 'textarea').filter((i) => !NOT_CONTROLS.includes((i.attrs.type || '').toLowerCase()));
  const labelledIds = new Set(page.all('label').map((l) => l.attrs.for).filter(Boolean));
  const unlabelled = inputs.filter((i) => !((i.attrs.id && labelledIds.has(i.attrs.id)) || i.attrs['aria-label'] || i.attrs['aria-labelledby'] || i.inLabel || i.attrs.title));
  const emptyButtons = page.all('button').filter((b) => !(Page.stripped(b) || b.attrs['aria-label'] || b.hasAltImg));
  const links = page.all('a').filter((a) => 'href' in a.attrs);
  const emptyLinks = links.filter((a) => !(Page.stripped(a) || a.attrs['aria-label'] || a.hasAltImg));
  const landmarks = LANDMARKS.filter((t) => page.all(t).length || page.elements.some((el) => el.attrs.role === ROLES[t]));
  const skipLink = page.all('a').some((a) => (a.attrs.href || '').startsWith('#') && Page.stripped(a).toLowerCase().includes('skip'));
  const html = page.first('html');
  const lang = (html && html.attrs.lang) || '';
  const generic = links.filter((a) => GENERIC.includes(Page.stripped(a).toLowerCase()));

  const metrics = {
    images: imgs.length,
    images_missing_alt: missingAlt.length,
    form_controls: inputs.length,
    unlabelled_controls: unlabelled.length,
    empty_buttons: emptyButtons.length,
    empty_links: emptyLinks.length,
    landmarks,
    skip_link: skipLink,
    lang,
    generic_link_text: generic.length,
    note: 'Static checks only. Colour contrast and keyboard behaviour need a rendered page and are not measured.'
  };

  if (missingAlt.length) {
    findings.push(F('a11y_missing_alt', missingAlt.length > 3 ? 'high' : 'medium', 'Images with no alt attribute', `${missingAlt.length} of ${imgs.length} images have no alt attribute at all.`, 'Screen readers announce the file name or nothing.', 'Add alt text, or alt="" for purely decorative images.', 'Images become meaningful to non-visual users.'));
  }
  if (unlabelled.length) {
    findings.push(F('unlabelled_controls', 'high', 'Form controls without labels', `${unlabelled.length} of ${inputs.length} inputs have no associated label.`, 'Assistive technology cannot say what the field is for.', 'Add a <label for> or aria-label to each control.', 'Forms become usable with a screen reader.'));
  }
  if (emptyButtons.length) {
    findings.push(F('empty_buttons', 'medium', 'Buttons with no accessible name', `${emptyButtons.length} buttons contain no text or aria-label.`, 'Icon-only buttons are announced as just "button".', 'Add visually hidden text or an aria-label.', 'Every control is announced by purpose.'));
  }
  if (emptyLinks.length) {
    findings.push(F('empty_links', 'medium', 'Links with no accessible name', `${emptyLinks.length} links contain no text or labelled image.`, 'The link is announced without a destination.', 'Add link text or an aria-label.', 'Links make sense out of context.'));
  }
  const missingLandmarks = LANDMARKS.filter((t) => !landmarks.includes(t));
  if (missingLandmarks.length >= 2) {
    findings.push(F('few_landmarks', 'medium', 'Missing page landmarks', `Missing: ${missingLandmarks.join(', ')}.`, 'Landmarks let keyboard and screen-reader users jump between regions.', 'Wrap regions in header, nav, main, and footer elements.', 'Direct navigation to content.'));
  }
  if (!lang) {
    findings.push(F('a11y_no_lang', 'medium', 'No document language', 'The <html> element has no lang attribute.', 'Screen readers may read the page with the wrong pronunciation rules.', 'Add lang to the <html> element.', 'Correct speech output.'));
  }
  if (generic.length > 3) {
    findings.push(F('generic_links', 'low', 'Generic link text', `${generic.length} links read "click here", "read more", or similar.`, 'Link lists in screen readers lose all meaning.', 'Make link text describe the destination.', 'Links are understandable in isolation.'));
  }
  return result('accessibility', findings, metrics);
}
