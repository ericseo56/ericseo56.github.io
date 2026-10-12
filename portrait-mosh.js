// Existing Noisemaker effects used by glitchin' out; no custom glitch shaders.
const VENDOR = new URL('./assets/vendor/noisemaker', import.meta.url).href;
const frame = document.querySelector('#portrait-frame');
const canvas = frame.querySelector('.portrait-mosh');
const photo = frame.querySelector('.portrait-front');
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const source = document.createElement('canvas');
const sourceContext = source.getContext('2d');
const PROGRAM = `
search synth, filter, mixer
media().write(o0)
read(o0).corrupt(intensity: 7, shift: 4, sort: 0, melt: 3, channelShift: 2, speed: 1).write(o1)
read(o0)
  .corrupt(intensity: 65, shift: 32, sort: 10, melt: 32, channelShift: 20, bandHeight: 8, speed: 2)
  .feedback(mix: 65, scaleAmt: 101, rotation: 0.2, blendMode: mix)
  .shapeMask(tex: read(o1), radius: 0, edgeSmooth: 0.015, posX: 0, posY: 0)
  .write(o2)
render(o2)
`;

let renderer;
let initPromise;
let steps;
let media;
let visible = false;
let failed = false;
let request = 0;
let lastFrame = 0;
let time = 0;
let pulseStart = -Infinity;
let center = [0, 0];
let seed = 1;
let resetFeedback = true;
let queuedClick;
let fpsStart = 0;
let renderedFrames = 0;

function restorePhoto(error) {
  if (failed) return;
  failed = true;
  cancelAnimationFrame(request);
  request = 0;
  canvas.hidden = true;
  frame.dataset.mosh = 'unavailable';
  Promise.resolve(renderer?.dispose()).catch(() => {});
  frame.disabled = true;
  frame.setAttribute('aria-label', 'Eric Seo portrait');
  console.warn('Portrait effect unavailable; keeping the photograph.', error);
}

function uploadPortrait() {
  const bounds = frame.getBoundingClientRect();
  const density = Math.min(window.devicePixelRatio || 1, 1.5, 480 / bounds.width);
  const width = Math.round(bounds.width * density);
  const height = Math.round(bounds.height * density);
  if (!width || !height) return;
  source.width = width;
  source.height = height;
  sourceContext.fillStyle = getComputedStyle(document.body).backgroundColor;
  sourceContext.fillRect(0, 0, width, height);
  // Draw the approved four-copy composition once, and again only on resize.
  frame.querySelectorAll('.portrait').forEach((image) => {
    const box = image.getBoundingClientRect();
    sourceContext.globalAlpha = Number(getComputedStyle(image).opacity);
    sourceContext.drawImage(photo, (box.x - bounds.x) * density,
      (box.y - bounds.y) * density, box.width * density, box.height * density);
  });
  sourceContext.globalAlpha = 1;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    renderer.resize(width, height);
    resetFeedback = true;
  }
  renderer.updateTextureFromSource(media.textureId, source, { flipY: false });
  renderer.applyStepParameterValues({ [`step_${media.stepIndex}`]: { imageSize: [width, height] } });
}

function renderFrame(now, still = false) {
  const progress = Math.max(0, (now - pulseStart) / 1500);
  const pulse = still ? 1 : Math.max(0, 1 - progress);
  const strength = pulse * pulse;
  renderer.applyStepParameterValues({
    [steps.ambient]: { intensity: still ? 0 : 7, speed: still ? 0 : 1 },
    [steps.burst]: {
      intensity: 20 + 55 * strength, shift: 10 + 30 * strength,
      melt: 8 + 35 * strength, channelShift: 5 + 22 * strength,
      speed: still ? 0 : 2, seed
    },
    [steps.feedback]: { mix: 30 + 45 * strength, resetState: resetFeedback },
    [steps.mask]: { posX: center[0], posY: center[1], radius: pulse > 0 ? 0.30 * Math.sqrt(pulse) : 0 }
  });
  renderer.render(time);
  if (failed) return;
  resetFeedback = false;
  canvas.hidden = false;
  const state = pulse > 0 ? 'burst' : 'live';
  if (frame.dataset.mosh !== state) frame.dataset.mosh = state;
}

function tick(now) {
  if (!visible || document.hidden || motion.matches || failed) { request = 0; return; }
  request = requestAnimationFrame(tick);
  // Cap at 30 fps, without uploading the static portrait texture every frame.
  if (now - lastFrame < 1000 / 30 - 1) return;
  time += Math.min((now - lastFrame) / 1000, 0.1) / 8;
  lastFrame = now;
  renderFrame(now);
  renderedFrames++;
  if (now - fpsStart >= 1000) {
    canvas.dataset.fps = String(Math.round(renderedFrames * 1000 / (now - fpsStart)));
    fpsStart = now;
    renderedFrames = 0;
  }
}

function resume() {
  if (!renderer || failed || !visible || document.hidden || motion.matches || request) return;
  lastFrame = fpsStart = performance.now();
  renderedFrames = 0;
  renderer.syncTime(time);
  request = requestAnimationFrame(tick);
}

function pause() {
  cancelAnimationFrame(request);
  request = 0;
  if (renderer && !failed) frame.dataset.mosh = 'paused';
}

async function initialize() {
  if (failed) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const [{ CanvasRenderer }] = await Promise.all([import(`${VENDOR}/core.js`), photo.decode()]);
    renderer = new CanvasRenderer({
      canvas, width: 480, height: 700, basePath: VENDOR,
      useBundles: true, bundlePath: `${VENDOR}/effects`, preferWebGPU: false,
      onError: restorePhoto, onContextLost: pause,
      onContextRestored: () => {
        if (!media || failed) return;
        uploadPortrait();
        resetFeedback = true;
        if (!motion.matches && visible) renderFrame(performance.now());
        resume();
      }
    });
    await renderer.loadManifest();
    await renderer.loadEffects(['synth/media', 'filter/corrupt', 'filter/feedback', 'mixer/shapeMask']);
    const pipeline = await renderer.compile(PROGRAM);
    // Resolve step keys from the pinned engine's compiled graph, rather than
    // hard-coding indices that include read/write composition operations.
    const effectSteps = (name) => [...new Set(pipeline.graph.passes
      .filter((pass) => pass.effectKey?.split(/[/.]/).at(-1) === name)
      .map((pass) => pass.stepIndex))].sort((a, b) => a - b);
    const corrupt = effectSteps('corrupt');
    steps = {
      ambient: `step_${corrupt[0]}`, burst: `step_${corrupt[1]}`,
      feedback: `step_${effectSteps('feedback')[0]}`, mask: `step_${effectSteps('shapeMask')[0]}`
    };
    media = renderer.getMediaSteps()[0];
    if (!media || corrupt.length !== 2 || Object.values(steps).some((key) => key.includes('undefined'))) {
      throw new Error('Portrait effect steps could not be resolved.');
    }
    uploadPortrait();
    if (!motion.matches && visible && !document.hidden) renderFrame(performance.now());
    new ResizeObserver(() => {
      if (failed) return;
      uploadPortrait();
      if (!motion.matches && visible && !document.hidden) renderFrame(performance.now());
    }).observe(frame);
    if (queuedClick) { trigger(queuedClick); queuedClick = null; }
    resume();
  })().catch(restorePhoto);
  return initPromise;
}

function trigger(point) {
  center = [point[0] * 2 - 1, point[1] * 2 - 1];
  seed = seed % 99 + 1;
  pulseStart = performance.now();
  resetFeedback = true;
  frame.dataset.hit = point.map((value) => value.toFixed(3)).join(',');
  renderFrame(pulseStart, motion.matches);
  resume();
}

frame.addEventListener('click', async (event) => {
  const bounds = frame.getBoundingClientRect();
  const point = event.detail === 0 ? [0.5, 0.35] : [
    Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
  ];
  if (!steps) { queuedClick = point; await initialize(); }
  else if (!failed) trigger(point);
});

new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting;
  if (!visible) pause();
  else if (!motion.matches) initialize().then(resume);
}, { threshold: 0.05 }).observe(frame);

document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else resume(); });
motion.addEventListener('change', () => {
  if (motion.matches) { pause(); canvas.hidden = true; }
  else if (visible) initialize().then(resume);
});
