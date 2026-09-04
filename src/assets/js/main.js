/**
 * LRACDIMENSION — site runtime.
 * Preloader, sticky header, mobile drawer, scroll reveal, hero line-in.
 * No framework, no bundler. Progressive: everything degrades to static HTML.
 */

import { initDiagnosticModal } from './modal.js';
import { initTerminal } from './terminal.js';
import { initStartForm } from './start.js';
import { flushQueue } from './leads.js';
import { initScenes } from './scene.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------- preloader */

function initPreloader() {
  const el = document.querySelector('[data-preloader]');
  if (!el) return Promise.resolve();

  if (reduceMotion || sessionStorage.getItem('lracdim:seen') === '1') {
    el.remove();
    return Promise.resolve();
  }

  const fill = el.querySelector('[data-preloader-fill]');
  const pct = el.querySelector('[data-preloader-pct]');

  return new Promise((resolve) => {
    let value = 0;
    const tick = setInterval(() => {
      value = Math.min(100, value + 6 + Math.random() * 14);
      if (fill) fill.style.width = value + '%';
      if (pct) pct.textContent = String(Math.round(value)).padStart(3, '0');

      if (value >= 100) {
        clearInterval(tick);
        setTimeout(() => {
          el.classList.add('is-done');
          try {
            sessionStorage.setItem('lracdim:seen', '1');
          } catch {
            /* private mode — fine, the loader just runs again */
          }
          setTimeout(() => el.remove(), 650);
          resolve();
        }, 260);
      }
    }, 110);
  });
}

/* ------------------------------------------------------------------- header */

function initHeader() {
  const header = document.querySelector('[data-header]');
  if (!header) return;

  let lastY = window.scrollY;

  const onScroll = () => {
    const y = window.scrollY;
    header.classList.toggle('is-stuck', y > 20);
    // Hide on downward scroll past the hero, show on the way back up.
    header.classList.toggle('is-hidden', y > 400 && y > lastY);
    lastY = y;
  };

  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

/* ------------------------------------------------------------------- drawer */

function initDrawer() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const drawer = document.querySelector('[data-drawer]');
  if (!toggle || !drawer) return;

  const setState = (open) => {
    drawer.classList.toggle('is-open', open);
    document.body.classList.toggle('is-locked', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('[data-nav-toggle-label]').textContent = open ? 'Close' : 'Menu';
  };

  toggle.addEventListener('click', () => setState(!drawer.classList.contains('is-open')));
  drawer.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setState(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) setState(false);
  });
}

/* ------------------------------------------------------------------- reveal */

function initReveal() {
  const targets = document.querySelectorAll('[data-reveal]');
  if (!targets.length) return;

  if (reduceMotion || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const delay = Number(entry.target.dataset.revealDelay || 0);
        setTimeout(() => entry.target.classList.add('is-in'), delay);
        io.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
  );

  targets.forEach((el) => io.observe(el));
}

/* --------------------------------------------------------------- hero lines */

function initHeroLines() {
  const lines = document.querySelectorAll('[data-hero-line]');
  if (!lines.length) return;

  if (reduceMotion) {
    lines.forEach((l) => (l.style.transform = 'none'));
    return;
  }

  lines.forEach((line, i) => {
    line.style.transform = 'translateY(110%)';
    line.style.transition = 'transform 1s cubic-bezier(0.22, 1, 0.36, 1)';
    line.style.transitionDelay = `${i * 0.09}s`;
  });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => lines.forEach((l) => (l.style.transform = 'translateY(0)')));
  });
}

/* ------------------------------------------------------------ scroll motion */

/**
 * GSAP ScrollTrigger choreography for the whole site.
 *
 * Two kinds of motion, deliberately:
 *   scrubbed — tied to the wheel, moves both ways: page progress line, hero
 *              receding, dark bands wiping open, split columns drifting at
 *              different rates, header grid parallax, ticker speed.
 *   entrance — plays once as a thing arrives: rows slide, cards tilt in,
 *              rules draw, counters count.
 *
 * Returns false when GSAP is unavailable or motion is reduced, so the plain
 * IntersectionObserver reveal takes over.
 */
function initScrollMotion() {
  if (reduceMotion || !window.gsap || !window.ScrollTrigger) return false;
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  gsap.registerPlugin(ST);
  document.documentElement.classList.add('has-gsap');
  const q = (sel) => gsap.utils.toArray(sel);

  /* ---- scrubbed ------------------------------------------------------- */

  // Page progress line.
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  gsap.to(bar, {
    scaleX: 1,
    ease: 'none',
    scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 0.3 }
  });

  // Hero recedes as you leave it: copy drifts up and fades, background grid lags.
  const hero = document.querySelector('.hero');
  if (hero) {
    gsap.to(hero.querySelector('.hero__inner'), {
      yPercent: -18,
      opacity: 0,
      ease: 'none',
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true }
    });
  }
  q('.pagehead .hero__grid-bg, .hero .hero__grid-bg').forEach((bg) => {
    gsap.to(bg, {
      yPercent: 22,
      ease: 'none',
      scrollTrigger: { trigger: bg.parentElement, start: 'top top', end: 'bottom top', scrub: true }
    });
  });

  // Dark bands wipe open from the top edge as they arrive. Driven through a
  // numeric proxy — tweening the clip-path string directly is unreliable
  // across browsers (it can sit at the start value until progress hits 1).
  q('.band--dark').forEach((band) => {
    const state = { p: 0 };
    const paint = () => {
      const hidden = Math.max(0, Math.min(100, (1 - state.p) * 100));
      band.style.clipPath = hidden <= 0.5 ? '' : `inset(0 0 ${hidden.toFixed(2)}% 0)`;
    };
    paint();
    gsap.to(state, {
      p: 1,
      ease: 'none',
      onUpdate: paint,
      scrollTrigger: { trigger: band, start: 'top 95%', end: 'top 35%', scrub: 0.4 }
    });
  });

  // Split columns drift at different rates while the section is on screen.
  q('.split').forEach((split) => {
    const lead = split.querySelector('.split__lead');
    const body = split.querySelector('.split__body');
    if (!lead || !body) return;
    const trig = { trigger: split, start: 'top bottom', end: 'bottom top', scrub: true };
    gsap.fromTo(lead, { y: 40 }, { y: -40, ease: 'none', scrollTrigger: trig });
    gsap.fromTo(body, { y: 80 }, { y: -20, ease: 'none', scrollTrigger: trig });
  });

  // Big headings inside dark bands scale up slightly as they cross the screen.
  q('.band--dark .h1, .band--dark .h2').forEach((h) => {
    gsap.fromTo(
      h,
      { scale: 0.92, opacity: 0.2 },
      {
        scale: 1,
        opacity: 1,
        ease: 'none',
        transformOrigin: 'left center',
        scrollTrigger: { trigger: h, start: 'top 95%', end: 'top 45%', scrub: 0.5 }
      }
    );
  });

  // Ticker speeds up with scroll velocity, then relaxes.
  q('.ticker__track').forEach((track) => {
    const base = 42;
    let cur = base;
    track.style.animationDuration = base + 's';
    ST.create({
      trigger: track,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        const v = Math.min(Math.abs(self.getVelocity()) / 1500, 1);
        cur = gsap.utils.interpolate(cur, base - v * 32, 0.25);
        track.style.animationDuration = cur.toFixed(1) + 's';
      }
    });
  });

  /* ---- entrance ------------------------------------------------------- */

  // Work rows slide in from the left with a slight skew that settles.
  ST.batch('.work__item', {
    start: 'top 90%',
    once: true,
    onEnter: (els) =>
      gsap.fromTo(
        els,
        { x: -48, opacity: 0, skewX: 6 },
        { x: 0, opacity: 1, skewX: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, overwrite: true,
          onComplete: () => els.forEach((el) => el.classList.add('is-in')) }
      )
  });

  // Cells, cards and stats tilt up into place.
  ST.batch('.cell, .card, .stat', {
    start: 'top 90%',
    once: true,
    onEnter: (els) =>
      gsap.fromTo(
        els,
        { y: 48, opacity: 0, rotateX: 18 },
        { y: 0, opacity: 1, rotateX: 0, duration: 0.9, ease: 'power3.out', stagger: 0.07, overwrite: true,
          onComplete: () => els.forEach((el) => el.classList.add('is-in')) }
      )
  });

  // Everything else marked for reveal: rise and fade.
  ST.batch('[data-reveal]:not(.work__item):not(.cell):not(.card):not(.stat)', {
    start: 'top 88%',
    once: true,
    onEnter: (els) =>
      gsap.to(els, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.07, overwrite: true,
        onComplete: () => els.forEach((el) => el.classList.add('is-in')) })
  });

  // Hairline rules draw in; their labels slide up.
  q('.eyebrow__rule').forEach((rule) =>
    gsap.from(rule, { scaleX: 0, transformOrigin: 'left center', duration: 1.1, ease: 'power3.out',
      scrollTrigger: { trigger: rule, start: 'top 90%', once: true } })
  );
  q('.eyebrow .label').forEach((label) =>
    gsap.from(label, { y: 12, opacity: 0, duration: 0.6, ease: 'power2.out',
      scrollTrigger: { trigger: label, start: 'top 92%', once: true } })
  );

  // Stat counters count up; "8+" counts 0 to 8 and keeps the suffix.
  q('.stat__count').forEach((el) => {
    const m = String(el.textContent).trim().match(/^(\d+)(.*)$/);
    if (!m) return;
    const target = Number(m[1]);
    const suffix = m[2];
    const state = { n: 0 };
    gsap.to(state, { n: target, duration: 1.2, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      onUpdate: () => (el.textContent = Math.round(state.n) + suffix) });
  });

  return true;
}

/* --------------------------------------------------------------------- boot */

async function boot() {
  initHeader();
  initDrawer();
  initDiagnosticModal();
  initTerminal();
  initStartForm();
  flushQueue();

  await initPreloader();

  initScenes();
  initHeroLines();
  if (!initScrollMotion()) initReveal();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
