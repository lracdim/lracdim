/**
 * 3D system assembly — three.js (WebGL).
 *
 * Four layered volumes stacked in space: Interface, API, Automation,
 * Database. Each carries its own geometry (UI tiles, a node ring, a
 * rotating gear ring, stacked discs). Glowing packets travel between the
 * layers on curves. The assembly turns slowly, tilts toward the cursor,
 * and — driven by GSAP ScrollTrigger — pulls apart into its layers as the
 * page scrolls, while the camera dollies back.
 *
 * Mount:  <div data-hero3d data-detail="high|low"></div>
 *   high — home hero: full detail, packets, labels overlay.
 *   low  — interior page headers: smaller, no packets.
 *
 * Reduced motion: one static frame. No WebGL: nothing (the CSS grid stays).
 * Pauses off-screen and when the tab is hidden.
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = window.matchMedia('(pointer: coarse)').matches;

const INK = 0x18191b;
const SAND = 0xe2d8a3;
const BLUE = 0x4f8ff7;
const PLATE = 0x22252a;
const EDGE = 0x5b6b7d;

const LAYERS = [
  { key: 'interface', label: 'Interface', sub: 'What the client touches' },
  { key: 'api', label: 'API', sub: 'Where requests are routed' },
  { key: 'automation', label: 'Automation', sub: 'Work that runs itself' },
  { key: 'database', label: 'Database', sub: 'Where the record lives' }
];

export function initHero3D() {
  if (!window.THREE) return;
  document.querySelectorAll('[data-hero3d]').forEach((mount) => build(mount, window.THREE));
}

function build(mount, THREE) {
  const high = (mount.dataset.detail || 'high') === 'high';
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(INK, 9, 22);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  const CAM_Z = high ? 11 : 12;
  camera.position.set(0, 1.2, CAM_Z);

  /* --- light: one warm key, one cool fill, soft ambient ------------- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(SAND, 1.1);
  key.position.set(4, 6, 5);
  scene.add(key);
  const fill = new THREE.PointLight(BLUE, 0.9, 30);
  fill.position.set(-5, -2, 4);
  scene.add(fill);

  /* --- the assembly --------------------------------------------------- */
  const assembly = new THREE.Group();
  assembly.position.x = high ? 3.4 : 0; // sits clear of the headline
  scene.add(assembly);

  const plateGeo = new THREE.BoxGeometry(5.2, 0.22, 3.4);
  const plateMat = new THREE.MeshStandardMaterial({
    color: PLATE, metalness: 0.35, roughness: 0.55, transparent: true, opacity: 0.92
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: EDGE, transparent: true, opacity: 0.9 });
  const sandLine = new THREE.LineBasicMaterial({ color: SAND, transparent: true, opacity: 0.85 });
  const blueMat = new THREE.MeshBasicMaterial({ color: BLUE });
  const sandMat = new THREE.MeshBasicMaterial({ color: SAND });

  const layers = LAYERS.map((def, i) => {
    const g = new THREE.Group();
    const plate = new THREE.Mesh(plateGeo, plateMat);
    g.add(plate);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(plateGeo), edgeMat));

    /* per-layer detail on the top face (y = 0.11) */
    const top = 0.12;
    if (def.key === 'interface') {
      // a small UI: header bar + tiles
      const tile = new THREE.BoxGeometry(0.9, 0.06, 0.5);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
        const m = new THREE.Mesh(tile, new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.6 }));
        m.position.set(-1.65 + c * 1.1, top + 0.03, -0.75 + r * 0.9);
        g.add(m);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.05, 0.28), sandMat);
      bar.position.set(0, top + 0.03, -1.4);
      g.add(bar);
    } else if (def.key === 'api') {
      // a ring of nodes connected to a hub
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), sandMat);
      hub.position.set(0, top + 0.16, 0);
      g.add(hub);
      const pts = [];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const p = new THREE.Vector3(Math.cos(a) * 1.9, top + 0.12, Math.sin(a) * 1.15);
        const n = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), new THREE.MeshBasicMaterial({ color: EDGE }));
        n.position.copy(p);
        g.add(n);
        pts.push(hub.position.clone(), p);
      }
      g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), edgeMat));
    } else if (def.key === 'automation') {
      // a gear ring that rotates, with a second counter-rotating ring
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.09, 10, 48), new THREE.MeshStandardMaterial({ color: 0x3a4656, roughness: 0.5, metalness: 0.5 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = top + 0.12;
      ring.userData.spin = 0.35;
      g.add(ring);
      const teeth = new THREE.Group();
      for (let k = 0; k < 12; k++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.24), sandMat);
        const a = (k / 12) * Math.PI * 2;
        t.position.set(Math.cos(a) * 1.0, top + 0.12, Math.sin(a) * 1.0);
        t.rotation.y = -a;
        teeth.add(t);
      }
      teeth.userData.spin = 0.35;
      g.add(teeth);
      const inner = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 10, 36), new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.4 }));
      inner.rotation.x = Math.PI / 2;
      inner.position.y = top + 0.12;
      inner.userData.spin = -0.6;
      g.add(inner);
    } else {
      // stacked discs = a database
      for (let k = 0; k < 3; k++) {
        const d = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.16, 32), new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.5, metalness: 0.4 }));
        d.position.set(0, top + 0.1 + k * 0.24, 0);
        g.add(d);
        const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.75, 0.75, 0.16, 32)), sandLine);
        rim.position.copy(d.position);
        g.add(rim);
      }
    }

    g.userData.index = i;
    assembly.add(g);
    return g;
  });

  /* stacked positions (top to bottom) and exploded positions */
  const STACK_GAP = 0.55;
  const SPREAD_GAP = 1.9;
  function layout(spread) {
    const gap = STACK_GAP + (SPREAD_GAP - STACK_GAP) * spread;
    layers.forEach((g, i) => {
      g.position.y = (1.5 - i) * gap;
      // as they spread, alternate layers drift slightly on x for depth
      g.position.x = spread * (i % 2 ? 0.45 : -0.45);
    });
  }
  layout(0);

  /* --- packets between layers (high detail only) --------------------- */
  const packets = [];
  if (high) {
    const pGeo = new THREE.SphereGeometry(0.07, 10, 10);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: i % 3 ? BLUE : SAND }));
      m.userData.t = Math.random();
      m.userData.speed = 0.12 + Math.random() * 0.1;
      m.userData.from = Math.floor(Math.random() * 4);
      m.userData.to = (m.userData.from + 1 + Math.floor(Math.random() * 3)) % 4;
      m.userData.side = Math.random() < 0.5 ? -1 : 1;
      assembly.add(m);
      packets.push(m);
    }
  }
  function movePackets(dt) {
    packets.forEach((p) => {
      p.userData.t += dt * p.userData.speed;
      if (p.userData.t >= 1) {
        p.userData.t = 0;
        p.userData.from = p.userData.to;
        p.userData.to = (p.userData.from + 1 + Math.floor(Math.random() * 3)) % 4;
        p.userData.side = Math.random() < 0.5 ? -1 : 1;
      }
      const a = layers[p.userData.from].position;
      const b = layers[p.userData.to].position;
      const t = p.userData.t;
      // arc out to the side of the stack and back
      const ease = t * t * (3 - 2 * t);
      p.position.set(
        a.x + (b.x - a.x) * ease + p.userData.side * Math.sin(t * Math.PI) * 3.0,
        a.y + (b.y - a.y) * ease + 0.2,
        Math.sin(t * Math.PI) * 1.2
      );
    });
  }

  /* --- sizing --------------------------------------------------------- */
  function resize() {
    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // on narrow screens bring the assembly to centre and pull back
    assembly.position.x = high && w > 900 ? 3.4 : 0;
    camera.position.z = CAM_Z + (w < 700 ? 3 : 0);
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  /* --- pointer tilt (fine pointers) ----------------------------------- */
  let tx = 0, ty = 0;
  if (!COARSE) {
    window.addEventListener('pointermove', (e) => {
      tx = (e.clientX / window.innerWidth - 0.5);
      ty = (e.clientY / window.innerHeight - 0.5);
    }, { passive: true });
  }

  /* --- scroll: pull the layers apart and dolly back ------------------- */
  const scroll = { spread: 0 };
  const labelsEl = mount.parentElement && mount.parentElement.querySelector('[data-hero3d-labels]');
  if (high && window.gsap && window.ScrollTrigger && !REDUCED) {
    window.gsap.to(scroll, {
      spread: 1,
      ease: 'none',
      scrollTrigger: { trigger: mount.parentElement, start: 'top top', end: 'bottom top', scrub: 0.5 },
      onUpdate: () => {
        if (labelsEl) labelsEl.style.setProperty('--spread', scroll.spread.toFixed(3));
      }
    });
  }

  /* --- loop ----------------------------------------------------------- */
  const clock = new THREE.Clock();
  let raf = 0, running = false, rotX = 0, rotY = 0;

  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);

    layout(scroll.spread);
    assembly.rotation.y += dt * 0.18;
    rotX += ((ty * 0.35) - rotX) * 0.05;
    rotY += ((tx * 0.6) - rotY) * 0.05;
    assembly.rotation.x = -0.28 + rotX;
    assembly.rotation.z = rotY * 0.15;

    layers.forEach((g) => g.children.forEach((c) => { if (c.userData.spin) c.rotation.y += dt * c.userData.spin; }));
    movePackets(dt);

    camera.position.z = (CAM_Z + (mount.clientWidth < 700 ? 3 : 0)) + scroll.spread * 4;
    camera.position.y = 1.2 + scroll.spread * 0.8;
    camera.lookAt(assembly.position.x, 0, 0);

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  const start = () => { if (!running) { running = true; clock.getDelta(); raf = requestAnimationFrame(frame); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  if (REDUCED) {
    assembly.rotation.y = 0.6; assembly.rotation.x = -0.28;
    layout(0.35);
    renderer.render(scene, camera);
    mount.dataset.hero3dReady = 'static';
    return;
  }

  let inView = true;
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    inView = en.isIntersecting;
    inView && !document.hidden ? start() : stop();
  }), { threshold: 0.02 });
  io.observe(mount);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : inView && start()));
  start();

  mount.dataset.hero3dReady = 'true';
}
