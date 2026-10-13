// Noisemaker corrupts the whole portrait; small patches animate the idle edges.
const VENDOR = new URL('./assets/vendor/noisemaker', import.meta.url).href;
const frame = document.querySelector('#portrait-frame');
const trigger = document.querySelector('#portrait-trigger');
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
frameCheck.width = 4;
frameCheck.height = 1;
const checkPixels = frameCheck.getContext('2d', { willReadFrequently: true });
const bandFallback = document.createElement('canvas');
const bandPixels = bandFallback.getContext('2d');
const outline = document.createElement('canvas');
const outlinePixels = outline.getContext('2d', { willReadFrequently: true });
const original = document.createElement('canvas');
const originalPixels = original.getContext('2d');
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const BRUSH = 48;
const PATCH = 96;
const BORDER = (PATCH - BRUSH) / 2;
const BURST_FRAMES = 20;
const BURST_INTERVAL = 1000 / 24;
bandFallback.width = bandFallback.height = BRUSH;
source.width = source.height = effectCanvas.width = effectCanvas.height = PATCH;
const PROGRAM = `
search synth, filter
media()
  .corrupt(intensity: 8, shift: 5, sort: 0, melt: 0, channelShift: 0, scatter: 0, bits: 0, bandHeight: 28, speed: 1)
  .feedback(mix: 0, scaleAmt: 100, rotation: 0, aberration: 0, distortion: 0, blendMode: mix)
  .write(o0)
render(o0)
`;

let renderer;
let initPromise;
let corruptStep;
let feedbackStep;
let media;
let gpuFailed = false;
let portraitReady = false;
let damaged = false;
let visible = false;
let request = 0;
let lastFrame = 0;
let seed = 1;
let clickCount = 0;
let passCount = 0;
let burstRequest = 0;
let burstRemaining = 0;
let burstLastFrame = 0;
let mode;
let historyKey;
let feedbackReset;
let frameBudget = 1000 / 24;
let statsStart = 0;
let statsFrames = 0;
let statsCost = 0;
let patchTime = 0;
let paperColor = '#171717';
let portraitScale = 1;
let introEndsAt = 0;
let introSlots = [];
let introIndex = 0;

function stop() {
  cancelAnimationFrame(request);
  cancelAnimationFrame(burstRequest);
  request = 0;
  burstRequest = burstRemaining = 0;
  frame.dataset.burst = 'idle';
}

function fallback(error) {
  if (gpuFailed) return;
  gpuFailed = true;
  mode = undefined;
  if (portraitReady) showWorking();
  // Keep the controls usable even if the graphics driver fails.
  frame.dataset.renderer = '2d';
  Promise.resolve(renderer?.dispose()).catch(() => {});
  console.warn('Portrait shader unavailable; keeping pixel movement usable.', error);
}

function drawLayers(context, width) {
  const bounds = frame.getBoundingClientRect();
  const density = width / bounds.width;
  frame.querySelectorAll('.portrait').forEach((image) => {
    const box = image.getBoundingClientRect();
    context.globalAlpha = Number(getComputedStyle(image).opacity);
    context.drawImage(photo, (box.x - bounds.x) * density,
      (box.y - bounds.y) * density, box.width * density, box.height * density);
  });
  context.globalAlpha = 1;
}

function drawOriginal() {
  paperColor = getComputedStyle(document.body).backgroundColor;
  original.width = working.width;
  original.height = working.height;
  originalPixels.fillStyle = paperColor;
  originalPixels.fillRect(0, 0, original.width, original.height);
  drawLayers(originalPixels, original.width);
  pixels.drawImage(original, 0, 0);
}

function prepareIntroEdges() {
  // Scan a tiny transparent mask once, not the full photograph every frame.
  outline.width = 80;
  outline.height = Math.round(working.height / working.width * outline.width);
  drawLayers(outlinePixels, outline.width);
  const alpha = outlinePixels.getImageData(0, 0, outline.width, outline.height).data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < outline.width && y < outline.height
    && alpha[(y * outline.width + x) * 4 + 3] > 10;
  const edges = [];
  for (let y = 1; y < outline.height; y += 2) {
    for (let x = 1; x < outline.width; x += 2) {
      if (!solid(x, y)) continue;
      if (!solid(x - 2, y) || !solid(x + 2, y)
        || !solid(x, y - 2) || !solid(x, y + 2)) edges.push([x / outline.width, y / outline.height]);
    }
  }
  edges.sort((a, b) => Math.atan2(a[1] - 0.5, a[0] - 0.5) - Math.atan2(b[1] - 0.5, b[0] - 0.5));
  const fallbackEdges = [[0.28, 0.28], [0.67, 0.16], [0.07, 0.76], [0.78, 0.77]];
  introSlots = fallbackEdges.map((fallbackPoint, index) => {
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = BRUSH;
    return { canvas: sprite, context: sprite.getContext('2d'), ready: false,
      point: edges.length ? edges[Math.floor((index + 0.5) * edges.length / 4)] : fallbackPoint };
  });
  introIndex = 0;
}

function resizePortrait() {
  const bounds = frame.getBoundingClientRect();
  // Render the photograph at 2x resolution; the shader patch stays 96x96.
  const density = Math.min(2, 640 / bounds.width);
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
  portraitScale = width / bounds.width;
  drawOriginal();
  if (damaged) pixels.drawImage(previous, 0, 0, width, height);
  portraitReady = true;
  prepareIntroEdges();
  showWorking();
}

function showWorking() {
  output.drawImage(working, 0, 0);
  canvas.hidden = frame.dataset.view === 'ruttetra';
}

function brushOrigin(point, strong) {
  const size = BRUSH * portraitScale;
  const x = point[0] * working.width - size / 2;
  const y = point[1] * working.height - size / 2;
  return strong ? [Math.round(x), Math.round(y), size] : [x, y, size];
}

function renderPatch(point, strong, opening = false) {
  const [x, y] = brushOrigin(point, strong);
  const fullWidth = Math.min(working.width, 480);
  const width = strong ? fullWidth + 4 : PATCH;
  const height = strong ? Math.round(working.height * fullWidth / working.width) + 4 : PATCH;
  if (source.width !== width || source.height !== height) {
    source.width = width;
    source.height = height;
    mode = historyKey = feedbackReset = undefined;
  }
  // The border is a known nonblack scanline for validating GPU output. It is
  // excluded when copying the patch back, so it never appears on the portrait.
  sourceContext.fillStyle = paperColor;
  sourceContext.fillRect(0, 0, width, height);
  sourceContext.save();
  sourceContext.beginPath();
  sourceContext.rect(2, 2, width - 4, height - 4);
  sourceContext.clip();
  if (strong) {
    // Each pass consumes only the accumulated damage. Reset is the only way
    // to bring original portrait detail back into the bitmap.
    sourceContext.drawImage(working, 2, 2, width - 4, height - 4);
  }
  else sourceContext.drawImage(working, BORDER - x / portraitScale, BORDER - y / portraitScale,
    working.width / portraitScale, working.height / portraitScale);
  sourceContext.restore();
  if (gpuFailed || !media) return source;
  if (effectCanvas.width !== width || effectCanvas.height !== height) {
    effectCanvas.width = width;
    effectCanvas.height = height;
    renderer.resize(width, height);
    mode = historyKey = feedbackReset = undefined;
  }

  const nextMode = `${strong ? 'single' : opening ? 'opening' : 'live'}:${seed}`;
  if (mode !== nextMode) {
    // The first few clicks are gentle; later clicks increasingly destroy
    // structure, with no original-image blend to undo previous passes.
    const decay = Math.min(1, Math.max(0, (clickCount - 3) / 22));
    renderer.applyStepParameterValues({
      [corruptStep]: strong
        ? { intensity: 28 + 62 * decay, shift: 12 + 73 * decay, sort: 14 * decay,
          melt: 0, channelShift: 0, scatter: 8 * decay,
          bits: 0, bandHeight: 18 - 10 * decay, speed: 1, seed }
        : opening
          ? { intensity: 55, shift: 65, sort: 25, melt: 0, channelShift: 0, scatter: 0, bits: 0, bandHeight: 7, speed: 2, seed }
          : { intensity: 8, shift: 5, sort: 0, melt: 0, channelShift: 0, scatter: 0, bits: 0, bandHeight: 28, speed: 1, seed },
      [feedbackStep]: strong
        ? { mix: 20 + 25 * decay, blendMode: 10, scaleAmt: 100,
          rotation: 0, aberration: 0, distortion: 0 }
        : { mix: 0 },
      [`step_${media.stepIndex}`]: { imageSize: [width, height] }
    });
    mode = nextMode;
  }
  // Preserve feedback between clicks so trails inherit the previous damage.
  // Resize, initialization and Reset invalidate history separately.
  const nextHistory = strong ? 'full' : `${nextMode}:${x}:${y}`;
  const resetHistory = nextHistory !== historyKey;
  if (feedbackReset !== resetHistory) {
    renderer.applyStepParameterValues({ [feedbackStep]: { resetState: resetHistory } });
    feedbackReset = resetHistory;
  }
  historyKey = nextHistory;
  // Upload after parameter updates, which can recreate engine textures.
  const uploaded = renderer.updateTextureFromSource(media.textureId, source, { flipY: false });
  if (uploaded.width !== width || uploaded.height !== height) {
    fallback(new Error('Portrait patch texture did not upload.'));
    return source;
  }
  renderer.render(patchTime);
  if (gpuFailed) return source;
  checkPixels.clearRect(0, 0, 4, 1);
  checkPixels.drawImage(effectCanvas, 0, 0, width, 1, 0, 0, 4, 1);
  const sample = checkPixels.getImageData(0, 0, 4, 1).data;
  let light = 0;
  let alpha = 0;
  for (let i = 0; i < sample.length; i += 4) {
    light += sample[i] + sample[i + 1] + sample[i + 2];
    alpha += sample[i + 3];
  }
  if (light < 48 || alpha < 128) {
    fallback(new Error('Portrait shader returned an empty patch.'));
    return source;
  }
  return effectCanvas;
}

function tearBands(patch) {
  // A driver failure keeps the same interaction using displaced image strips.
  for (let row = 0; row < BRUSH; row += 4) {
    const dx = Math.round(Math.sin(patchTime * 70 + row * 1.7) * 14);
    const dy = Math.round(Math.cos(patchTime * 50 + row * 0.4) * 5);
    bandPixels.drawImage(patch, BORDER + dx, BORDER + row + dy, BRUSH, 4, 0, row, BRUSH, 4);
  }
  return bandFallback;
}

function paintColorPixels() {
  const decay = Math.min(1, Math.max(0, (clickCount - 3) / 22));
  const size = Math.max(1, Math.round(portraitScale));
  const count = Math.ceil(working.width * working.height / (size * size) * (0.002 + 0.01 * decay) / 3);
  let state = Math.imul(passCount, 2654435761) >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  pixels.save();
  pixels.globalAlpha = 1;
  // Preserve the page's background brightness without restoring image detail.
  // Feedback stays aligned: moving corruption leaves trails without sampling
  // black outside the image or growing to white through a lighten blend.
  pixels.globalCompositeOperation = 'lighten';
  pixels.fillStyle = paperColor;
  pixels.fillRect(0, 0, working.width, working.height);
  pixels.globalCompositeOperation = 'source-over';
  for (const color of ['#ff0000', '#00ff00', '#0000ff']) {
    pixels.fillStyle = color;
    pixels.beginPath();
    for (let point = 0; point < count; point++) {
      const x = Math.floor(random() * Math.ceil(working.width / size)) * size;
      const y = Math.floor(random() * Math.ceil(working.height / size)) * size;
      pixels.rect(x, y, size, size);
    }
    pixels.fill();
  }
  pixels.restore();
}

function paintPoint(point, strong) {
  // Sample the current location in the edited bitmap on every render. Carrying
  // the previous brush image forward would repeat the first patch indefinitely.
  const patch = renderPatch(point, strong);
  const [x, y, size] = brushOrigin(point, strong);
  if (strong) {
    introSlots.forEach((slot) => { slot.ready = false; });
    pixels.imageSmoothingEnabled = true;
    if (gpuFailed || !media) {
      // Displace strips across the full image if GPU processing is unavailable.
      const width = source.width - 4;
      const height = source.height - 4;
      for (let row = 0; row < height; row += 8) {
        const band = Math.min(8, height - row);
        const decay = Math.min(1, Math.max(0, (clickCount - 3) / 22));
        const shift = Math.round(Math.sin(patchTime * 70 + row * 1.7) * width * (0.02 + 0.13 * decay));
        const offset = (shift + width) % width;
        const y = row / height * working.height;
        const h = band / height * working.height;
        pixels.drawImage(patch, 2 + offset, 2 + row, width - offset, band,
          0, y, (width - offset) / width * working.width, h);
        if (offset) pixels.drawImage(patch, 2, 2 + row, offset, band,
          (width - offset) / width * working.width, y, offset / width * working.width, h);
      }
    } else pixels.drawImage(patch, 2, 2, source.width - 4, source.height - 4,
      0, 0, working.width, working.height);
    // These edits enter the saved bitmap and move with every subsequent pass.
    paintColorPixels();
    damaged = true;
    frame.dataset.mosh = 'damaged';
    frame.dataset.hit = 'full';
    showWorking();
  } else {
    showWorking();
    output.save();
    output.beginPath();
    output.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    output.clip();
    output.drawImage(patch, BORDER, BORDER, BRUSH, BRUSH, x, y, size, size);
    output.restore();
  }
}

function introActive(now = performance.now()) {
  return introEndsAt > now && introSlots.length > 0 && !motion.matches;
}

function finishIntro(now) {
  if (!introEndsAt || now < introEndsAt) return;
  introEndsAt = 0;
  introSlots.forEach((slot) => { slot.ready = false; });
  showWorking();
  frame.dataset.intro = 'finished';
}

function paintIntro() {
  // Update one edge patch per frame, then reuse the other three cached patches.
  const slot = introSlots[introIndex++ % introSlots.length];
  const patch = renderPatch(slot.point, false, true);
  if (gpuFailed || !media) slot.context.drawImage(tearBands(patch), 0, 0);
  else slot.context.drawImage(patch, BORDER, BORDER, BRUSH, BRUSH, 0, 0, BRUSH, BRUSH);
  slot.ready = true;
  showWorking();
  for (const edge of introSlots) {
    if (!edge.ready) continue;
    const [x, y, size] = brushOrigin(edge.point, false);
    output.save();
    output.beginPath();
    output.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    output.clip();
    output.drawImage(edge.canvas, x, y, size, size);
    output.restore();
  }
}

function tick(now) {
  request = 0;
  if (!visible || document.hidden || !portraitReady || frame.dataset.view === 'ruttetra') return;
  finishIntro(now);
  const opening = introActive(now);
  if (!opening) return;
  const interval = frameBudget;
  if (now - lastFrame >= interval - 1) {
    patchTime += Math.min((now - lastFrame) / 1000, 0.15) / 8;
    lastFrame = now;
    const began = performance.now();
    try {
      paintIntro();
    } catch (error) { fallback(error); }
    const cost = performance.now() - began;
    // Back off on slower devices; only process one patch per animation frame.
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
  if (!portraitReady || !visible || document.hidden || request || frame.dataset.view === 'ruttetra') return;
  finishIntro(performance.now());
  if (!introActive()) return;
  request = requestAnimationFrame(tick);
}

async function initialize() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await photo.decode();
    resizePortrait();
    trigger.disabled = false;
    new ResizeObserver(resizePortrait).observe(frame);
    lastFrame = statsStart = performance.now();
    introEndsAt = lastFrame + 3000;
    frame.dataset.intro = motion.matches ? 'disabled' : 'playing';
    resume();
    try {
      const { CanvasRenderer } = await import(`${VENDOR}/core.js`);
      renderer = new CanvasRenderer({
        canvas: effectCanvas, width: PATCH, height: PATCH, basePath: VENDOR,
        useBundles: true, bundlePath: `${VENDOR}/effects`, preferWebGPU: false,
        preserveDrawingBuffer: true, onError: fallback,
        onContextLost: () => fallback(new Error('Portrait graphics context lost.'))
      });
      await renderer.loadManifest();
      await renderer.loadEffects(['synth/media', 'filter/corrupt', 'filter/feedback']);
      const pipeline = await renderer.compile(PROGRAM);
      const step = pipeline.graph.passes.find(
        (pass) => pass.effectKey?.split(/[/.]/).at(-1) === 'corrupt')?.stepIndex;
      const feedback = pipeline.graph.passes.find(
        (pass) => pass.effectKey?.split(/[/.]/).at(-1) === 'feedback')?.stepIndex;
      media = renderer.getMediaSteps()[0];
      if (!media || step === undefined || feedback === undefined) throw new Error('Portrait patch effect steps are unavailable.');
      corruptStep = `step_${step}`;
      feedbackStep = `step_${feedback}`;
      renderer.applyStepParameterValues({ [`step_${media.stepIndex}`]: { imageSize: [PATCH, PATCH] } });
      if (!gpuFailed) frame.dataset.renderer = 'noisemaker';
    } catch (error) { fallback(error); }
    lastFrame = statsStart = performance.now();
    finishIntro(lastFrame);
    resume();
  })().catch(fallback);
  return initPromise;
}

function renderBurstFrame() {
  seed = seed % 99 + 1;
  passCount++;
  patchTime += 0.1;
  try { paintPoint([0.5, 0.5], true); }
  catch (error) { fallback(error); }
  burstRemaining--;
  frame.dataset.burstFrames = String(BURST_FRAMES - burstRemaining);
  if (!burstRemaining) frame.dataset.burst = 'finished';
}

function tickBurst(now) {
  burstRequest = 0;
  if (!visible || document.hidden || frame.dataset.view === 'ruttetra') { stop(); return; }
  if (now - burstLastFrame >= BURST_INTERVAL) {
    burstLastFrame = now;
    renderBurstFrame();
  }
  if (burstRemaining) burstRequest = requestAnimationFrame(tickBurst);
}

trigger.addEventListener('click', () => {
  if (!portraitReady) return;
  stop();
  introEndsAt = 0;
  frame.dataset.intro = 'finished';
  clickCount++;
  frame.dataset.clicks = String(clickCount);
  burstRemaining = BURST_FRAMES;
  frame.dataset.burst = 'playing';
  burstLastFrame = performance.now();
  renderBurstFrame();
  // Reduced-motion users get the same 20 accumulated passes without animation.
  if (motion.matches) while (burstRemaining) renderBurstFrame();
  else burstRequest = requestAnimationFrame(tickBurst);
});
frame.addEventListener('dragstart', (event) => event.preventDefault());
frame.addEventListener('portraitviewchange', () => {
  if (frame.dataset.view === 'ruttetra') {
    stop();
    introEndsAt = 0;
    frame.dataset.intro = 'finished';
    canvas.hidden = true;
  } else if (portraitReady) showWorking();
});
reset.addEventListener('click', () => {
  stop();
  introEndsAt = 0;
  frame.dataset.intro = 'finished';
  introSlots.forEach((slot) => { slot.ready = false; });
  damaged = false;
  clickCount = 0;
  passCount = 0;
  seed = 1;
  patchTime = 0;
  mode = historyKey = feedbackReset = undefined;
  frame.dataset.clicks = '0';
  frame.dataset.burstFrames = '0';
  frame.dataset.mosh = 'clean';
  delete frame.dataset.hit;
  if (portraitReady) { drawOriginal(); showWorking(); }
  resume();
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
  if (motion.matches) {
    if (portraitReady) showWorking();
  }
  resume();
});
