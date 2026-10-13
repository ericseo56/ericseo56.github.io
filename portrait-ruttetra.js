// Portrait adapter for Felix Turner's Rutt-Etra-Izer from source.zip.
// Its colored scanlines use brightness as Z displacement in an actual 3D scene.
const frame = document.querySelector('#portrait-frame');
const photo = frame.querySelector('.portrait-front');
const trigger = document.querySelector('#portrait-ruttetra-trigger');
const reset = document.querySelector('#portrait-reset');
const mosh = document.querySelector('#portrait-trigger');
const status = document.querySelector('#portrait-ruttetra-status');
const pointers = new Map();
let THREE, renderer, scene, camera, holder, surface, ready;
let active = false;
let visible = true;
let request = 0;
let drag;
let rotationX = -Math.PI + 0.06;
let rotationY = Math.PI - 0.18;
let panX = 0, panY = 0, zoom = 1;
let imageWidth, imageHeight;

function render() {
  request = 0;
  if (!active || !visible || document.hidden) return;
  holder.rotation.x = rotationX;
  holder.rotation.y = rotationY;
  holder.position.x = panX;
  holder.position.y = panY;
  holder.scale.set(zoom, zoom, zoom);
  renderer.render(scene, camera);
}

function invalidate() {
  if (active && visible && !document.hidden && !request) request = requestAnimationFrame(render);
}

function resetView() {
  rotationX = -Math.PI + 0.06;
  rotationY = Math.PI - 0.18;
  panX = panY = 0;
  zoom = 1;
}

function resize() {
  if (!renderer) return;
  const bounds = frame.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const density = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setSize(Math.round(bounds.width * density), Math.round(bounds.height * density));
  camera.aspect = bounds.width / bounds.height;
  const fit = Math.max(imageHeight / 2, imageWidth / (2 * camera.aspect));
  camera.position.z = -(fit / Math.tan(75 * Math.PI / 360) + 40);
  camera.updateProjectionMatrix();
  invalidate();
}

function createLines() {
  // Bound the sampling work independently of the original 1018x1545 photo.
  const image = document.createElement('canvas');
  image.width = imageWidth = 320;
  image.height = imageHeight = Math.round(image.width * photo.naturalHeight / photo.naturalWidth);
  const context = image.getContext('2d', { willReadFrequently: true });
  context.drawImage(photo, 0, 0, imageWidth, imageHeight);
  const rgba = context.getImageData(0, 0, imageWidth, imageHeight).data;
  const geometry = new THREE.Geometry();
  const step = 3;
  const depth = 75;
  const vertex = (x, y, offset) => {
    const color = new THREE.Color((rgba[offset] << 16) + (rgba[offset + 1] << 8) + rgba[offset + 2]);
    const brightness = 0.34 * color.r + 0.5 * color.g + 0.16 * color.b;
    geometry.vertices.push(new THREE.Vertex(new THREE.Vector3(
      x - imageWidth / 2, y - imageHeight / 2, depth / 2 - brightness * depth)));
    geometry.colors.push(color);
  };
  for (let y = 0; y < imageHeight; y += step) {
    for (let x = 0; x + step < imageWidth; x += step) {
      const a = (y * imageWidth + x) * 4;
      const b = a + step * 4;
      // Transparent pixels must not produce a rectangular background mesh.
      if (rgba[a + 3] < 100 || rgba[b + 3] < 100) continue;
      vertex(x, y, a);
      vertex(x + step, y, b);
    }
  }
  const material = new THREE.LineBasicMaterial({
    color: 0xffffff, opacity: 1, linewidth: 1,
    blending: THREE.AdditiveBlending, depthTest: false, vertexColors: true
  });
  // Pack all scanlines into one draw call, rather than one object per row.
  holder.addChild(new THREE.Line(geometry, material, THREE.LinePieces));
  frame.dataset.ruttetraVertices = String(geometry.vertices.length);
}

function point(event) {
  return { x: event.clientX, y: event.clientY, pan: event.shiftKey || event.button === 2 };
}

function gesture() {
  const points = [...pointers.values()];
  if (points.length >= 2) {
    const [a, b] = points;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
      distance: Math.hypot(a.x - b.x, a.y - b.y), pan: true, count: 2 };
  }
  return points.length ? { ...points[0], count: 1 } : undefined;
}

function move(event) {
  if (!active || !pointers.has(event.pointerId)) return;
  const previous = pointers.get(event.pointerId);
  pointers.set(event.pointerId, { ...point(event), pan: previous.pan || event.shiftKey });
  const next = gesture();
  if (drag && drag.count === next.count) {
    const dx = next.x - drag.x;
    const dy = next.y - drag.y;
    const bounds = frame.getBoundingClientRect();
    if (next.pan) {
      panX -= dx / bounds.height * imageHeight;
      panY -= dy / bounds.height * imageHeight;
      if (next.count === 2 && drag.distance > 0) zoom = Math.max(0.25, Math.min(5, zoom * next.distance / drag.distance));
    } else {
      rotationY += dx / bounds.width * Math.PI * 2;
      rotationX += dy / bounds.height * Math.PI * 2;
    }
    invalidate();
  }
  drag = next;
}

function endPointer(event) {
  pointers.delete(event.pointerId);
  drag = gesture();
}

function bindControls() {
  surface.addEventListener('pointerdown', (event) => {
    if (!active || (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2)) return;
    event.preventDefault();
    surface.focus({ preventScroll: true });
    surface.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, point(event));
    drag = gesture();
  });
  surface.addEventListener('pointermove', move);
  surface.addEventListener('pointerup', endPointer);
  surface.addEventListener('pointercancel', endPointer);
  surface.addEventListener('lostpointercapture', endPointer);
  surface.addEventListener('contextmenu', (event) => event.preventDefault());
  surface.addEventListener('wheel', (event) => {
    if (!active) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? frame.clientHeight : 1);
    zoom = Math.max(0.25, Math.min(5, zoom * Math.exp(-delta * 0.0015)));
    invalidate();
  }, { passive: false });
  surface.addEventListener('keydown', (event) => {
    if (!active) return;
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (directions[event.key]) {
      const [x, y] = directions[event.key];
      if (event.shiftKey) { panX -= x * 10; panY -= y * 10; }
      else { rotationY += x * 0.08; rotationX += y * 0.08; }
    } else if (event.key === '+' || event.key === '=') zoom = Math.min(5, zoom * 1.1);
    else if (event.key === '-') zoom = Math.max(0.25, zoom / 1.1);
    else if (event.key === '0') resetView();
    else return;
    event.preventDefault();
    invalidate();
  });
}

function loadThree() {
  // The 2011 library needs classic-script semantics rather than ESM strict mode.
  return new Promise((resolve, reject) => {
    if (window.THREE) { resolve(window.THREE); return; }
    const script = document.createElement('script');
    script.src = new URL('./assets/vendor/ruttetra/three-r37.js', import.meta.url).href;
    script.onload = () => window.THREE ? resolve(window.THREE) : reject(new Error('Three.js did not load.'));
    script.onerror = () => { script.remove(); reject(new Error('Three.js could not load.')); };
    document.head.appendChild(script);
  });
}

async function initialize() {
  if (ready) return ready;
  ready = (async () => {
    await photo.decode();
    THREE = await loadThree();
    renderer = new THREE.WebGLRenderer({ antialias: true, clearColor: 0x000000, clearAlpha: 0 });
    renderer.sortObjects = false;
    surface = renderer.domElement;
    surface.className = 'portrait-ruttetra';
    surface.hidden = true;
    surface.tabIndex = 0;
    surface.setAttribute('role', 'img');
    surface.setAttribute('aria-label', 'Interactive 3D Rutt Etra portrait. Arrow keys rotate, Shift and arrows move, plus and minus zoom, zero resets the view.');
    surface.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      deactivate();
      status.textContent = 'The 3D view needs a page refresh.';
      status.hidden = false;
      trigger.disabled = true;
    });
    scene = new THREE.Scene();
    camera = new THREE.Camera(75, 1, 1, 3000);
    holder = new THREE.Object3D();
    scene.addObject(holder);
    createLines();
    frame.appendChild(surface);
    bindControls();
    new ResizeObserver(resize).observe(frame);
    resize();
  })();
  return ready;
}

function setView(view) {
  frame.dataset.view = view;
  frame.dispatchEvent(new CustomEvent('portraitviewchange', { detail: { view } }));
}

function deactivate() {
  active = false;
  cancelAnimationFrame(request);
  request = 0;
  for (const pointerId of pointers.keys()) {
    if (surface?.hasPointerCapture(pointerId)) surface.releasePointerCapture(pointerId);
  }
  pointers.clear();
  drag = undefined;
  if (surface) surface.hidden = true;
  trigger.setAttribute('aria-pressed', 'false');
  if (frame.dataset.view === 'ruttetra') setView('portrait');
}

let selection = 0;
trigger.addEventListener('click', async () => {
  if (active) { deactivate(); return; }
  const current = ++selection;
  trigger.disabled = true;
  trigger.setAttribute('aria-busy', 'true');
  status.hidden = true;
  try {
    await initialize();
    if (current !== selection) return;
    resetView();
    active = true;
    setView('ruttetra');
    surface.hidden = false;
    trigger.setAttribute('aria-pressed', 'true');
    resize();
  } catch (error) {
    deactivate();
    status.textContent = 'The 3D view is unavailable in this browser.';
    status.hidden = false;
    console.warn('Rutt Etra portrait unavailable.', error);
    ready = undefined;
  } finally {
    trigger.removeAttribute('aria-busy');
    trigger.disabled = false;
  }
});
mosh.addEventListener('click', () => { selection++; deactivate(); });
reset.addEventListener('click', () => { selection++; deactivate(); resetView(); status.hidden = true; });
new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting;
  if (visible) invalidate();
  else { cancelAnimationFrame(request); request = 0; }
}, { threshold: 0.05 }).observe(frame);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(request); request = 0; }
  else invalidate();
});
