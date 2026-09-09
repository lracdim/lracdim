/**
 * Content pipeline walkthrough.
 * A packet travels Researcher → Writer → SEO Generator → Publisher; each
 * stage lights as the packet reaches it, and the caption names what that
 * stage produced. Loops every ~9 s. Static under prefers-reduced-motion.
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initPipeline() {
  const root = document.querySelector('[data-pipeline]');
  if (!root) return;

  const stages = Array.from(root.querySelectorAll('[data-stage]'));
  const caption = root.querySelector('[data-caption]');
  const packets = root.querySelector('[data-packets]');
  const captions = ['Topic in', 'Research brief', 'Draft', 'Title, meta, headings', 'Published to WordPress'];

  if (REDUCED) {
    stages.forEach((s) => s.classList.add('is-on'));
    caption.textContent = captions[4];
    return;
  }

  /* Stage x-centres in viewBox units (rect x + 40) */
  const centers = [56, 216, 376, 536];
  const Y = 88;
  const supportsOffset = CSS.supports && CSS.supports('offset-path', 'path("M0 0 L1 1")');

  let running = false;
  let inView = false;
  let timer = 0;

  function light(i) {
    stages.forEach((s, k) => s.classList.toggle('is-on', k <= i));
    caption.textContent = captions[i + 1] || captions[0];
  }

  function hop(from, to) {
    return new Promise((resolve) => {
      if (!supportsOffset) return setTimeout(resolve, 700);
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.innerHTML = '<circle class="pl-packet--halo" r="7"/><circle class="pl-packet" r="3"/>';
      g.style.offsetPath = `path("M${centers[from] + 40} ${Y} H${centers[to] - 40}")`;
      g.style.offsetRotate = '0deg';
      packets.appendChild(g);
      const a = g.animate(
        [{ offsetDistance: '0%', opacity: 0 }, { offsetDistance: '10%', opacity: 1, offset: 0.12 },
         { offsetDistance: '90%', opacity: 1, offset: 0.88 }, { offsetDistance: '100%', opacity: 0 }],
        { duration: 900, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
      );
      let done = false;
      const finish = () => { if (done) return; done = true; g.remove(); resolve(); };
      a.onfinish = finish;
      setTimeout(finish, 1400); // never let a throttled animation hang the cycle
    });
  }

  async function cycle() {
    if (!running) return;
    stages.forEach((s) => s.classList.remove('is-on'));
    caption.textContent = captions[0];
    await wait(600);
    light(0);
    for (let i = 0; i < 3; i++) {
      await wait(1100);
      if (!running) return;
      await hop(i, i + 1);
      light(i + 1);
    }
    await wait(1600);
    if (!running) return;
    caption.textContent = captions[4];
    timer = setTimeout(cycle, 2200);
  }

  const wait = (ms) => new Promise((r) => (timer = setTimeout(r, ms)));

  const start = () => { if (!running) { running = true; cycle(); } };
  const stop = () => { running = false; clearTimeout(timer); };

  const io = new IntersectionObserver(
    (entries) => entries.forEach((en) => {
      inView = en.isIntersecting;
      inView && !document.hidden ? start() : stop();
    }),
    { threshold: 0.3 }
  );
  io.observe(root);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : inView && start()));
}
