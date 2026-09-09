/**
 * Hero system map — job engine.
 *
 * A "job" is a request moving through the system along one of a few real
 * paths. As its packet reaches each module, the module reacts:
 *
 *   request   → cursor presses the button
 *   intake    → fields fill in
 *   workflow  → the diamond lights and the taken branch is highlighted
 *   schedule  → a free calendar cell is booked
 *   database  → a new row writes in
 *   dashboard → a bar grows, the line ticks up, "+1" floats
 *   notify    → the badge count bumps
 *   completed → the check draws, the counter increments
 *
 * Several jobs are in flight at once so the diagram reads as a system that
 * is genuinely processing work. Idle routes carry a slow dash flow. Cursor
 * parallax on fine pointers. Under prefers-reduced-motion nothing moves.
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = window.matchMedia('(pointer: coarse)').matches;
const SMALL = () => window.innerWidth < 760;

/* Real paths a request can take, as route ids. */
const PATHS_FULL = [
  ['r1', 'r2', 'r3', 'r8'],              // request → intake → workflow → schedule → completed
  ['r1', 'r2', 'r4', 'r5'],              // request → intake → workflow → database → dashboard
  ['r1', 'r2', 'r6', 'r7'],              // request → intake → workflow → notify → completed
  ['r2', 'r4', 'r5'],                    // already-captured work: intake → db → dashboard
  ['r2', 'r3', 'r8']
];
/* On small screens m1 and m7 are hidden, so paths avoid r1/r6/r7. */
const PATHS_SMALL = [['r2', 'r3', 'r8'], ['r2', 'r4', 'r5']];

export function initSystemMap() {
  const root = document.querySelector('[data-sysmap]');
  if (!root) return;

  const svg = root.querySelector('svg');
  const packets = root.querySelector('[data-packets]');
  const routes = new Map(Array.from(root.querySelectorAll('.sm-route')).map((r) => [r.dataset.route, r]));
  const nodes = new Map(Array.from(root.querySelectorAll('[data-node]')).map((n) => [n.dataset.node, n]));
  const counterEl = root.querySelector('[data-counter]');
  const inflightEl = root.querySelector('[data-inflight]');
  const supportsOffset = !!(CSS.supports && CSS.supports('offset-path', 'path("M0 0 L1 1")'));

  if (REDUCED) {
    root.dataset.sysmapReady = 'static';
    return;
  }

  let processed = 0;
  let inflight = 0;
  const updateReadout = () => {
    if (counterEl) counterEl.textContent = String(processed).padStart(3, '0');
    if (inflightEl) inflightEl.textContent = String(inflight);
  };

  /* --- transient node states ---------------------------------------- */
  const timers = new WeakMap();
  function flash(node, cls, ms) {
    node.classList.add(cls);
    const key = node.dataset.node + cls;
    clearTimeout(timers.get(node)?.[key]);
    const t = setTimeout(() => node.classList.remove(cls), ms);
    timers.set(node, { ...(timers.get(node) || {}), [key]: t });
  }

  /* --- module reactions ---------------------------------------------- */
  const react = {
    m1(node) { flash(node, 'is-press', 500); },
    m2(node) {
      flash(node, 'is-active', 900);
      node.classList.remove('is-filled');
      void node.getBoundingClientRect();
      node.classList.add('is-filled');
      setTimeout(() => node.classList.remove('is-filled'), 2400);
    },
    m3(node, branch) {
      flash(node, 'is-active', 900);
      node.querySelectorAll('[data-branch]').forEach((b) => b.classList.toggle('is-taken', b.dataset.branch === branch));
      setTimeout(() => node.querySelectorAll('[data-branch]').forEach((b) => b.classList.remove('is-taken')), 1600);
    },
    m4(node) {
      flash(node, 'is-active', 900);
      const free = Array.from(node.querySelectorAll('[data-cell]:not(.sm-cell--on)'));
      if (!free.length) {
        node.querySelectorAll('[data-cell]').forEach((c) => c.classList.remove('sm-cell--on', 'sm-cell--new'));
        return;
      }
      const cell = free[Math.floor(Math.random() * free.length)];
      cell.classList.add('sm-cell--on', 'sm-cell--new');
      setTimeout(() => cell.classList.remove('sm-cell--new'), 1200);
      flash(node, 'is-done', 1400);
    },
    m5(node) {
      flash(node, 'is-active', 900);
      const rows = node.querySelector('[data-rows]');
      const fresh = rows.querySelector('.sm-row--new');
      fresh.setAttribute('width', '0');
      fresh.classList.remove('is-writing');
      void fresh.getBoundingClientRect();
      fresh.classList.add('is-writing');
      setTimeout(() => {
        // the write is done: keep the row on screen until the next write
        fresh.setAttribute('width', '52');
        fresh.classList.remove('is-writing');
      }, 1000);
    },
    m6(node) {
      flash(node, 'is-active', 900);
      const bars = Array.from(node.querySelectorAll('[data-bars] rect'));
      const bar = bars[Math.floor(Math.random() * bars.length)];
      bars.forEach((b) => {
        // everything else settles a little, so the chart never pins at max
        if (b === bar) return;
        const hh = Math.max(16, Number(b.getAttribute('height')) - (3 + Math.random() * 5));
        b.setAttribute('y', String(94 - hh));
        b.setAttribute('height', String(hh));
      });
      const h = Math.min(60, Number(bar.getAttribute('height')) + 8 + Math.random() * 10);
      bar.setAttribute('y', String(94 - h));
      bar.setAttribute('height', String(h));
      bars.forEach((b) => b.classList.remove('sm-col--on'));
      bar.classList.add('sm-col--on');
      flash(node, 'is-kpi', 1100);
      flash(node, 'is-done', 1400);
    },
    m7(node) {
      flash(node, 'is-active', 900);
      const badge = node.querySelector('[data-badge]');
      badge.textContent = String(Math.min(99, Number(badge.textContent) + 1));
      flash(node, 'is-bump', 600);
    },
    m8(node) {
      flash(node, 'is-active', 500);
      node.classList.remove('is-checked');
      void node.getBoundingClientRect();
      node.classList.add('is-checked');
      setTimeout(() => node.classList.remove('is-checked'), 1800);
      flash(node, 'is-done', 1600);
      processed += 1;
      updateReadout();
    }
  };

  /* --- packet along one route ---------------------------------------- */
  function travel(routeId) {
    return new Promise((resolve) => {
      const route = routes.get(routeId);
      if (!route) return resolve(null);
      const d = route.getAttribute('d');
      const len = route.getTotalLength ? route.getTotalLength() : 400;
      const duration = Math.max(700, Math.min(1500, len * 2.6));

      route.classList.add('is-live');
      setTimeout(() => route.classList.remove('is-live'), duration + 200);

      if (!supportsOffset) return setTimeout(() => resolve(route), duration);

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'sm-packet');
      g.innerHTML =
        '<rect class="sm-packet__tail" x="-22" y="-1.5" width="22" height="3" rx="1.5"/>' +
        '<circle class="sm-packet__halo" r="9"/>' +
        '<circle class="sm-packet__core" r="3.5"/>';
      g.style.offsetPath = `path("${d}")`;
      g.style.offsetRotate = 'auto';
      packets.appendChild(g);

      const anim = g.animate(
        [{ offsetDistance: '0%', opacity: 0 }, { offsetDistance: '5%', opacity: 1, offset: 0.06 },
         { offsetDistance: '95%', opacity: 1, offset: 0.94 }, { offsetDistance: '100%', opacity: 0 }],
        { duration, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' }
      );
      let done = false;
      const land = () => { if (done) return; done = true; g.remove(); resolve(route); };
      anim.onfinish = land;
      setTimeout(land, duration + 600);
    });
  }

  /* --- a job: a request moving through one full path ------------------ */
  async function runJob() {
    const paths = SMALL() ? PATHS_SMALL : PATHS_FULL;
    const path = paths[Math.floor(Math.random() * paths.length)];
    inflight += 1;
    updateReadout();

    // the job starts at the first route's origin module
    const first = routes.get(path[0]);
    const origin = first && nodes.get(first.dataset.from);
    if (origin && react[origin.dataset.node]) react[origin.dataset.node](origin);

    for (const id of path) {
      if (!running) break;
      const route = await travel(id);
      if (!route) continue;
      const dest = nodes.get(route.dataset.to);
      if (!dest) continue;
      const branch = id === 'r3' || id === 'r6' ? 'up' : id === 'r4' ? 'down' : null;
      const fn = react[dest.dataset.node];
      if (fn) fn(dest, branch);
      await new Promise((r) => setTimeout(r, 260));
    }

    inflight = Math.max(0, inflight - 1);
    updateReadout();
  }

  /* --- scheduler: several jobs in flight ------------------------------ */
  let running = false;
  let spawnTimer = 0;
  const MAX_INFLIGHT = () => (SMALL() ? 1 : 3);

  function spawn() {
    if (!running) return;
    if (inflight < MAX_INFLIGHT()) runJob();
    spawnTimer = setTimeout(spawn, 1400 + Math.random() * 1400);
  }
  const start = () => { if (running) return; running = true; spawn(); };
  const stop = () => { running = false; clearTimeout(spawnTimer); };

  /* --- parallax (fine pointers only) -------------------------------- */
  if (!COARSE) {
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const tick = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      svg.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(tick) : 0;
    };
    window.addEventListener('pointermove', (e) => {
      tx = (e.clientX / window.innerWidth - 0.5) * -16;
      ty = (e.clientY / window.innerHeight - 0.5) * -12;
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
  }

  /* --- lifecycle: after the draw-in, while visible ------------------- */
  const DRAW_MS = 2000;
  let inView = true;
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    inView = en.isIntersecting;
    inView && !document.hidden ? start() : stop();
  }), { threshold: 0.05 });
  setTimeout(() => {
    io.observe(root);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : inView && start()));
    // kick off immediately with two jobs so the system is visibly busy
    if (!document.hidden) { start(); setTimeout(runJob, 500); }
  }, DRAW_MS);

  updateReadout();
  root.dataset.sysmapReady = 'true';
}
