/**
 * 3D tilt for project cards. Each card rotates toward the cursor in
 * perspective, with a moving sheen, and settles back on leave.
 * Fine pointers only; nothing under reduced motion.
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = window.matchMedia('(pointer: coarse)').matches;

export function initCards3D() {
  if (REDUCED || COARSE) return;
  const cards = document.querySelectorAll('.card');
  if (!cards.length) return;

  cards.forEach((card) => {
    card.classList.add('card--3d');
    let raf = 0, rx = 0, ry = 0, tx = 0, ty = 0, sx = 50, sy = 50;

    const tick = () => {
      rx += (tx - rx) * 0.12;
      ry += (ty - ry) * 0.12;
      card.style.transform = `perspective(1100px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(${Math.abs(rx) + Math.abs(ry) > 0.2 ? 6 : 0}px)`;
      card.style.setProperty('--sx', sx + '%');
      card.style.setProperty('--sy', sy + '%');
      raf = Math.abs(tx - rx) + Math.abs(ty - ry) > 0.05 ? requestAnimationFrame(tick) : 0;
    };

    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      ty = (px - 0.5) * 14;
      tx = (0.5 - py) * 10;
      sx = px * 100; sy = py * 100;
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });

    card.addEventListener('pointerleave', () => {
      tx = 0; ty = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    });
  });
}
