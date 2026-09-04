/**
 * Hero scene — a system graph in three.js.
 *
 * Nodes scattered in a shallow volume, edges drawn between near neighbours,
 * the whole thing turning slowly with a little mouse parallax. Sand on ink,
 * same as everything else. It sits behind the hero copy and is purely
 * decorative: no interaction is required to use the page, it pauses when the
 * tab is hidden, renders one static frame under prefers-reduced-motion, and
 * is skipped entirely if WebGL or the library is unavailable.
 *
 * Loaded only on the home page, from cdnjs, after the page has parsed.
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initScene() {
  const mount = document.querySelector('[data-scene]');
  if (!mount || !window.THREE) return;

  const THREE = window.THREE;

  /* --- renderer ------------------------------------------------------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return; // no WebGL — the CSS grid behind the hero remains
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 18);

  /* --- graph ---------------------------------------------------------- */
  const COUNT = 110;
  const LINK_DIST = 3.1;
  const SAND = new THREE.Color('#e2d8a3');

  // Deterministic pseudo-random so the graph is the same on every load.
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const positions = new Float32Array(COUNT * 3);
  const drift = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    // Shallow oblate cloud: wide, not tall, not deep.
    const r = Math.pow(rand(), 0.55);
    const a = rand() * Math.PI * 2;
    const y = (rand() - 0.5) * 8;
    positions[i * 3] = Math.cos(a) * r * 12;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(a) * r * 5;
    drift[i * 3] = (rand() - 0.5) * 0.004;
    drift[i * 3 + 1] = (rand() - 0.5) * 0.004;
    drift[i * 3 + 2] = (rand() - 0.5) * 0.002;
  }

  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const nodeMat = new THREE.PointsMaterial({
    color: SAND,
    size: 0.11,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
  });
  const nodes = new THREE.Points(nodeGeo, nodeMat);

  // Edges: preallocate the worst case, update the draw range each frame.
  const maxEdges = (COUNT * (COUNT - 1)) / 2;
  const edgePos = new Float32Array(maxEdges * 6);
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePos, 3));
  const edgeMat = new THREE.LineBasicMaterial({
    color: SAND,
    transparent: true,
    opacity: 0.22,
    depthWrite: false
  });
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);

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

  /* --- sizing --------------------------------------------------------- */
  function resize() {
    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  /* --- pointer parallax ----------------------------------------------- */
  let targetX = 0, targetY = 0, curX = 0, curY = 0;
  window.addEventListener(
    'pointermove',
    (e) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 0.5;
      targetY = (e.clientY / window.innerHeight - 0.5) * 0.3;
    },
    { passive: true }
  );

  /* --- loop ----------------------------------------------------------- */
  let raf = 0;
  let running = false;
  let t = 0;

  function frame() {
    if (!running) return;
    t += 0.0035;

    for (let i = 0; i < COUNT * 3; i++) positions[i] += drift[i];
    // Keep the cloud loosely bounded by nudging drift back toward centre.
    for (let i = 0; i < COUNT; i++) {
      if (Math.abs(positions[i * 3]) > 13) drift[i * 3] *= -1;
      if (Math.abs(positions[i * 3 + 1]) > 4.5) drift[i * 3 + 1] *= -1;
      if (Math.abs(positions[i * 3 + 2]) > 5.5) drift[i * 3 + 2] *= -1;
    }
    nodeGeo.attributes.position.needsUpdate = true;
    rebuildEdges();

    curX += (targetX - curX) * 0.04;
    curY += (targetY - curY) * 0.04;
    group.rotation.y = t + curX;
    group.rotation.x = curY * 0.6;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  rebuildEdges();

  if (REDUCED) {
    group.rotation.y = 0.6;
    renderer.render(scene, camera);
    return;
  }

  // Only spend GPU while the hero is actually on screen and the tab is visible.
  const io = new IntersectionObserver(
    (entries) => entries.forEach((en) => (en.isIntersecting && !document.hidden ? start() : stop())),
    { threshold: 0.05 }
  );
  io.observe(mount);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  mount.dataset.sceneReady = 'true';
}
