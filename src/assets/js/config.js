/**
 * Runtime configuration, read from the JSON block the layout prints. Kept
 * as data rather than an inline script so the Content-Security-Policy can
 * forbid inline scripts entirely. Empty strings degrade honestly.
 */
function load() {
  try {
    const el = document.getElementById('lracdim-config');
    return el ? JSON.parse(el.textContent) : {};
  } catch {
    return {};
  }
}
export const CFG = load();
/* Compatibility: modules cached by browsers before the JSON-config refactor
   read window.LRACDIM at evaluation time. studio.js imports this file first,
   so the global exists before any of them evaluate. */
window.LRACDIM = CFG;
