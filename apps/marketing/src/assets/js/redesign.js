/**
 * Redesign behaviour: compacting header, hero frame tilt, and the motion reel.
 * Loaded as a module from layouts/base.njk. Everything degrades: without
 * JavaScript the header stays full height and the reel shows its first scene.
 */
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

/* Header: shrink and frost once the page scrolls. ------------------------- */
const header = document.querySelector('[data-rd-header]');
if (header) {
  const onScroll = () => header.classList.toggle('is-compact', scrollY > 24);
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });
}

/* Hero frame: tilts back and flattens as you scroll into it. --------------- */
const frame = document.querySelector('[data-rd-frame]');
if (frame && !reduced.matches) {
  let raf = 0;
  const update = () => {
    raf = 0;
    frame.style.setProperty('--tilt', `${Math.max(0, 9 - scrollY / 45).toFixed(2)}deg`);
  };
  update();
  addEventListener('scroll', () => { raf ||= requestAnimationFrame(update); }, { passive: true });
}

/* Hero examine form: accept "example.com" and send it to Vector. ----------- */
document.querySelectorAll('[data-rd-examine]').forEach((form) => {
  const input = form.querySelector('input[name="url"]');
  const note = document.getElementById(input?.getAttribute('aria-describedby') || '');
  const defaultNote = note?.textContent;
  input?.addEventListener('input', () => {
    form.classList.remove('is-bad');
    input.removeAttribute('aria-invalid');
    if (note) { note.textContent = defaultNote; note.classList.remove('is-bad'); }
  });
  form.addEventListener('submit', (e) => {
    const raw = (input.value || '').trim();
    let ok = false;
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      ok = /^[^.\s]+(\.[^.\s]+)+$/.test(u.hostname);
    } catch {}
    if (!ok) {
      e.preventDefault();
      form.classList.add('is-bad');
      input.setAttribute('aria-invalid', 'true');
      if (note) { note.textContent = 'Enter a valid website address, like example.com.'; note.classList.add('is-bad'); }
      input.focus();
    }
  });
});

/* Motion reel -------------------------------------------------------------- */
const SCENE_MS = 7000;

function countUp(root) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count);
    const decimals = Number(el.dataset.decimals || 0);
    if (reduced.matches) { el.textContent = to.toFixed(decimals); return; }
    const start = performance.now() + Number(el.dataset.delay || 0);
    el.textContent = (0).toFixed(decimals);
    const tick = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / 1400));
      el.textContent = (to * (1 - (1 - t) ** 3)).toFixed(decimals);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

document.querySelectorAll('[data-reel]').forEach((reel) => {
  const tabs = [...reel.querySelectorAll('[role="tab"]')];
  const panel = reel.querySelector('[data-reel-panel]');
  const caption = reel.querySelector('[data-reel-caption]');
  const toggle = reel.querySelector('[data-reel-toggle]');
  let active = 0;
  let playing = !reduced.matches;
  let hover = false;
  let visible = true;

  const sync = () => reel.classList.toggle('is-running', playing && !hover && visible && !document.hidden);

  const go = (i, focus = false) => {
    active = (i + tabs.length) % tabs.length;
    tabs.forEach((t, k) => {
      const on = k === active;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      t.querySelector('.reel__bar')?.remove();
    });
    const tab = tabs[active];
    const tpl = reel.querySelector(`[data-scene-tpl="${tab.dataset.scene}"]`);
    panel.replaceChildren(tpl.content.cloneNode(true));
    panel.setAttribute('aria-labelledby', tab.id);
    countUp(panel);
    if (caption) {
      caption.textContent = tab.dataset.caption;
      caption.style.animation = 'none';
      void caption.offsetWidth;
      caption.style.animation = '';
    }
    const bar = document.createElement('i');
    bar.className = 'reel__bar';
    bar.style.animationDuration = `${SCENE_MS}ms`;
    bar.addEventListener('animationend', () => go(active + 1));
    tab.append(bar);
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (focus) tab.focus();
  };

  tabs.forEach((t, i) => t.addEventListener('click', () => go(i)));
  reel.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') go(active + 1, true);
    else if (e.key === 'ArrowLeft') go(active - 1, true);
    else return;
    e.preventDefault();
  });

  if (toggle) {
    toggle.hidden = false;
    const label = () => {
      toggle.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
      reel.classList.toggle('is-paused', !playing);
    };
    toggle.addEventListener('click', () => { playing = !playing; label(); sync(); });
    label();
  }
  reel.addEventListener('mouseenter', () => { hover = true; sync(); });
  reel.addEventListener('mouseleave', () => { hover = false; sync(); });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }, { threshold: 0.25 }).observe(reel);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', () => {
    playing = !reduced.matches;
    reel.classList.toggle('is-paused', !playing);
    toggle?.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
    sync();
  });

  go(0);
  sync();
});
