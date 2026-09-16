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
