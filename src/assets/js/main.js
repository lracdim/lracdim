/**
 * LRACDIMENSION — site runtime.
 * Preloader, sticky header, mobile drawer, scroll reveal, hero line-in.
 * No framework, no bundler. Progressive: everything degrades to static HTML.
 */

import { initDiagnosticModal } from './modal.js';
import { initTerminal } from './terminal.js';
import { initStartForm } from './start.js';
import { flushQueue } from './leads.js';

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

/* --------------------------------------------------------------------- boot */

async function boot() {
  initHeader();
  initDrawer();
  initDiagnosticModal();
  initTerminal();
  initStartForm();
  flushQueue();

  await initPreloader();

  initHeroLines();
  initReveal();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
