// Noisemaker supplies the scanline displacement; the backing bitmap keeps edits.
const VENDOR = new URL('./assets/vendor/noisemaker', import.meta.url).href;
const frame = document.querySelector('#portrait-frame');
const reset = document.querySelector('#portrait-reset');
const canvas = frame.querySelector('.portrait-mosh');
const photo = frame.querySelector('.portrait-front');
const output = canvas.getContext('2d');
const working = document.createElement('canvas');
const pixels = working.getContext('2d');
const source = document.createElement('canvas');
const sourceContext = source.getContext('2d');
const effectCanvas = document.createElement('canvas');
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const RADIUS = 0.10;
const PROGRAM = `
search synth, filter, mixer
media().write(o0)
read(o0)
  .corrupt(intensity: 8, shift: 5, sort: 0, melt: 0, channelShift: 0, scatter: 0, bits: 0, bandHeight: 28, speed: 1)
  .shapeMask(tex: read(o0), shape: square, radius: 1, edgeSmooth: 0.003)
  .write(o1)
render(o1)
`;

let renderer;
let initPromise;
let steps;
let media;
let failed = false;
let visible = false;
let request = 0;
let lastFrame = 0;
let time = 0;
let pointer;
let previousPoint;
let seed = 1;
let damaged = false;
const pending = [];

function stop() {
  cancelAnimationFrame(request);
  request = 0;
}

function restorePhoto(error) {
  if (failed) return;
  failed = true;
  stop();
  pending.length = 0;
  canvas.hidden = true;
  frame.dataset.mosh = 'unavailable';
  frame.disabled = true;
  frame.setAttribute('aria-label', 'Eric Seo portrait');
  Promise.resolve(renderer?.dispose()).catch(() => {});
  console.warn('Portrait effect unavailable; keeping the photograph.', error);
}

function drawOriginal() {
  const bounds = frame.getBoundingClientRect();
  const density = working.width / bounds.width;
  pixels.fillStyle = getComputedStyle(document.body).backgroundColor;
  pixels.fillRect(0, 0, working.width, working.height);
  frame.querySelectorAll('.portrait').forEach((image) => {
    const box = image.getBoundingClientRect();
    pixels.globalAlpha = Number(getComputedStyle(image).opacity);
    pixels.drawImage(photo, (box.x - bounds.x) * density,
      (box.y - bounds.y) * density, box.width * density, box.height * density);
  });
  pixels.globalAlpha = 1;
}

function resizePortrait() {
  const bounds = frame.getBoundingClientRect();
  const density = Math.min(window.devicePixelRatio || 1, 1.5, 480 / bounds.width);
  const width = Math.round(bounds.width * density);
  const height = Math.round(bounds.height * density);
  if (!width || !height || (working.width === width && working.height === height)) return;
  // Resize the edited bitmap rather than reconstructing the pristine photo.
  source.width = working.width;
  source.height = working.height;
  sourceContext.drawImage(working, 0, 0);
  working.width = canvas.width = effectCanvas.width = width;
  working.height = canvas.height = effectCanvas.height = height;
  if (damaged) pixels.drawImage(source, 0, 0, width, height);
  else drawOriginal();
  source.width = width;
  source.height = height;
  renderer.resize(width, height);
  renderer.applyStepParameterValues({ [`step_${media.stepIndex}`]: { imageSize: [width, height] } });
  uploadPixels();
  showWorking();
}

function uploadPixels() {
  renderer.updateTextureFromSource(media.textureId, working, { flipY: false });
}

function showWorking() {
  output.drawImage(working, 0, 0);
  canvas.hidden = false;
}

function liveFrame() {
  renderer.applyStepParameterValues({
    [steps.corrupt]: { intensity: 8, shift: 5, sort: 0, bandHeight: 28, speed: 1, seed },
    [steps.mask]: { radius: 1, posX: 0, posY: 0 }
  });
  renderer.render(time);
  if (!failed) output.drawImage(effectCanvas, 0, 0);
}

function dragPixels(from, to) {
  const width = working.width;
  const height = working.height;
  const radius = RADIUS * height / 2;
  const dx = (to[0] - from[0]) * width;
  const dy = (to[1] - from[1]) * height;
  // Move existing image pixels with the pointer, including previous damage.
  // No fresh portrait or generated noise is painted over a stroke.
  if (dx || dy) {
    sourceContext.clearRect(0, 0, width, height);
    sourceContext.drawImage(working, 0, 0);
    pixels.save();
    pixels.beginPath();
    pixels.rect(to[0] * width - radius, to[1] * height - radius, radius * 2, radius * 2);
    pixels.clip();
    pixels.drawImage(source, dx, dy);
    pixels.restore();
  }
  uploadPixels();
  renderer.applyStepParameterValues({
    [steps.corrupt]: { intensity: 100, shift: 32, sort: 35, bandHeight: 26, speed: 0, seed },
    [steps.mask]: { posX: to[0] * 2 - 1, posY: to[1] * 2 - 1, radius: RADIUS }
  });
  renderer.render(time);
  if (failed) return;
  // Replace the backing bitmap with the native effect's output. Every next
  // stroke and every live frame reads this edited image, never a clean layer.
  pixels.drawImage(effectCanvas, 0, 0);
  damaged = true;
  frame.dataset.mosh = 'damaged';
  frame.dataset.hit = to.map((value) => value.toFixed(3)).join(',');
}

function processStroke() {
  // Bound GPU work and interpolate sparse pointer events for an unbroken trail.
  for (let count = 0; count < 3 && pending.length && !failed; count++) {
    const target = pending[0];
    if (target.start || !previousPoint) previousPoint = target.point;
    const dx = (target.point[0] - previousPoint[0]) * working.width;
    const dy = (target.point[1] - previousPoint[1]) * working.height;
    const distance = Math.hypot(dx, dy);
    const step = Math.max(3, RADIUS * working.height / 5);
    const fraction = distance > step ? step / distance : 1;
    const next = [previousPoint[0] + (target.point[0] - previousPoint[0]) * fraction,
      previousPoint[1] + (target.point[1] - previousPoint[1]) * fraction];
    dragPixels(previousPoint, next);
    previousPoint = next;
    target.start = false;
    if (fraction === 1) pending.shift();
  }
  uploadPixels();
  showWorking();
}

function tick(now) {
  request = 0;
  if (!visible || document.hidden || failed) return;
  if (now - lastFrame >= 1000 / 30 - 1) {
    time += Math.min((now - lastFrame) / 1000, 0.1) / 8;
    lastFrame = now;
    try {
      if (pending.length) processStroke();
      else if (!motion.matches && pointer === undefined) liveFrame();
    } catch (error) { restorePhoto(error); }
  }
  resume();
}

function resume() {
  if (!renderer || !media || failed || !visible || document.hidden || request) return;
  if (motion.matches && !pending.length) return;
  request = requestAnimationFrame(tick);
}

async function initialize() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const [{ CanvasRenderer }] = await Promise.all([import(`${VENDOR}/core.js`), photo.decode()]);
    renderer = new CanvasRenderer({
      canvas: effectCanvas, width: 480, height: 700, basePath: VENDOR,
      useBundles: true, bundlePath: `${VENDOR}/effects`, preferWebGPU: false,
      preserveDrawingBuffer: true, onError: restorePhoto,
      onContextLost: () => restorePhoto(new Error('Portrait graphics context lost.'))
    });
    await renderer.loadManifest();
    await renderer.loadEffects(['synth/media', 'filter/corrupt', 'mixer/shapeMask']);
    const pipeline = await renderer.compile(PROGRAM);
    const effectStep = (name) => pipeline.graph.passes.find(
      (pass) => pass.effectKey?.split(/[/.]/).at(-1) === name)?.stepIndex;
    steps = { corrupt: `step_${effectStep('corrupt')}`, mask: `step_${effectStep('shapeMask')}` };
    media = renderer.getMediaSteps()[0];
    if (!media || Object.values(steps).some((key) => key.includes('undefined'))) {
      throw new Error('Portrait effect steps could not be resolved.');
    }
    resizePortrait();
    new ResizeObserver(() => {
      if (!failed) {
        try { resizePortrait(); } catch (error) { restorePhoto(error); }
      }
    }).observe(frame);
    lastFrame = performance.now();
    resume();
  })().catch(restorePhoto);
  return initPromise;
}

function pointAt(event) {
  const bounds = frame.getBoundingClientRect();
  return [Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))];
}

frame.addEventListener('pointerdown', (event) => {
  if (failed || !event.isPrimary || event.button !== 0) return;
  pointer = event.pointerId;
  frame.setPointerCapture(pointer);
  frame.dataset.dragging = 'true';
  seed = seed % 99 + 1;
  pending.push({ point: pointAt(event), start: true });
  initialize().then(resume);
});
frame.addEventListener('pointermove', (event) => {
  if (event.pointerId !== pointer) return;
  const point = pointAt(event);
  const last = pending.at(-1)?.point || previousPoint;
  if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > 0.003) {
    pending.push({ point, start: false });
    resume();
  }
});
function endDrag(event) {
  if (event.pointerId !== pointer) return;
  pointer = undefined;
  delete frame.dataset.dragging;
  if (frame.hasPointerCapture(event.pointerId)) frame.releasePointerCapture(event.pointerId);
  resume();
}
frame.addEventListener('pointerup', endDrag);
frame.addEventListener('pointercancel', endDrag);
frame.addEventListener('lostpointercapture', endDrag);
frame.addEventListener('dragstart', (event) => event.preventDefault());
frame.addEventListener('click', (event) => {
  if (event.detail !== 0 || failed) return;
  seed = seed % 99 + 1;
  pending.push({ point: [0.5, 0.35], start: true });
  initialize().then(resume);
});
reset.addEventListener('click', () => {
  pending.length = 0;
  previousPoint = undefined;
  if (pointer !== undefined && frame.hasPointerCapture(pointer)) frame.releasePointerCapture(pointer);
  pointer = undefined;
  delete frame.dataset.dragging;
  damaged = false;
  frame.dataset.mosh = failed ? 'unavailable' : 'clean';
  delete frame.dataset.hit;
  if (media && !failed) {
    drawOriginal();
    uploadPixels();
    showWorking();
  }
});
new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting;
  if (visible) initialize().then(resume);
  else stop();
}, { threshold: 0.05 }).observe(frame);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
  else { lastFrame = performance.now(); resume(); }
});
motion.addEventListener('change', () => {
  stop();
  if (motion.matches && media && !failed) showWorking();
  resume();
});
