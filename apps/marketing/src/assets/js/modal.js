/**
 * The "Diagnose my site" popup.
 *
 * Opened by any element with [data-open-diagnostic], or by dispatching
 * `window.dispatchEvent(new CustomEvent('open-diagnostic'))`. It hands the
 * address to Vector, which runs the real examination: the visitor sees the
 * summary on /vector/ and gets the full report by email through its form.
 * The optional email and "pain point" typed here pre-fill that form.
 */
import { normalizeUrl } from './analyzer/service.js';

const PREFILL_KEY = 'lracdim:report-prefill'; // read by vector.js

export function initDiagnosticModal() {
  const modal = document.getElementById('diagnostic');
  if (!modal) return;

  const panel = modal.querySelector('.modal__panel');
  const form = modal.querySelector('#diagnostic-form');
  const urlField = modal.querySelector('#diag-url');
  const errorEl = modal.querySelector('[data-diag-error]');

  let lastFocused = null;

  function open() {
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('is-locked');
    // Next frame so the transition runs.
    requestAnimationFrame(() => modal.classList.add('is-open'));
    setTimeout(() => urlField && urlField.focus(), 120);
  }

  function close() {
    modal.classList.remove('is-open');
    setTimeout(() => {
      modal.hidden = true;
      document.body.classList.remove('is-locked');
      if (form) form.reset();
      if (errorEl) errorEl.textContent = '';
      if (lastFocused) lastFocused.focus();
    }, 380);
  }

  document.querySelectorAll('[data-open-diagnostic]').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      open();
    });
  });

  window.addEventListener('open-diagnostic', open);

  modal.querySelectorAll('[data-close-diagnostic]').forEach((el) => el.addEventListener('click', close));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
    // Trap focus inside the panel.
    if (e.key === 'Tab' && !modal.hidden && panel) {
      const focusable = panel.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const visible = Array.from(focusable).filter((el) => el.offsetParent !== null);
      if (!visible.length) return;
      const first = visible[0];
      const last = visible[visible.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = normalizeUrl(urlField.value);
      if (!url) {
        if (errorEl) errorEl.textContent = 'Enter your website address, for example company.com.';
        urlField.focus();
        return;
      }
      const email = (form.elements.email && form.elements.email.value.trim()) || '';
      const note = (form.elements.pain && form.elements.pain.value.trim()) || '';
      try {
        if (email || note) sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ email, note }));
      } catch {}
      location.assign(`/vector/?url=${encodeURIComponent(url)}`);
    });
  }
}
