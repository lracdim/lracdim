/**
 * System-graph scenes — three.js, one per [data-scene] mount.
 *
 * Nodes scattered in a shallow volume, edges drawn between near neighbours,
 * the whole thing turning slowly with pointer parallax. Sand on ink. When
 * GSAP ScrollTrigger is present the graph also scrubs with scroll: it turns
 * and recedes as its section leaves the viewport, so the page's motion and
 * the 3D layer read as one system.
 *
 * Density per mount via data-scene-density="high|low" (home hero is high,
 * interior page headers are low).
 *
 * Discipline: renders a single static frame under prefers-reduced-motion,
 * pauses off-screen and when the tab is hidden, and is skipped entirely if
 * WebGL or the library is unavailable. Nothing on the page depends on it.
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function buildScene(mount, THREE) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  mount.appendChild(renderer.domElement);

  const dense = (mount.dataset.sceneDensity || 'high') === 'high';
  const COUNT = dense ? 110 : 56;
  const LINK_DIST = dense ? 3.1 : 3.6;
  const SAND = new THREE.Color('#e2d8a3');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, dense ? 18 : 16);

  // Deterministic per mount so each header has its own stable graph.
  let seed = 1337 + (mount.dataset.sceneSeed ? Number(mount.dataset.sceneSeed) : 0);
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const positions = new Float32Array(COUNT * 3);
  const drift = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const r = Math.pow(rand(), 0.55);
    const a = rand() * Math.PI * 2;
    positions[i * 3] = Math.cos(a) * r * 12;
    positions[i * 3 + 1] = (rand() - 0.5) * (dense ? 8 : 5);
    positions[i * 3 + 2] = Math.sin(a) * r * 5;
    drift[i * 3] = (rand() - 0.5) * 0.004;
    drift[i * 3 + 1] = (rand() - 0.5) * 0.004;
    drift[i * 3 + 2] = (rand() - 0.5) * 0.002;
  }

  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const nodes = new THREE.Points(
    nodeGeo,
    new THREE.PointsMaterial({ color: SAND, size: 0.11, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false })
  );

  const maxEdges = (COUNT * (COUNT - 1)) / 2;
  const edgePos = new Float32Array(maxEdges * 6);
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePos, 3));
  const edges = new THREE.LineSegments(
    edgeGeo,
    new THREE.LineBasicMaterial({ color: SAND, transparent: true, opacity: dense ? 0.22 : 0.18, depthWrite: false })
  );

  const group = new THREE.Group();
  group.add(edges);
  group.add(nodes);
  scene.add(group);

  function rebuildEdges() {
    let n = 0;
    const p = positions;
    const d2 = LINK_DIST * LINK_DIST;
    for (let i = 0; i < COUNT; i++) {
      const ix = p[i * 3], iy = p[i * 3 + 1], iz = p[i * 3 + 2];
      for (let j = i + 1; j < COUNT; j++) {
        const dx = ix - p[j * 3], dy = iy - p[j * 3 + 1], dz = iz - p[j * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < d2) {
          edgePos[n++] = ix; edgePos[n++] = iy; edgePos[n++] = iz;
          edgePos[n++] = p[j * 3]; edgePos[n++] = p[j * 3 + 1]; edgePos[n++] = p[j * 3 + 2];
        }
      }
    }
    edgeGeo.setDrawRange(0, n / 3);
    edgeGeo.attributes.position.needsUpdate = true;
  }

  function resize() {
    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  /* Scroll coupling — scrubbed by GSAP when available. */
  const scroll = { p: 0 };
  if (window.gsap && window.ScrollTrigger && !REDUCED) {
    window.gsap.to(scroll, {
      p: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: mount.parentElement || mount,
        start: 'top top',
        end: 'bottom top',
        scrub: 0.6
      }
    });
  }

  let targetX = 0, targetY = 0, curX = 0, curY = 0;
  const onPointer = (e) => {
    targetX = (e.clientX / window.innerWidth - 0.5) * 0.5;
    targetY = (e.clientY / window.innerHeight - 0.5) * 0.3;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  let raf = 0, running = false, t = 0;
  const baseZ = camera.position.z;

  function frame() {
    if (!running) return;
    t += 0.0035;

    for (let i = 0; i < COUNT * 3; i++) positions[i] += drift[i];
    for (let i = 0; i < COUNT; i++) {
      if (Math.abs(positions[i * 3]) > 13) drift[i * 3] *= -1;
      if (Math.abs(positions[i * 3 + 1]) > 4.5) drift[i * 3 + 1] *= -1;
      if (Math.abs(positions[i * 3 + 2]) > 5.5) drift[i * 3 + 2] *= -1;
    }
    nodeGeo.attributes.position.needsUpdate = true;
    rebuildEdges();

    curX += (targetX - curX) * 0.04;
    curY += (targetY - curY) * 0.04;

    // Scroll adds a turn and pushes the camera back as the section exits.
    group.rotation.y = t + curX + scroll.p * 1.2;
    group.rotation.x = curY * 0.6 + scroll.p * 0.35;
    camera.position.z = baseZ + scroll.p * 6;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  const start = () => { if (!running) { running = true; raf = requestAnimationFrame(frame); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  rebuildEdges();

  if (REDUCED) {
    group.rotation.y = 0.6;
    renderer.render(scene, camera);
    mount.dataset.sceneReady = 'static';
    return { stop };
  }

  const io = new IntersectionObserver(
    (entries) => entries.forEach((en) => (en.isIntersecting && !document.hidden ? start() : stop())),
    { threshold: 0.02 }
  );
  io.observe(mount);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  mount.dataset.sceneReady = 'true';
  return { stop };
}

export function initScenes() {
  if (!window.THREE) return;
  const mounts = document.querySelectorAll('[data-scene]');
  mounts.forEach((m, i) => {
    if (!m.dataset.sceneSeed) m.dataset.sceneSeed = String(i * 97);
    buildScene(m, window.THREE);
  });
}
