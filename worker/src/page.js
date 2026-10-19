/**
 * The parsed page the analyzers read: what the Python analyzers took from
 * BeautifulSoup, collected in one streaming pass with htmlparser2 so CPU
 * stays within the Workers free plan.
 *
 * Text follows BeautifulSoup's rules: adjacent text is one string, strings
 * are stripped, `get_text(" ", strip=True)` joins them with a space and
 * `get_text(strip=True)` joins them with nothing.
 */
import { Parser } from 'htmlparser2';

// Elements whose own text the analyzers read.
const TEXT_TAGS = new Set(['title', 'style', 'script', 'a', 'button', 'p', 'label']);
// Removed before reading visible text (the Python analyzers decompose these).
const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template']);

export function relTokens(el) {
  return String(el.attrs.rel || '').split(/\s+/).filter(Boolean);
}

export class Page {
  constructor(html) {
    this.html = html;
    this.elements = [];
    this.byTag = new Map();
    this.bodyStrings = [];
    this.outsideHeadStrings = [];
    this.hasBody = false;
    this._parse(html);
  }

  _parse(html) {
    const stack = [];
    let pending = '';
    let skipDepth = 0;
    let labelDepth = 0;
    let bodyDepth = 0;
    let headDepth = 0;
    let titleDepth = 0;

    const flush = () => {
      if (!pending) return;
      const raw = pending;
      pending = '';
      for (let i = stack.length - 1; i >= 0; i--) {
        if (TEXT_TAGS.has(stack[i].tag)) stack[i].strings.push(raw);
      }
      if (skipDepth === 0) {
        const s = raw.trim();
        if (s) {
          if (bodyDepth > 0) this.bodyStrings.push(s);
          // Without a <body>, lxml still puts the title in <head>, so it is not body text.
          if (headDepth === 0 && titleDepth === 0) this.outsideHeadStrings.push(s);
        }
      }
    };

    const parser = new Parser(
      {
        onopentag: (name, attrs) => {
          flush();
          const el = { tag: name, attrs, skipped: skipDepth > 0, inLabel: labelDepth > 0, strings: [], hasAltImg: false };
          if (name === 'img' && 'alt' in attrs) {
            for (const open of stack) if (open.tag === 'a' || open.tag === 'button') open.hasAltImg = true;
          }
          this.elements.push(el);
          if (!this.byTag.has(name)) this.byTag.set(name, []);
          this.byTag.get(name).push(el);
          stack.push(el);
          if (SKIP_TAGS.has(name)) skipDepth++;
          if (name === 'label') labelDepth++;
          if (name === 'body') {
            bodyDepth++;
            this.hasBody = true;
          }
          if (name === 'head') headDepth++;
          if (name === 'title') titleDepth++;
        },
        ontext: (text) => {
          pending += text;
        },
        onclosetag: (name) => {
          flush();
          // Close back to the matching element; htmlparser2 reports implied closes too.
          for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].tag !== name) continue;
            const closed = stack.splice(i);
            for (const el of closed) {
              if (SKIP_TAGS.has(el.tag)) skipDepth--;
              if (el.tag === 'label') labelDepth--;
              if (el.tag === 'body') bodyDepth--;
              if (el.tag === 'head') headDepth--;
              if (el.tag === 'title') titleDepth--;
            }
            break;
          }
        }
      },
      { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true, recognizeSelfClosing: true }
    );
    parser.write(html);
    parser.end();
    flush();
  }

  /** Every element with this tag, in document order. */
  all(...tags) {
    if (tags.length === 1) return this.byTag.get(tags[0]) || [];
    const wanted = new Set(tags);
    return this.elements.filter((el) => wanted.has(el.tag));
  }

  first(tag, pred = () => true) {
    return this.all(tag).find(pred) || null;
  }

  /** BeautifulSoup get_text(" ", strip=True). */
  static spaced(el) {
    return el.strings.map((s) => s.trim()).filter(Boolean).join(' ');
  }

  /** BeautifulSoup get_text(strip=True). */
  static stripped(el) {
    return el.strings.map((s) => s.trim()).join('');
  }

  /** Unstripped text content, as get_text() or .string. */
  static raw(el) {
    return el.strings.join('');
  }

  /** Visible text with whitespace collapsed: the body without script, style, noscript, template. */
  visibleText() {
    if (this._visible === undefined) {
      const strings = this.hasBody ? this.bodyStrings : this.outsideHeadStrings;
      this._visible = strings.join(' ').replace(/\s+/g, ' ').trim();
    }
    return this._visible;
  }

  get doctype() {
    return this.html.trimStart().slice(0, 15).toLowerCase().startsWith('<!doctype');
  }

  get title() {
    const t = this.first('title');
    return t ? Page.raw(t).trim() : '';
  }

  meta(attr, value) {
    return this.first('meta', (m) => m.attrs[attr] === value);
  }

  linkRel(token) {
    return this.first('link', (l) => relTokens(l).includes(token));
  }
}

export function pageContext(fetched) {
  const u = new URL(fetched.final_url);
  return { fetched, page: new Page(fetched.text), host: u.hostname.toLowerCase(), scheme: u.protocol.replace(':', '') };
}

/**
 * Python's str.lstrip("www.") strips any leading "w" and "." characters, not
 * the prefix. The Python analyzers compare hosts that way, so this does too.
 */
const lstripW = (s) => s.replace(/^[w.]+/, '');

export function isInternal(ctx, href) {
  let u;
  try {
    u = new URL(href, 'http://relative.invalid/');
  } catch {
    return true;
  }
  if (u.hostname === 'relative.invalid') return true;
  return lstripW(u.hostname.toLowerCase()) === lstripW(ctx.host);
}
