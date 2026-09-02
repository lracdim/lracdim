/**
 * /start/ intake form → lead pipeline.
 */

import { postLead } from './leads.js';

const CFG = window.LRACDIM || {};

export function initStartForm() {
  const form = document.querySelector('[data-start-form]');
  if (!form) return;

  const status = form.querySelector('[data-start-status]');
  const done = document.querySelector('[data-start-done]');
  const doneCopy = document.querySelector('[data-start-done-copy]');

  if (!CFG.leadWebhook && status) {
    status.textContent =
      'The lead pipeline is not connected on this deployment yet. Anything you send is kept in this browser only — use the email link instead.';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    let firstBad = null;
    form.querySelectorAll('.intake__field').forEach((f) => f.classList.remove('is-invalid'));
    form.querySelectorAll('[data-error]').forEach((n) => (n.textContent = ''));

    ['name', 'email', 'need', 'message'].forEach((key) => {
      const input = form.elements[key];
      if (!input) return;
      const ok =
        key === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim()) : !!input.value.trim();
      if (!ok) {
        const wrap = input.closest('.intake__field');
        wrap.classList.add('is-invalid');
        const err = wrap.querySelector('[data-error]');
        if (err) err.textContent = key === 'email' ? 'A working email is needed for the reply.' : 'Needed.';
        if (!firstBad) firstBad = input;
      }
    });

    if (firstBad) {
      firstBad.focus();
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    const fields = {
      name: form.elements.name.value.trim(),
      company: form.elements.company.value.trim(),
      email: form.elements.email.value.trim(),
      website: form.elements.website.value.trim(),
      need: form.elements.need.value,
      budget: form.elements.budget.value,
      message: form.elements.message.value.trim()
    };

    /* Attach the most recent diagnostic report, if one was run this session. */
    try {
      const last = sessionStorage.getItem('lracdim:last-report');
      if (last) fields.lastDiagnostic = JSON.parse(last);
    } catch {
      /* ignore */
    }

    const result = await postLead('start', fields);

    form.hidden = true;
    done.hidden = false;
    doneCopy.textContent = result.sent
      ? `Your message is in the pipeline. A written reply goes to ${fields.email} within one business day.`
      : `Delivery is not connected on this deployment, so your message was kept in this browser only. Email ${CFG.email || 'me'} directly and paste it in — I read every one.`;
    done.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}
