/**
 * Hero system map — motion controller.
 *
 * The map itself is static SVG (partials/systemmap.njk). CSS draws the
 * routes in on load. This module adds the living part:
 *   - a data packet travels one route every 3–6 s (Web Animations API on
 *     offset-distance; no animation library)
 *   - the destination node goes idle → active (blue) → done (green) → idle
 *   - rarely, a node shows a warning (amber) for a few seconds
 *   - cursor parallax on fine pointers only
 *
 * prefers-reduced-motion: nothing here runs; the static map stays.
 * Mobile: fewer nodes (CSS), no parallax.
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = window.matchMedia('(pointer: coarse)').matches;
const SMALL = () => window.innerWidth < 760;

export function initSystemMap() {
  const root = document.querySelector('[data-sysmap]');
  if (!root || REDUCED) return;

  const svg = root.querySelector('svg');
  const packets = root.querySelector('[data-packets]');
  const routes = Array.from(root.querySelectorAll('.sm-route'));
  const nodes = new Map(
    Array.from(root.querySelectorAll('[data-node]')).map((n) => [n.dataset.node, n])
  );
  const supportsOffset = CSS.supports && CSS.supports('offset-path', 'path("M0 0 L1 1")');

  /* Draw-in is CSS; wait for it before traffic starts. */
  const DRAW_MS = 2400;

  /* --- node state -------------------------------------------------- */
  const timers = new WeakMap();
  function setState(node, state, ms) {
    node.classList.remove('is-active', 'is-done', 'is-warn');
    if (state) node.classList.add(state);
    clearTimeout(timers.get(node));
    if (ms) timers.set(node, setTimeout(() => node.classList.remove(state), ms));
  }

  function arrive(node) {
    setState(node, 'is-active');
    setTimeout(() => {
      setState(node, 'is-done', 1400);
    }, 900);
  }

  /* --- packets ------------------------------------------------------ */
  function usableRoutes() {
    return routes.filter((r) => {
      if (!SMALL()) return true;
      const to = nodes.get(r.dataset.to);
      return to && !to.classList.contains('sm-hide-sm') && !r.classList.contains('sm-route--faint');
    });
  }

  function sendPacket() {
    const pool = usableRoutes();
    if (!pool.length) return;
    const route = pool[Math.floor(Math.random() * pool.length)];
    const d = route.getAttribute('d');
    const len = route.getTotalLength ? route.getTotalLength() : 400;
    const duration = Math.max(1200, Math.min(2800, len * 4.2));

    route.classList.add('is-live');
    setTimeout(() => route.classList.remove('is-live'), duration + 300);

    const dest = nodes.get(route.dataset.to);

    if (!supportsOffset) {
      // Fallback: just flip the destination state on a timer.
      setTimeout(() => dest && arrive(dest), duration);
      return;
    }

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'sm-packet');
    g.innerHTML = '<circle class="sm-packet__halo" r="8"/><circle class="sm-packet__core" r="3.5"/>';
    g.style.offsetPath = `path("${d}")`;
    g.style.offsetRotate = '0deg';
    packets.appendChild(g);

    const anim = g.animate(
      [{ offsetDistance: '0%', opacity: 0 }, { offsetDistance: '6%', opacity: 1, offset: 0.08 },
       { offsetDistance: '94%', opacity: 1, offset: 0.92 }, { offsetDistance: '100%', opacity: 0 }],
      { duration, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
    );
    anim.onfinish = () => {
      g.remove();
      if (dest) arrive(dest);
    };
  }

  function loop() {
    sendPacket();
    setTimeout(loop, 3000 + Math.random() * 3000);
  }

  /* --- rare warning ------------------------------------------------- */
  function warnLoop() {
    const pool = Array.from(nodes.values()).filter((n) => !SMALL() || !n.classList.contains('sm-hide-sm'));
    const n = pool[Math.floor(Math.random() * pool.length)];
    if (n && !n.classList.contains('is-active')) setState(n, 'is-warn', 3200);
    setTimeout(warnLoop, 22000 + Math.random() * 14000);
  }

  /* --- parallax (fine pointers only) -------------------------------- */
  if (!COARSE) {
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const tick = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      svg.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(tick) : 0;
    };
    window.addEventListener(
      'pointermove',
      (e) => {
        tx = (e.clientX / window.innerWidth - 0.5) * -14;
        ty = (e.clientY / window.innerHeight - 0.5) * -10;
        if (!raf) raf = requestAnimationFrame(tick);
      },
      { passive: true }
    );
  }

  /* --- start after draw-in, pause when hidden ----------------------- */
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    setTimeout(loop, 600);
    setTimeout(warnLoop, 9000);
  };
  setTimeout(() => {
    if (!document.hidden) start();
    else document.addEventListener('visibilitychange', () => !document.hidden && start(), { once: true });
  }, DRAW_MS);

  root.dataset.sysmapReady = 'true';
}
