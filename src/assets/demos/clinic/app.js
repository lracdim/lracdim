/* ==========================================================================
   Alder Street Family Health — demo application
   --------------------------------------------------------------------------
   One module drives the whole template: the availability grid on the home
   page, the booking form, and the staff portal.

   The loop that matters:
     book page submit  ->  localStorage appointment (isNew)
                       ->  portal Today's schedule
     check in          ->  status "waiting", arrival stamped
     complete visit    ->  status "completed" + an open invoice in Billing

   All company data arrives from clinic.json via #demo-data. Nothing about
   the clinic is hard-coded here.
   ========================================================================== */

const DATA = JSON.parse(document.getElementById('demo-data').textContent);
const KEY = DATA.storageKey;
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------- dates -- */

const pad2 = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const TODAY_ISO = iso(TODAY);

/** The next `count` days the clinic is open (closed Sundays). */
function openDays(count) {
  const out = [];
  let cursor = new Date(TODAY);
  while (out.length < count) {
    if (cursor.getDay() !== 0) out.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return out;
}

function prettyDate(isoStr) {
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

function pretty12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${pad2(m)} ${suffix}`;
}

const money = (n) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function nowTime() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/* ---------------------------------------------------------------- lookup -- */

const PROVIDERS = DATA.providers;
const providerById = (id) => PROVIDERS.find((p) => p.id === id) || null;
const providerName = (id) => {
  const p = providerById(id);
  if (!p) return 'Any available provider';
  return p.credential === 'FNP-C' ? `${p.name}, ${p.credential}` : `Dr. ${p.name}`;
};
const providerShort = (id) => {
  const p = providerById(id);
  if (!p) return 'Unassigned';
  return p.credential === 'FNP-C' ? p.name : `Dr. ${p.name.split(' ').pop()}`;
};

/** name -> { price, duration } across every care group. */
const SERVICES = (() => {
  const map = {};
  DATA.careGroups.forEach((g) =>
    g.services.forEach((s) => {
      map[s.name] = { price: s.price, duration: s.duration };
    })
  );
  return map;
})();

const servicePrice = (name) => (SERVICES[name] ? SERVICES[name].price : 145);

/* ----------------------------------------------------------------- store -- */

function seed() {
  const s = DATA.seed;

  const patients = s.patients.map((p) => ({
    id: p.id,
    name: p.name,
    dob: p.dob,
    phone: p.phone,
    insurer: p.insurer,
    memberId: p.memberId,
    providerId: p.provider,
    since: p.since
  }));

  const appointments = s.appointments.map((a) => {
    const patient = patients.find((p) => p.id === a.patient);
    return {
      id: a.id,
      date: iso(addDays(TODAY, a.dayOffset)),
      time: a.time,
      patientId: a.patient,
      patientName: patient ? patient.name : 'Unknown',
      providerId: a.provider,
      reason: a.reason,
      service: a.service,
      duration: a.duration,
      status: a.status,
      arrived: a.arrived || null,
      isNew: false
    };
  });

  const invoices = s.invoices.map((i) => {
    const patient = patients.find((p) => p.id === i.patient);
    return {
      id: i.id,
      date: iso(addDays(TODAY, i.dayOffset)),
      patientId: i.patient,
      patientName: patient ? patient.name : 'Unknown',
      providerId: i.provider,
      service: i.service,
      amount: i.amount,
      status: i.status
    };
  });

  const activity = s.activity.map((a) => ({
    at: new Date(Date.now() - a.minutesAgo * 60000).toISOString(),
    text: a.text
  }));

  return { v: 1, patients, appointments, invoices, activity, session: null };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const fresh = seed();
      save(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1) {
      const fresh = seed();
      save(fresh);
      return fresh;
    }
    return parsed;
  } catch (e) {
    return seed();
  }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    /* Private browsing — the demo still works for this pageview. */
  }
}

let STATE = load();

function commit() {
  save(STATE);
}

function logActivity(text) {
  STATE.activity.unshift({ at: new Date().toISOString(), text });
  STATE.activity = STATE.activity.slice(0, 40);
}

function resetDemo() {
  STATE = seed();
  commit();
}

/* ------------------------------------------------------------------ util -- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function toast(message) {
  let node = $('.toast');
  if (!node) {
    node = el('div', 'toast');
    document.body.appendChild(node);
  }
  node.textContent = message;
  requestAnimationFrame(() => node.classList.add('is-up'));
  clearTimeout(toast._t);
  toast._t = setTimeout(() => node.classList.remove('is-up'), 3200);
}

/** Keep ?prospect= attached when navigating between demo pages. */
function withProspect(href) {
  const p = new URLSearchParams(location.search).get('prospect');
  if (!p) return href;
  const u = new URL(href, location.origin);
  u.searchParams.set('prospect', p);
  return u.pathname + u.search;
}

/* ================================================================ PUBLIC == */

/* --- availability grid (the signature element) ------------------------- */

function takenSet() {
  const taken = new Set();
  STATE.appointments.forEach((a) => {
    if (a.status !== 'cancelled') taken.add(`${a.date}|${a.time}|${a.providerId}`);
  });
  return taken;
}

function renderAvailability() {
  const mount = $('[data-availability]');
  if (!mount) return;

  const days = openDays(5);
  const taken = takenSet();
  const bands = DATA.availability.bands;

  /* Day header row */
  const header = el('div', 'avail__days');
  header.appendChild(el('div', 'avail__day'));
  days.forEach((d, i) => {
    const cell = el('div', `avail__day${i === 0 ? ' is-today' : ''}`);
    cell.appendChild(
      el('div', 'avail__dayname', i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' }))
    );
    cell.appendChild(el('div', 'avail__daynum', String(d.getDate())));
    header.appendChild(cell);
  });
  mount.appendChild(header);

  let openCount = 0;

  bands.forEach((band) => {
    const row = el('div', 'avail__row');
    row.appendChild(el('div', 'avail__band', band));

    days.forEach((d, dayIndex) => {
      const cell = el('div', 'avail__cell');
      const dateStr = iso(d);

      const slots = DATA.availability.slots.filter(
        (s) =>
          s.dayOffset === dayIndex &&
          s.band === band &&
          !taken.has(`${dateStr}|${s.time}|${s.provider}`)
      );

      if (!slots.length) {
        cell.appendChild(el('div', 'avail__none'));
      } else {
        slots.forEach((s) => {
          openCount++;
          const btn = el('button', 'avail__slot');
          btn.type = 'button';
          btn.setAttribute('data-anim', 'slot');
          btn.appendChild(document.createTextNode(pretty12(s.time)));
          btn.appendChild(el('small', null, providerShort(s.provider)));
          btn.setAttribute(
            'aria-label',
            `Book ${pretty12(s.time)} on ${prettyDate(dateStr)} with ${providerName(s.provider)}`
          );
          btn.addEventListener('click', () => {
            location.href = withProspect(
              `/demos/clinic/book/?date=${dateStr}&time=${s.time}&provider=${s.provider}`
            );
          });
          cell.appendChild(btn);
        });
      }

      row.appendChild(cell);
    });

    mount.appendChild(row);
  });

  const count = $('[data-avail-count]');
  if (count) {
    count.textContent =
      openCount === 0
        ? 'No open slots in the next five days — call and we will find one.'
        : `${openCount} open ${openCount === 1 ? 'slot' : 'slots'} in the next five days.`;
  }
}

/* --- next availability per provider ------------------------------------ */

function renderProviderNext() {
  const nodes = $$('[data-next-for]');
  if (!nodes.length) return;

  const days = openDays(5);
  const taken = takenSet();

  nodes.forEach((node) => {
    const id = node.getAttribute('data-next-for');
    let found = null;

    for (let i = 0; i < days.length && !found; i++) {
      const dateStr = iso(days[i]);
      const slot = DATA.availability.slots
        .filter((s) => s.dayOffset === i && s.provider === id)
        .filter((s) => !taken.has(`${dateStr}|${s.time}|${s.provider}`))
        .sort((a, b) => a.time.localeCompare(b.time))[0];
      if (slot) found = { dateStr, slot };
    }

    if (!found) {
      node.textContent = 'Call for the next opening';
      return;
    }

    const label = found.dateStr === TODAY_ISO ? 'Today' : prettyDate(found.dateStr);
    node.textContent = `${label}, ${pretty12(found.slot.time)}`;

    const link = node.closest('[data-next-block]')?.querySelector('[data-next-link]');
    if (link) {
      link.href = withProspect(
        `/demos/clinic/book/?date=${found.dateStr}&time=${found.slot.time}&provider=${id}`
      );
    }
  });
}

/* --- booking form ------------------------------------------------------- */

function initBooking() {
  const form = $('[data-book-form]');
  if (!form) return;

  const params = new URLSearchParams(location.search);
  const preDate = params.get('date');
  const preTime = params.get('time');
  const preProvider = params.get('provider');

  /* Date input bounds: today through eight weeks out. */
  const dateInput = form.elements.date;
  dateInput.min = TODAY_ISO;
  dateInput.max = iso(addDays(TODAY, 56));
  if (preDate) dateInput.value = preDate;

  if (preTime && form.elements.time) form.elements.time.value = preTime;
  if (preProvider && form.elements.provider) form.elements.provider.value = preProvider;

  const banner = $('[data-preselect]');
  if (banner && preDate && preTime) {
    banner.textContent = `Holding ${pretty12(preTime)} on ${prettyDate(preDate)} with ${providerName(
      preProvider
    )} while you fill this in. Nothing is confirmed until we call you.`;
    banner.hidden = false;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    /* Validation — inline, no alerts. */
    let firstBad = null;
    $$('.field', form).forEach((f) => f.classList.remove('is-invalid'));
    $$('[data-error]', form).forEach((n) => (n.textContent = ''));

    const required = ['name', 'dob', 'phone', 'date', 'reason'];
    required.forEach((key) => {
      const input = form.elements[key];
      if (!input) return;
      const wrap = input.closest('.field');
      if (!input.value.trim()) {
        wrap.classList.add('is-invalid');
        const err = wrap.querySelector('[data-error]');
        if (err) err.textContent = 'This one is needed to book the visit.';
        if (!firstBad) firstBad = input;
      }
    });

    if (firstBad) {
      firstBad.focus();
      firstBad.scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' });
      return;
    }

    const name = form.elements.name.value.trim();
    const dob = form.elements.dob.value;
    const phone = form.elements.phone.value.trim();
    const insurer = form.elements.insurer.value;
    const providerId = form.elements.provider.value || PROVIDERS[0].id;
    const date = form.elements.date.value;
    const time = form.elements.time.value || '09:00';
    const reason = form.elements.reason.value;
    const notes = form.elements.notes.value.trim();

    /* Find the patient or open a new record. */
    let patient = STATE.patients.find(
      (p) => p.name.toLowerCase() === name.toLowerCase() && p.dob === dob
    );

    if (!patient) {
      patient = {
        id: `p${Date.now().toString(36)}`,
        name,
        dob,
        phone,
        insurer: insurer || 'Self-pay',
        memberId: 'Pending verification',
        providerId,
        since: new Date().getFullYear(),
        isNew: true
      };
      STATE.patients.push(patient);
    }

    const service = reason;
    const appointment = {
      id: `a${Date.now().toString(36)}`,
      date,
      time,
      patientId: patient.id,
      patientName: patient.name,
      providerId,
      reason,
      service,
      duration: SERVICES[service] ? SERVICES[service].duration : 20,
      status: 'scheduled',
      arrived: null,
      isNew: true,
      notes
    };

    STATE.appointments.push(appointment);
    logActivity(`${name} requested ${prettyDate(date)} at ${pretty12(time)} with ${providerShort(providerId)}.`);
    commit();

    /* Confirmation replaces the form in place. */
    const done = $('[data-book-done]');
    $('[data-book-panel]').hidden = true;
    done.hidden = false;
    $('[data-done-summary]').textContent =
      `${prettyDate(date)} at ${pretty12(time)} with ${providerName(providerId)}.`;
    $('[data-done-phone]').textContent = phone;

    const portalLink = $('[data-done-portal]');
    if (portalLink) portalLink.href = withProspect('/demos/clinic/portal/');

    done.scrollIntoView({ block: 'start', behavior: REDUCED ? 'auto' : 'smooth' });
  });
}

/* --- mobile nav --------------------------------------------------------- */

function initNav() {
  const toggle = $('[data-nav-toggle]');
  const top = $('.top');
  if (!toggle || !top) return;
  toggle.addEventListener('click', () => {
    const open = top.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Close' : 'Menu';
  });
}

/* --- hero load sequence (the one orchestrated moment) ------------------- */

function initHeroMotion() {
  const hero = $('[data-hero]');
  if (!hero) return;

  const targets = () => [
    ...$$('[data-anim]', hero),
    ...$$('.avail__row, .avail__days', hero)
  ];

  /* Nothing may depend on JS to become visible. If motion is off, the library
     failed to load, or the tab opened in the background (where requestAnimation
     Frame is throttled and a timeline can stall for minutes), the hero simply
     renders in its final state. */
  const reveal = () => {
    if (window.gsap) window.gsap.set(targets(), { clearProps: 'all' });
    targets().forEach((el) => {
      el.style.opacity = '';
      el.style.transform = '';
    });
    hero.dataset.animDone = 'true';
  };

  if (REDUCED || !window.gsap || document.hidden) {
    reveal();
    return;
  }

  const gsap = window.gsap;
  const rules = $$('.avail__row, .avail__days', hero);
  const slots = $$('.avail__slot', hero);

  gsap.set('[data-anim="line"]', { yPercent: 110 });
  gsap.set(rules, { scaleY: 0, transformOrigin: 'top' });
  gsap.set(slots, { opacity: 0, y: 6 });
  gsap.set('[data-anim="fade"]', { opacity: 0, y: 12 });

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    onComplete: () => {
      hero.dataset.animDone = 'true';
    }
  });

  tl.to('[data-anim="line"]', { yPercent: 0, duration: 0.9, stagger: 0.08 })
    .to(rules, { scaleY: 1, duration: 0.5, stagger: 0.06 }, '-=0.5')
    .to(slots, { opacity: 1, y: 0, duration: 0.45, stagger: 0.025 }, '-=0.25')
    .to('[data-anim="fade"]', { opacity: 1, y: 0, duration: 0.7, stagger: 0.1 }, '-=0.55');

  /* Failsafe: if the sequence has not finished in three seconds — a stalled
     tab, a dropped frame loop — show everything rather than leave the page
     blank. */
  setTimeout(() => {
    if (hero.dataset.animDone !== 'true') {
      tl.kill();
      reveal();
    }
  }, 3000);
}

function initSmoothScroll() {
  if (REDUCED || !window.Lenis) return;
  const lenis = new window.Lenis({ duration: 0.9, smoothWheel: true });
  const raf = (t) => {
    lenis.raf(t);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}

/* ================================================================ PORTAL == */

function isAuthed() {
  return !!(STATE.session && STATE.session.user);
}

function requireAuth() {
  if (!isAuthed()) {
    location.replace(withProspect('/demos/clinic/portal/'));
    return false;
  }
  return true;
}

function initLogin() {
  const form = $('[data-login-form]');
  if (!form) return;

  if (isAuthed()) {
    location.replace(withProspect('/demos/clinic/portal/schedule/'));
    return;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = form.elements.user.value.trim();
    const pass = form.elements.pass.value.trim();
    const creds = DATA.portal.credentials;
    const err = $('[data-login-error]');

    if (user === creds.user && pass === creds.pass) {
      STATE.session = { user, at: new Date().toISOString() };
      commit();
      location.href = withProspect('/demos/clinic/portal/schedule/');
    } else {
      err.textContent = 'That is not a match. Check the details above.';
      form.elements.pass.focus();
    }
  });
}

function initSignOut() {
  const btn = $('[data-signout]');
  if (!btn) return;
  btn.addEventListener('click', () => {
    STATE.session = null;
    commit();
    location.href = withProspect('/demos/clinic/portal/');
  });
}

/* --- shared portal actions ---------------------------------------------- */

function checkIn(id, rerender) {
  const appt = STATE.appointments.find((a) => a.id === id);
  if (!appt) return;
  appt.status = 'waiting';
  appt.arrived = nowTime();
  appt.isNew = false;
  logActivity(`${appt.patientName} checked in for ${pretty12(appt.time)} with ${providerShort(appt.providerId)}.`);
  commit();
  toast(`${appt.patientName} checked in.`);
  rerender();
}

function completeVisit(id, rerender) {
  const appt = STATE.appointments.find((a) => a.id === id);
  if (!appt) return;

  appt.status = 'completed';
  appt.isNew = false;

  const amount = servicePrice(appt.service);
  const invoice = {
    id: `i${Date.now().toString(36)}`,
    date: appt.date,
    patientId: appt.patientId,
    patientName: appt.patientName,
    providerId: appt.providerId,
    service: appt.service,
    amount,
    status: amount === 0 ? 'paid' : 'open'
  };
  STATE.invoices.unshift(invoice);

  logActivity(
    `${appt.patientName}'s visit completed. Invoice raised at ${money(amount)}.`
  );
  commit();
  toast(
    amount === 0
      ? `Visit completed. Covered in full — nothing to bill.`
      : `Visit completed. ${money(amount)} invoice opened in Billing.`
  );
  rerender();
}

function markPaid(id, rerender) {
  const inv = STATE.invoices.find((i) => i.id === id);
  if (!inv) return;
  inv.status = 'paid';
  logActivity(`Payment of ${money(inv.amount)} recorded for ${inv.patientName}.`);
  commit();
  toast(`${money(inv.amount)} recorded.`);
  rerender();
}

function statusChip(status) {
  const labels = {
    scheduled: 'Scheduled',
    waiting: 'Waiting',
    completed: 'Completed',
    cancelled: 'Cancelled',
    open: 'Open',
    paid: 'Paid'
  };
  const chip = el('span', `st st--${status}`, labels[status] || status);
  return chip;
}

function actionButton(label, variant, onClick) {
  const b = el('button', `btn btn--sm ${variant}`, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/* --- Today's schedule ---------------------------------------------------- */

function initSchedule() {
  const mount = $('[data-schedule]');
  if (!mount) return;
  if (!requireAuth()) return;

  function render() {
    mount.innerHTML = '';

    /* New requests — anything submitted from the public booking form,
       surfaced here regardless of which date was asked for. */
    const requests = STATE.appointments
      .filter((a) => a.isNew && a.status !== 'cancelled')
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    if (requests.length) {
      mount.appendChild(
        buildTable({
          title: `New booking requests (${requests.length})`,
          subtitle: 'Submitted from the website. Call to confirm, then check in on arrival.',
          columns: ['Requested', 'Patient', 'Provider', 'Reason', 'Status', ''],
          rows: requests,
          rowClass: () => 'is-new',
          cells: (a) => [
            cellTime(a.time, prettyDate(a.date)),
            cellName(a.patientName, a.notes ? a.notes.slice(0, 60) : 'New request'),
            textCell(providerShort(a.providerId)),
            textCell(a.reason),
            chipCell(a.status),
            actionsCell([
              actionButton('Check in', '', () => checkIn(a.id, render))
            ])
          ]
        })
      );
    }

    /* The day itself */
    const today = STATE.appointments
      .filter((a) => a.date === TODAY_ISO)
      .sort((a, b) => a.time.localeCompare(b.time));

    mount.appendChild(
      buildTable({
        title: `Today — ${TODAY.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric'
        })}`,
        subtitle: `${today.length} visits on the book.`,
        columns: ['Time', 'Patient', 'Provider', 'Reason', 'Status', ''],
        rows: today,
        empty: 'Nothing booked for today yet.',
        cells: (a) => [
          cellTime(a.time, `${a.duration} min`),
          cellName(a.patientName, a.arrived ? `Arrived ${pretty12(a.arrived)}` : ''),
          textCell(providerShort(a.providerId)),
          textCell(a.reason),
          chipCell(a.status),
          actionsCell(rowActions(a, render))
        ]
      })
    );

    renderStats();
    renderFeed();
  }

  function rowActions(a, rerender) {
    if (a.status === 'scheduled') {
      return [actionButton('Check in', '', () => checkIn(a.id, rerender))];
    }
    if (a.status === 'waiting') {
      return [actionButton('Complete visit', '', () => completeVisit(a.id, rerender))];
    }
    return [];
  }

  function renderStats() {
    const strip = $('[data-schedule-stats]');
    if (!strip) return;
    const today = STATE.appointments.filter((a) => a.date === TODAY_ISO);
    const waiting = today.filter((a) => a.status === 'waiting').length;
    const done = today.filter((a) => a.status === 'completed').length;
    const left = today.filter((a) => a.status === 'scheduled').length;
    const requests = STATE.appointments.filter((a) => a.isNew && a.status !== 'cancelled').length;

    strip.innerHTML = '';
    [
      { n: today.length, l: 'On the book today' },
      { n: waiting, l: 'Waiting now', flag: waiting > 0 },
      { n: left, l: 'Still to arrive' },
      { n: done, l: 'Completed' },
      { n: requests, l: 'New requests', flag: requests > 0 }
    ].forEach((s) => {
      const box = el('div', `stat${s.flag ? ' stat--flag' : ''}`);
      box.appendChild(el('div', 'stat__n', String(s.n)));
      box.appendChild(el('div', 'stat__l', s.l));
      strip.appendChild(box);
    });
  }

  function renderFeed() {
    const feed = $('[data-feed]');
    if (!feed) return;
    feed.innerHTML = '';
    STATE.activity.slice(0, 8).forEach((a) => {
      const li = document.createElement('li');
      const t = document.createElement('time');
      const mins = Math.max(0, Math.round((Date.now() - new Date(a.at).getTime()) / 60000));
      t.textContent =
        mins < 1 ? 'Just now' : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} hr ago`;
      li.appendChild(t);
      li.appendChild(document.createTextNode(a.text));
      feed.appendChild(li);
    });
  }

  render();
}

/* --- table builder ------------------------------------------------------- */

function textCell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

function cellTime(time, sub) {
  const td = document.createElement('td');
  td.appendChild(el('div', 't-time', pretty12(time)));
  if (sub) td.appendChild(el('div', 't-sub', sub));
  return td;
}

function cellName(name, sub) {
  const td = document.createElement('td');
  td.appendChild(el('div', 't-name', name));
  if (sub) td.appendChild(el('div', 't-sub', sub));
  return td;
}

function chipCell(status) {
  const td = document.createElement('td');
  td.appendChild(statusChip(status));
  return td;
}

function actionsCell(buttons) {
  const td = document.createElement('td');
  td.className = 't-right';
  const wrap = el('div', 't-actions');
  buttons.forEach((b) => wrap.appendChild(b));
  td.appendChild(wrap);
  return td;
}

function numCell(text) {
  const td = document.createElement('td');
  td.className = 't-right';
  td.appendChild(el('div', 't-num', text));
  return td;
}

function buildTable({ title, subtitle, columns, rows, cells, empty, rowClass, headExtra }) {
  const panel = el('section', 'panel');

  const head = el('div', 'panel__head');
  const titles = document.createElement('div');
  titles.appendChild(el('div', 'panel__title', title));
  if (subtitle) titles.appendChild(el('div', 't-sub', subtitle));
  head.appendChild(titles);
  if (headExtra) head.appendChild(headExtra);
  panel.appendChild(head);

  if (!rows.length) {
    panel.appendChild(el('div', 'empty', empty || 'Nothing here.'));
    return panel;
  }

  const wrap = el('div', 'tablewrap');
  const table = document.createElement('table');

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  columns.forEach((c, i) => {
    const th = document.createElement('th');
    th.textContent = c;
    if (i === columns.length - 1 && c === '') th.className = 't-right';
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    if (rowClass) {
      const cls = rowClass(r);
      if (cls) tr.className = cls;
    }
    cells(r).forEach((td) => tr.appendChild(td));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrap.appendChild(table);
  panel.appendChild(wrap);
  return panel;
}

/* --- Appointments -------------------------------------------------------- */

function initAppointments() {
  const mount = $('[data-appointments]');
  if (!mount) return;
  if (!requireAuth()) return;

  let filter = 'all';

  function render() {
    mount.innerHTML = '';

    const all = STATE.appointments
      .slice()
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

    const rows = filter === 'all' ? all : all.filter((a) => a.status === filter);

    const filters = el('div', 'filters');
    [
      ['all', 'All'],
      ['scheduled', 'Scheduled'],
      ['waiting', 'Waiting'],
      ['completed', 'Completed'],
      ['cancelled', 'Cancelled']
    ].forEach(([value, label]) => {
      const count = value === 'all' ? all.length : all.filter((a) => a.status === value).length;
      const b = el('button', 'filter', `${label} ${count}`);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(filter === value));
      b.addEventListener('click', () => {
        filter = value;
        render();
      });
      filters.appendChild(b);
    });

    mount.appendChild(
      buildTable({
        title: 'All appointments',
        subtitle: `${rows.length} shown.`,
        headExtra: filters,
        columns: ['Date', 'Time', 'Patient', 'Provider', 'Reason', 'Status', ''],
        rows,
        empty: 'No appointments with that status.',
        rowClass: (a) => (a.isNew ? 'is-new' : ''),
        cells: (a) => [
          textCell(a.date === TODAY_ISO ? 'Today' : prettyDate(a.date)),
          cellTime(a.time, `${a.duration} min`),
          cellName(a.patientName, ''),
          textCell(providerShort(a.providerId)),
          textCell(a.reason),
          chipCell(a.status),
          actionsCell(
            a.status === 'scheduled'
              ? [actionButton('Check in', '', () => checkIn(a.id, render))]
              : a.status === 'waiting'
              ? [actionButton('Complete', '', () => completeVisit(a.id, render))]
              : []
          )
        ]
      })
    );
  }

  render();
}

/* --- Patients ------------------------------------------------------------ */

function patientBalance(id) {
  return STATE.invoices
    .filter((i) => i.patientId === id && i.status === 'open')
    .reduce((sum, i) => sum + i.amount, 0);
}

function initPatients() {
  const mount = $('[data-patients]');
  if (!mount) return;
  if (!requireAuth()) return;

  function render() {
    mount.innerHTML = '';

    const rows = STATE.patients.slice().sort((a, b) => a.name.localeCompare(b.name));

    mount.appendChild(
      buildTable({
        title: 'Patient records',
        subtitle: `${rows.length} on the books.`,
        columns: ['Name', 'Date of birth', 'Phone', 'Insurance', 'Provider', 'Balance'],
        rows,
        cells: (p) => {
          const bal = patientBalance(p.id);
          return [
            cellName(p.name, p.isNew ? 'New record' : `Patient since ${p.since}`),
            textCell(p.dob),
            textCell(p.phone),
            cellName(p.insurer, p.memberId),
            textCell(providerShort(p.providerId)),
            numCell(bal === 0 ? '—' : money(bal))
          ];
        }
      })
    );
  }

  render();
}

/* --- Providers ----------------------------------------------------------- */

function initProvidersPanel() {
  const mount = $('[data-providers-panel]');
  if (!mount) return;
  if (!requireAuth()) return;

  mount.innerHTML = '';

  mount.appendChild(
    buildTable({
      title: 'Providers',
      subtitle: 'Panel size and what today looks like for each of them.',
      columns: ['Provider', 'Role', 'Panel', 'Today', 'Waiting', 'Completed'],
      rows: PROVIDERS,
      cells: (p) => {
        const today = STATE.appointments.filter(
          (a) => a.providerId === p.id && a.date === TODAY_ISO && a.status !== 'cancelled'
        );
        return [
          cellName(providerName(p.id), `Joined ${p.joined}`),
          textCell(p.role),
          numCell(p.panel.toLocaleString()),
          numCell(String(today.length)),
          numCell(String(today.filter((a) => a.status === 'waiting').length)),
          numCell(String(today.filter((a) => a.status === 'completed').length))
        ];
      }
    })
  );
}

/* --- Billing -------------------------------------------------------------- */

function initBilling() {
  const mount = $('[data-billing]');
  if (!mount) return;
  if (!requireAuth()) return;

  let filter = 'all';

  function render() {
    mount.innerHTML = '';

    const all = STATE.invoices.slice().sort((a, b) => b.date.localeCompare(a.date));
    const open = all.filter((i) => i.status === 'open');
    const paid = all.filter((i) => i.status === 'paid');

    const strip = $('[data-billing-stats]');
    if (strip) {
      strip.innerHTML = '';
      [
        { n: money(paid.reduce((s, i) => s + i.amount, 0)), l: 'Collected' },
        { n: money(open.reduce((s, i) => s + i.amount, 0)), l: 'Outstanding', flag: open.length > 0 },
        { n: String(open.length), l: 'Open invoices' },
        { n: String(all.length), l: 'Invoices total' }
      ].forEach((s) => {
        const box = el('div', `stat${s.flag ? ' stat--flag' : ''}`);
        box.appendChild(el('div', 'stat__n', s.n));
        box.appendChild(el('div', 'stat__l', s.l));
        strip.appendChild(box);
      });
    }

    const rows = filter === 'all' ? all : all.filter((i) => i.status === filter);

    const filters = el('div', 'filters');
    [
      ['all', 'All'],
      ['open', 'Open'],
      ['paid', 'Paid']
    ].forEach(([value, label]) => {
      const count = value === 'all' ? all.length : all.filter((i) => i.status === value).length;
      const b = el('button', 'filter', `${label} ${count}`);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(filter === value));
      b.addEventListener('click', () => {
        filter = value;
        render();
      });
      filters.appendChild(b);
    });

    mount.appendChild(
      buildTable({
        title: 'Invoices',
        subtitle: 'Raised automatically when a visit is marked complete.',
        headExtra: filters,
        columns: ['Date', 'Patient', 'Service', 'Provider', 'Status', 'Amount', ''],
        rows,
        empty: 'No invoices with that status.',
        cells: (i) => [
          textCell(i.date === TODAY_ISO ? 'Today' : prettyDate(i.date)),
          cellName(i.patientName, ''),
          textCell(i.service),
          textCell(providerShort(i.providerId)),
          chipCell(i.status),
          numCell(money(i.amount)),
          actionsCell(
            i.status === 'open'
              ? [actionButton('Record payment', '', () => markPaid(i.id, render))]
              : []
          )
        ]
      })
    );
  }

  render();
}

/* --- Settings ------------------------------------------------------------- */

function initSettings() {
  const mount = $('[data-settings]');
  if (!mount) return;
  if (!requireAuth()) return;

  const reset = $('[data-reset]');
  if (reset) {
    reset.addEventListener('click', () => {
      const confirmEl = $('[data-reset-confirm]');
      if (confirmEl.hidden) {
        confirmEl.hidden = false;
        reset.textContent = 'Reset — are you sure?';
        return;
      }
      resetDemo();
      toast('Demo data reseeded.');
      setTimeout(() => location.reload(), 500);
    });
  }
}

/* --- portal chrome -------------------------------------------------------- */

function initPortalChrome() {
  const who = $('[data-staff-name]');
  if (who && STATE.session) who.textContent = DATA.portal.staffName;
}

/* ==================================================================== boot */

function boot() {
  initNav();

  /* public */
  renderAvailability();
  renderProviderNext();
  initBooking();
  initHeroMotion();
  initSmoothScroll();

  /* portal */
  initLogin();
  initSignOut();
  initPortalChrome();
  initSchedule();
  initAppointments();
  initPatients();
  initProvidersPanel();
  initBilling();
  initSettings();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
