// Noisemaker processes a fixed-size patch; the portrait stays in a 2D bitmap.
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
const frameCheck = document.createElement('canvas');
frameCheck.width = frameCheck.height = 1;
const checkPixels = frameCheck.getContext('2d', { willReadFrequently: true });
const blockFallback = document.createElement('canvas');
const blockPixels = blockFallback.getContext('2d');
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const BRUSH = 48;
const BLOCK = 8;
const BORDER = BLOCK;
const PATCH = BRUSH + BORDER * 2;
blockFallback.width = blockFallback.height = BRUSH / BLOCK;
blockPixels.imageSmoothingEnabled = false;
source.width = source.height = effectCanvas.width = effectCanvas.height = PATCH;
const PROGRAM = `
search synth, filter
media()
  .corrupt(intensity: 8, shift: 5, sort: 0, melt: 0, channelShift: 0, scatter: 0, bits: 0, bandHeight: 28, speed: 1)
  .pixels(size: 1)
  .write(o0)
render(o0)
`;

let renderer;
let initPromise;
let corruptStep;
let pixelsStep;
let media;
let gpuFailed = false;
let portraitReady = false;
let damaged = false;
let visible = false;
let request = 0;
let lastFrame = 0;
let lastHoverMosh = 0;
let hoverPoint;
let pendingPoint;
let livePoint = [0.47, 0.35];
let seed = 1;
let mode;
let frameBudget = 1000 / 24;
let statsStart = 0;
let statsFrames = 0;
let statsCost = 0;
let patchTime = 0;
let paperColor = '#FAF7F0';

function stop() {
  cancelAnimationFrame(request);
  request = 0;
}

function fallback(error) {
  if (gpuFailed) return;
  gpuFailed = true;
  mode = undefined;
  if (portraitReady) showWorking();
  // Keep hover and Reset usable even if the graphics driver fails.
  frame.dataset.renderer = '2d';
  Promise.resolve(renderer?.dispose()).catch(() => {});
  console.warn('Portrait shader unavailable; keeping pixel movement usable.', error);
}

function drawOriginal() {
  const bounds = frame.getBoundingClientRect();
  const density = working.width / bounds.width;
  paperColor = getComputedStyle(document.body).backgroundColor;
  pixels.fillStyle = paperColor;
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
  // The effect is deliberately independent of device pixel ratio.
  const density = Math.min(1, 320 / bounds.width);
  const width = Math.round(bounds.width * density);
  const height = Math.round(bounds.height * density);
  if (!width || !height || (portraitReady && working.width === width && working.height === height)) return;
  const previous = document.createElement('canvas');
  if (damaged) {
    previous.width = working.width;
    previous.height = working.height;
    previous.getContext('2d').drawImage(working, 0, 0);
  }
  working.width = canvas.width = width;
  working.height = canvas.height = height;
  if (damaged) pixels.drawImage(previous, 0, 0, width, height);
  else drawOriginal();
  portraitReady = true;
  showWorking();
}

function showWorking() {
  output.drawImage(working, 0, 0);
  canvas.hidden = false;
}

function brushOrigin(point, strong) {
  const x = point[0] * working.width - BRUSH / 2;
  const y = point[1] * working.height - BRUSH / 2;
  return strong ? [Math.floor(x / BLOCK) * BLOCK, Math.floor(y / BLOCK) * BLOCK] : [x, y];
}

function renderPatch(point, strong) {
  const [x, y] = brushOrigin(point, strong);
  // The border is a known nonblack scanline for validating GPU output. It is
  // excluded when copying the patch back, so it never appears on the portrait.
  sourceContext.fillStyle = paperColor;
  sourceContext.fillRect(0, 0, PATCH, PATCH);
  sourceContext.save();
  sourceContext.beginPath();
  sourceContext.rect(BORDER, BORDER, BRUSH, BRUSH);
  sourceContext.clip();
  sourceContext.drawImage(working, BORDER - x, BORDER - y);
  sourceContext.restore();
  if (gpuFailed || !media) return source;

  const nextMode = `${strong ? 'hover' : 'live'}:${seed}`;
  if (mode !== nextMode) {
    renderer.applyStepParameterValues({
      [corruptStep]: strong
        ? { intensity: 100, shift: 40, sort: 50, bandHeight: 24, speed: 2, seed }
        : { intensity: 8, shift: 5, sort: 0, bandHeight: 28, speed: 1, seed },
      [pixelsStep]: { size: strong ? BLOCK : 1 }
    });
    mode = nextMode;
  }
  // Upload after parameter updates, which can recreate engine textures.
  const uploaded = renderer.updateTextureFromSource(media.textureId, source, { flipY: false });
  if (uploaded.width !== PATCH || uploaded.height !== PATCH) {
    fallback(new Error('Portrait patch texture did not upload.'));
    return source;
  }
  renderer.render(patchTime);
  if (gpuFailed) return source;
  checkPixels.drawImage(effectCanvas, 0, 0, 1, 1, 0, 0, 1, 1);
  const sample = checkPixels.getImageData(0, 0, 1, 1).data;
  if (sample[0] + sample[1] + sample[2] < 48 || sample[3] < 128) {
    fallback(new Error('Portrait shader returned an empty patch.'));
    return source;
  }
  return effectCanvas;
}

function paintPoint(point, strong) {
  // Sample the current location in the edited bitmap on every render. Carrying
  // the previous brush image forward would repeat the first patch indefinitely.
  const patch = renderPatch(point, strong);
  const [x, y] = brushOrigin(point, strong);
  if (strong) {
    pixels.imageSmoothingEnabled = false;
    if (gpuFailed || !media) {
      // Keep the block interaction usable when the GPU is unavailable.
      blockPixels.drawImage(patch, BORDER, BORDER, BRUSH, BRUSH, 0, 0, BRUSH / BLOCK, BRUSH / BLOCK);
      pixels.drawImage(blockFallback, x, y, BRUSH, BRUSH);
    } else pixels.drawImage(patch, BORDER, BORDER, BRUSH, BRUSH, x, y, BRUSH, BRUSH);
    pixels.imageSmoothingEnabled = true;
    damaged = true;
    livePoint = point;
    frame.dataset.mosh = 'damaged';
    frame.dataset.hit = point.map((value) => value.toFixed(3)).join(',');
    showWorking();
  } else {
    showWorking();
    output.drawImage(patch, BORDER, BORDER, BRUSH, BRUSH, x, y, BRUSH, BRUSH);
  }
}

function tick(now) {
  request = 0;
  if (!visible || document.hidden || !portraitReady) return;
  const interval = pendingPoint ? frameBudget
    : Math.max(frameBudget, hoverPoint ? 125 : 1000 / 12);
  if (now - lastFrame >= interval - 1) {
    patchTime += Math.min((now - lastFrame) / 1000, 0.15) / 8;
    lastFrame = now;
    const began = performance.now();
    try {
      if (pendingPoint) {
        const target = pendingPoint;
        pendingPoint = undefined;
        paintPoint(target.point, true);
        lastHoverMosh = now;
      } else if (hoverPoint && !motion.matches && now - lastHoverMosh >= 125) {
        paintPoint(hoverPoint, true);
        lastHoverMosh = now;
      } else if (!hoverPoint && !motion.matches && !gpuFailed) paintPoint(livePoint, false);
    } catch (error) { fallback(error); }
    const cost = performance.now() - began;
    // Back off on slower devices instead of building up delayed cursor work.
    frameBudget = Math.max(1000 / 24, Math.min(100, cost * 2));
    statsFrames++;
    statsCost += cost;
    if (now - statsStart >= 1000) {
      frame.dataset.renderMs = (statsCost / statsFrames).toFixed(1);
      frame.dataset.fps = String(Math.round(statsFrames * 1000 / (now - statsStart)));
      statsStart = now;
      statsCost = statsFrames = 0;
    }
  }
  resume();
}

function resume() {
  if (!portraitReady || !visible || document.hidden || request) return;
  if (!pendingPoint && (motion.matches || (gpuFailed && !hoverPoint))) return;
  request = requestAnimationFrame(tick);
}

async function initialize() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await photo.decode();
    resizePortrait();
    new ResizeObserver(resizePortrait).observe(frame);
    try {
      const { CanvasRenderer } = await import(`${VENDOR}/core.js`);
      renderer = new CanvasRenderer({
        canvas: effectCanvas, width: PATCH, height: PATCH, basePath: VENDOR,
        useBundles: true, bundlePath: `${VENDOR}/effects`, preferWebGPU: false,
        preserveDrawingBuffer: true, onError: fallback,
        onContextLost: () => fallback(new Error('Portrait graphics context lost.'))
      });
      await renderer.loadManifest();
      await renderer.loadEffects(['synth/media', 'filter/corrupt', 'filter/pixels']);
      const pipeline = await renderer.compile(PROGRAM);
      const step = pipeline.graph.passes.find(
        (pass) => pass.effectKey?.split(/[/.]/).at(-1) === 'corrupt')?.stepIndex;
      const blockStep = pipeline.graph.passes.find(
        (pass) => pass.effectKey?.split(/[/.]/).at(-1) === 'pixels')?.stepIndex;
      media = renderer.getMediaSteps()[0];
      if (!media || step === undefined || blockStep === undefined) throw new Error('Portrait patch effect steps are unavailable.');
      corruptStep = `step_${step}`;
      pixelsStep = `step_${blockStep}`;
      renderer.applyStepParameterValues({ [`step_${media.stepIndex}`]: { imageSize: [PATCH, PATCH] } });
      if (!gpuFailed) frame.dataset.renderer = 'noisemaker';
    } catch (error) { fallback(error); }
    lastFrame = statsStart = performance.now();
    resume();
  })().catch(fallback);
  return initPromise;
}

function pointAt(event) {
  const bounds = frame.getBoundingClientRect();
  return [Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))];
}

frame.addEventListener('pointerenter', (event) => {
  if (event.pointerType === 'touch') return;
  hoverPoint = pointAt(event);
  frame.dataset.hovering = 'true';
  seed = seed % 99 + 1;
  pendingPoint = { point: hoverPoint };
  initialize().then(resume);
});
frame.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch') return;
  hoverPoint = pointAt(event);
  // Replace the old target. The render loop always follows the latest cursor.
  pendingPoint = { point: hoverPoint };
  resume();
});
function endHover() {
  hoverPoint = pendingPoint = undefined;
  delete frame.dataset.hovering;
  resume();
}
frame.addEventListener('pointerleave', endHover);
frame.addEventListener('pointercancel', endHover);
frame.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'touch' || !event.isPrimary) return;
  seed = seed % 99 + 1;
  pendingPoint = { point: pointAt(event) };
  initialize().then(resume);
});
frame.addEventListener('dragstart', (event) => event.preventDefault());
frame.addEventListener('click', (event) => {
  if (event.detail !== 0) return;
  seed = seed % 99 + 1;
  pendingPoint = { point: [0.5, 0.35] };
  initialize().then(resume);
});
reset.addEventListener('click', () => {
  endHover();
  damaged = false;
  livePoint = [0.47, 0.35];
  frame.dataset.mosh = 'clean';
  delete frame.dataset.hit;
  if (portraitReady) { drawOriginal(); showWorking(); }
});
new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting;
  if (visible) initialize().then(resume);
  else { endHover(); stop(); }
}, { threshold: 0.05 }).observe(frame);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { endHover(); stop(); }
  else { lastFrame = performance.now(); resume(); }
});
motion.addEventListener('change', () => {
  stop();
  if (motion.matches && portraitReady) showWorking();
  resume();
});
