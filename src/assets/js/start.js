/**
 * /start/ intake form → lead pipeline.
 */

import { postLead } from './leads.js';
import { api, hasApi } from './api.js';
import { CFG } from './config.js';

export function initStartForm() {
  const form = document.querySelector('[data-start-form]');
  if (!form) return;

  const status = form.querySelector('[data-start-status]');
  const done = document.querySelector('[data-start-done]');
  const doneCopy = document.querySelector('[data-start-done-copy]');

  if (!hasApi() && !CFG.leadWebhook && status) {
    status.textContent =
      'The intake API is not connected on this deployment yet. Anything you send is kept in this browser only — use the email link instead.';
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
      current: form.elements.current ? form.elements.current.value.trim() : '',
      outcome: form.elements.outcome ? form.elements.outcome.value.trim() : '',
      timeline: form.elements.timeline ? form.elements.timeline.value : '',
      message: form.elements.message.value.trim()
    };

    /* Attach the most recent diagnostic report, if one was run this session. */
    try {
      const last = sessionStorage.getItem('lracdim:last-report');
      if (last) fields.lastDiagnostic = JSON.parse(last);
    } catch {
      /* ignore */
    }

    let result;
    if (hasApi()) {
      try {
        const res = await api('/api/contact', {
          method: 'POST',
          body: {
            name: fields.name,
            email: fields.email,
            company: fields.company || null,
            project_type: fields.need,
            problem: fields.message,
            current_system: fields.current || null,
            desired_outcome: fields.outcome || null,
            timeline: fields.timeline || null,
            budget_range: fields.budget || null,
            additional: [
              (form.elements.additional && form.elements.additional.value.trim()) || '',
              fields.lastDiagnostic ? `Last Vector examination: ${fields.lastDiagnostic.url} scored ${fields.lastDiagnostic.health}/100 on ${fields.lastDiagnostic.timestamp || 'this session'}${fields.lastDiagnostic.id ? ` · report /vector/audit/${fields.lastDiagnostic.id}/` : ''}` : ''
            ].filter(Boolean).join('\n\n') || null,
            website: fields.website || null,
            honeypot: (form.elements.website2 && form.elements.website2.value) || null
          }
        });
        result = { sent: !!res.received, id: res.id };
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Send it ↗';
        if (err.fields && err.fields.length) {
          const map = { project_type: 'need', problem: 'message', budget_range: 'budget', current_system: 'current', desired_outcome: 'outcome' };
          err.fields.forEach((f) => {
            const input = form.elements[map[f.field] || f.field];
            const wrap = input && input.closest('.intake__field');
            if (wrap) {
              wrap.classList.add('is-invalid');
              const e = wrap.querySelector('[data-error]');
              if (e) e.textContent = f.message;
            }
          });
        }
        if (status) status.textContent = err.code === 'rate_limited' ? 'Too many submissions from this connection. Try again later or email me directly.' : `Could not send: ${err.message} Email ${CFG.email || 'me'} directly instead.`;
        return;
      }
    } else {
      result = await postLead('start', fields);
    }

    form.hidden = true;
    done.hidden = false;
    doneCopy.textContent = result.sent
      ? `Received. A written reply goes to ${fields.email} within one business day.`
      : `Delivery is not connected on this deployment, so your message was kept in this browser only. Email ${CFG.email || 'me'} directly and paste it in — I read every one.`;
    done.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}
