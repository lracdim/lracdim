/**
 * Services — organised around what a client needs, not around technology.
 * Authored as Markdown with front matter in /content/services; `sectors` are
 * slugs from _data/industries.js.
 */
import { loadContent } from '../../lib/content-data.js';

// The page reads them in a deliberate order, so keep the authored order by id.
const ORDER = ['operations', 'automation', 'scheduling', 'reporting', 'integrations'];

export default loadContent('services').sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
