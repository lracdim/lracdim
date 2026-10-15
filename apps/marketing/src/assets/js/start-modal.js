/**
 * Project intake — multi-step modal (replaces the old /start/ page).
 *
 * Opened by any [data-open-start] element or link to /?start=1 (event delegation, so links that
 * scripts render later work too), by landing on /?start=1, or by dispatching `open-start` on window.
 *
 *   Step 1  About you        name*, email*, company, website
 *   Step 2  The project      project type*, budget, timeline
 *   Step 3  The problem      problem*, current system, outcome, anything else
 *
 * Behaviour worth knowing:
 *  - Each step validates before moving on; the first invalid field is focused.
 *  - What you type is kept in sessionStorage as a draft, so closing the popup (or Escape) never
 *    loses it. It is cleared on a successful send and when the tab closes.
 *  - Submission is identical to the old page: the FastAPI /api/contact endpoint, falling back to the
 *    lead webhook / browser queue, and honest copy about which one actually happened.
 */

import { postLead } from './leads.js';
import { api, hasApi } from './api.js';
import { CFG } from './config.js';

const DRAFT_KEY = 'lracdim:start-draft';
const LAST_STEP = 3;
const STEP_TITLES = ['About you', 'The project', 'The problem'];
/* Which step each field lives on — used to jump back to a field the API rejected. */
const STEP_OF = { name: 1, email: 1, company: 1, website: 1, need: 2, budget: 2, timeline: 2, message: 3, current: 3, outcome: 3, additional: 3 };
const REQUIRED = { 1: ['name', 'email'], 2: ['need'], 3: ['message'] };
const FIELDS = Object.keys(STEP_OF);
/* API field names → form field names. */
const API_FIELD = { project_type: 'need', problem: 'message', budget_range: 'budget', current_system: 'current', desired_outcome: 'outcome' };
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([tabindex="-1"]), select, textarea, [tabindex]:not([tabindex="-1"])';
const FADE_MS = 380;

export function initStartModal() {
  const modal = document.getElementById('start-modal');
  if (!modal) return;

  const panel = modal.querySelector('.modal__panel');
  const form = modal.querySelector('[data-start-form]');
  const done = modal.querySelector('[data-start-done]');
  const doneCopy = modal.querySelector('[data-start-done-copy]');
  const status = modal.querySelector('[data-start-status]');
  const count = modal.querySelector('[data-start-count]');
  const dots = [...modal.querySelectorAll('[data-start-dot]')];
  const sections = [...modal.querySelectorAll('[data-start-step]')];
  const back = modal.querySelector('[data-start-back]');
  const next = modal.querySelector('[data-start-next]');
  const nextLabel = modal.querySelector('[data-start-next-label]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  let step = 1;
  let sending = false;
  let sent = false;
  let lastFocused = null;
  let closeTimer = null;
  let isolated = [];

  const field = (name) => form.elements[name];
  const isOpen = () => !modal.hidden;

  /* --- draft ------------------------------------------------------------- */

  function saveDraft() {
    if (sent) return;
    try {
      const values = {};
      FIELDS.forEach((name) => {
        const el = field(name);
        if (el && el.value) values[name] = el.value;
      });
      if (Object.keys(values).length) sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, values }));
      else sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* storage unavailable (private mode): the draft simply lives only while the popup is open */
    }
  }

  function restoreDraft() {
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
      if (!draft || !draft.values) return;
      FIELDS.forEach((name) => {
        const el = field(name);
        if (el && !el.value && typeof draft.values[name] === 'string') el.value = draft.values[name];
      });
      if (draft.step >= 1 && draft.step <= LAST_STEP) step = draft.step;
    } catch {
      /* corrupt draft: ignore */
    }
  }

  function clearDraft() {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  /* --- steps ------------------------------------------------------------- */

  function showStep(n, { focus = false } = {}) {
    step = n;
    sections.forEach((s) => (s.hidden = Number(s.dataset.startStep) !== n));
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-done', i + 1 < n);
      dot.classList.toggle('is-current', i + 1 === n);
    });
    count.innerHTML = `<b>Step ${n} of ${LAST_STEP}</b><span>${STEP_TITLES[n - 1]}</span>`;
    back.hidden = n === 1;
    nextLabel.textContent = n === LAST_STEP ? 'Send it' : 'Next';
    setStatus('');
    if (focus) focusFirstField();
  }

  function focusFirstField() {
    const section = sections[step - 1];
    const target = section && section.querySelector('input:not([tabindex="-1"]), select, textarea');
    if (target) target.focus();
  }

  function setStatus(message) {
    status.textContent = message;
  }

  /* --- validation -------------------------------------------------------- */

  function markInvalid(el, message) {
    const wrap = el.closest('.intake__field');
    wrap.classList.add('is-invalid');
    el.setAttribute('aria-invalid', 'true');
    let err = wrap.querySelector('[data-error]');
    if (!err) {
      /* Optional fields have no error slot until the API rejects one of them. */
      err = document.createElement('span');
      err.className = 'intake__error';
      err.id = `sm-${el.name}-error`;
      err.setAttribute('data-error', '');
      wrap.appendChild(err);
    }
    err.textContent = message;
    const described = (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
    if (!described.includes(err.id)) el.setAttribute('aria-describedby', [...described, err.id].join(' '));
  }

  function clearInvalid(el) {
    const wrap = el.closest('.intake__field');
    if (!wrap) return;
    wrap.classList.remove('is-invalid');
    el.removeAttribute('aria-invalid');
    const err = wrap.querySelector('[data-error]');
    if (err) err.textContent = '';
  }

  /** Validate one step. Returns the first invalid input, or null. */
  function validateStep(n) {
    let firstBad = null;
    REQUIRED[n].forEach((key) => {
      const el = field(key);
      const value = el.value.trim();
      const ok = key === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) : !!value;
      clearInvalid(el);
      if (!ok) {
        markInvalid(el, key === 'email' ? 'A working email is needed for the reply.' : key === 'need' ? 'Pick the closest match.' : 'Needed.');
        if (!firstBad) firstBad = el;
      }
    });
    return firstBad;
  }

  form.addEventListener('input', (e) => {
    clearInvalid(e.target);
    saveDraft();
  });
  form.addEventListener('change', saveDraft);

  /* --- navigation -------------------------------------------------------- */

  back.addEventListener('click', () => {
    if (step > 1) showStep(step - 1, { focus: true });
    saveDraft();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;

    const bad = validateStep(step);
    if (bad) {
      setStatus('One field needs attention before you continue.');
      bad.focus();
      return;
    }
    if (step < LAST_STEP) {
      showStep(step + 1, { focus: true });
      saveDraft();
      return;
    }
    /* Last step: check every step once more, in order, so nothing slips through. */
    for (let n = 1; n < LAST_STEP; n++) {
      const earlier = validateStep(n);
      if (earlier) {
        showStep(n);
        setStatus('A required field on an earlier step is empty.');
        earlier.focus();
        return;
      }
    }
    await send();
  });

  /* --- send -------------------------------------------------------------- */

  function collect() {
    const v = (name) => (field(name) ? field(name).value.trim() : '');
    const fields = {
      name: v('name'),
      company: v('company'),
      email: v('email'),
      website: v('website'),
      need: field('need').value,
      budget: field('budget').value,
      current: v('current'),
      outcome: v('outcome'),
      timeline: field('timeline').value,
      message: v('message')
    };
    /* Attach the most recent diagnostic report, if one was run this session. */
    try {
      const last = sessionStorage.getItem('lracdim:last-report');
      if (last) fields.lastDiagnostic = JSON.parse(last);
    } catch {
      /* ignore */
    }
    return fields;
  }

  function setSending(on) {
    sending = on;
    next.disabled = on;
    back.disabled = on;
    next.setAttribute('aria-busy', String(on));
    nextLabel.textContent = on ? 'Sending…' : 'Send it';
  }

  async function send() {
    const fields = collect();
    setSending(true);
    setStatus('');

    let result;
    if (hasApi()) {
      const extra = fields.lastDiagnostic
        ? `Last Vector examination: ${fields.lastDiagnostic.url} scored ${fields.lastDiagnostic.health}/100 on ${fields.lastDiagnostic.timestamp || 'this session'}${fields.lastDiagnostic.id ? ` · report /vector/audit/${fields.lastDiagnostic.id}/` : ''}`
        : '';
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
            additional: [field('additional').value.trim(), extra].filter(Boolean).join('\n\n') || null,
            website: fields.website || null,
            honeypot: field('website2').value || null
          }
        });
        result = { sent: !!res.received, id: res.id };
      } catch (err) {
        setSending(false);
        showSendError(err);
        return;
      }
    } else {
      result = await postLead('start', fields);
    }

    sent = true;
    clearDraft();
    setSending(false);
    form.hidden = true;
    done.hidden = false;
    doneCopy.textContent = result.sent
      ? `Received. A written reply goes to ${fields.email} within one business day.`
      : `Delivery is not connected on this deployment, so your message was kept in this browser only. Email ${CFG.email || 'me'} directly and paste it in — I read every one.`;
    modal.querySelector('#start-done-title').focus();
  }

  /** Show an API failure, jumping to the earliest step that holds a rejected field. */
  function showSendError(err) {
    let earliest = null;
    let firstEl = null;
    (err.fields || []).forEach((f) => {
      const name = API_FIELD[f.field] || f.field;
      const el = field(name);
      if (!el || !(name in STEP_OF)) return;
      markInvalid(el, f.message);
      if (earliest === null || STEP_OF[name] < earliest) {
        earliest = STEP_OF[name];
        firstEl = el;
      }
    });
    if (earliest !== null) {
      showStep(earliest);
      firstEl.focus();
    }
    const email = CFG.email || 'me';
    setStatus(
      err.code === 'rate_limited'
        ? 'Too many submissions from this connection. Try again later or email me directly.'
        : `Could not send: ${err.message} Email ${email} directly instead.`
    );
  }

  /* --- open / close ------------------------------------------------------ */

  /* The page behind the dialog must not be reachable by Tab or a screen reader. Only elements
     that were not already inert are touched (the closed nav drawer is), and only those are restored. */
  function isolate() {
    isolated = [...document.body.children].filter(
      (el) => el !== modal && !el.inert && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)
    );
    isolated.forEach((el) => (el.inert = true));
  }

  function release() {
    isolated.forEach((el) => (el.inert = false));
    isolated = [];
  }

  function open() {
    if (closeTimer) {
      /* Re-opened while fading out: just fade back in. */
      clearTimeout(closeTimer);
      closeTimer = null;
      modal.classList.add('is-open');
      return;
    }
    if (isOpen()) return;

    /* The diagnostic is a modal too. Let it finish closing (it restores focus and unlocks scroll) first. */
    const diagnostic = document.getElementById('diagnostic');
    if (diagnostic && !diagnostic.hidden) {
      const close = diagnostic.querySelector('[data-close-diagnostic]');
      if (close) close.click();
      setTimeout(open, FADE_MS + 40);
      return;
    }

    lastFocused = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;

    if (sent) resetAfterSend();
    restoreDraft();
    showStep(step);

    if (!hasApi() && !CFG.leadWebhook) {
      setStatus('The intake API is not connected on this deployment yet. Anything you send is kept in this browser only — use the email link instead.');
    }

    modal.hidden = false;
    document.body.classList.add('is-locked');
    isolate();
    void modal.offsetWidth; // commit the un-hidden state so the fade-in transition runs, with no frame-timing dependency
    modal.classList.add('is-open');
    setTimeout(() => {
      if (!isOpen()) return;
      if (sent) return;
      focusFirstField();
    }, 120);
  }

  function resetAfterSend() {
    sent = false;
    form.reset();
    FIELDS.forEach((name) => field(name) && clearInvalid(field(name)));
    form.hidden = false;
    done.hidden = true;
    step = 1;
  }

  function close({ immediate = false } = {}) {
    if (!isOpen()) return;
    saveDraft();
    modal.classList.remove('is-open');
    const finish = () => {
      closeTimer = null;
      modal.hidden = true;
      document.body.classList.remove('is-locked');
      release();
      if (sent) resetAfterSend();
      if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
      lastFocused = null;
    };
    clearTimeout(closeTimer);
    if (immediate || reduced.matches) finish();
    else closeTimer = setTimeout(finish, FADE_MS);
  }

  /* Any control that should start a project: [data-open-start], or a plain link to the old /start/
     URL or the new /?start=1. Modified clicks (new tab, etc.) are left to the browser. */
  document.addEventListener('click', (e) => {
    const trigger = e.target instanceof Element && e.target.closest('[data-open-start], a[href="/start/"], a[href="/?start=1"]');
    if (!trigger) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open();
  });

  window.addEventListener('open-start', open);

  modal.querySelectorAll('[data-close-start]').forEach((el) => el.addEventListener('click', () => close()));

  /* "Run the diagnostic while you wait": hand over to the other modal once this one has closed. */
  modal.querySelector('[data-start-diagnostic]')?.addEventListener('click', () => {
    close();
    setTimeout(() => window.dispatchEvent(new CustomEvent('open-diagnostic')), FADE_MS + 40);
  });
  /* A link inside the confirmation (e.g. the industry blueprints) navigates away; don't leave the popup over it. */
  done.querySelectorAll('a[href]').forEach((a) => a.addEventListener('click', () => close({ immediate: true })));

  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  /* Landing on /?start=1 (the old /start/ URL redirects here) opens the popup, then tidies the URL. */
  const params = new URLSearchParams(location.search);
  if (params.has('start')) {
    params.delete('start');
    const query = params.toString();
    history.replaceState(history.state, '', location.pathname + (query ? `?${query}` : '') + location.hash);
    open();
  }
}
