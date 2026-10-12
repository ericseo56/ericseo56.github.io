// Native Noisemaker effects used by glitchin' out, rendered only on clicks.
const VENDOR = new URL('./assets/vendor/noisemaker', import.meta.url).href;
const frame = document.querySelector('#portrait-frame');
const reset = document.querySelector('#portrait-reset');
const canvas = frame.querySelector('.portrait-mosh');
const photo = frame.querySelector('.portrait-front');
const output = canvas.getContext('2d');
const source = document.createElement('canvas');
const sourceContext = source.getContext('2d');
const effectCanvas = document.createElement('canvas');
const RADIUS = 0.13;
const PROGRAM = `
search synth, filter, mixer
media().write(o0)
read(o0)
  .corrupt(intensity: 100, shift: 85, sort: 70, melt: 80, channelShift: 65, scatter: 20, bits: 15, bandHeight: 4, speed: 0)
  .feedback(mix: 55, scaleAmt: 125, rotation: 8, aberration: 40, distortion: 50, blendMode: mix)
  .shapeMask(tex: read(o0), radius: 0.13, edgeSmooth: 0.002, posX: 0, posY: 0)
  .write(o1)
render(o1)
`;

let renderer;
let initPromise;
let steps;
let media;
let failed = false;
let revision = 0;
let seed = 1;

function restorePhoto(error) {
  if (failed) return;
  failed = true;
  canvas.hidden = true;
  frame.dataset.mosh = 'unavailable';
  frame.disabled = true;
  frame.setAttribute('aria-label', 'Eric Seo portrait');
  Promise.resolve(renderer?.dispose()).catch(() => {});
  console.warn('Portrait effect unavailable; keeping the photograph.', error);
}

function uploadPortrait() {
  const bounds = frame.getBoundingClientRect();
  const density = Math.min(window.devicePixelRatio || 1, 1.5, 480 / bounds.width);
  const width = Math.round(bounds.width * density);
  const height = Math.round(bounds.height * density);
  if (!width || !height) return false;

  // Keep existing damage when the responsive portrait changes size.
  if (canvas.width !== width || canvas.height !== height) {
    const previous = document.createElement('canvas');
    previous.width = canvas.width;
    previous.height = canvas.height;
    previous.getContext('2d').drawImage(canvas, 0, 0);
    canvas.width = width;
    canvas.height = height;
    output.drawImage(previous, 0, 0, width, height);
  }
  source.width = width;
  source.height = height;
  sourceContext.fillStyle = getComputedStyle(document.body).backgroundColor;
  sourceContext.fillRect(0, 0, width, height);
  frame.querySelectorAll('.portrait').forEach((image) => {
    const box = image.getBoundingClientRect();
    sourceContext.globalAlpha = Number(getComputedStyle(image).opacity);
    sourceContext.drawImage(photo, (box.x - bounds.x) * density,
      (box.y - bounds.y) * density, box.width * density, box.height * density);
  });
  sourceContext.globalAlpha = 1;
  sourceContext.drawImage(canvas, 0, 0);

  if (effectCanvas.width !== width || effectCanvas.height !== height) {
    effectCanvas.width = width;
    effectCanvas.height = height;
    renderer.resize(width, height);
  }
  renderer.updateTextureFromSource(media.textureId, source, { flipY: false });
  renderer.applyStepParameterValues({ [`step_${media.stepIndex}`]: { imageSize: [width, height] } });
  return true;
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
    await renderer.loadEffects(['synth/media', 'filter/corrupt', 'filter/feedback', 'mixer/shapeMask']);
    const pipeline = await renderer.compile(PROGRAM);
    const effectStep = (name) => pipeline.graph.passes.find(
      (pass) => pass.effectKey?.split(/[/.]/).at(-1) === name)?.stepIndex;
    steps = {
      corrupt: `step_${effectStep('corrupt')}`,
      feedback: `step_${effectStep('feedback')}`,
      mask: `step_${effectStep('shapeMask')}`
    };
    media = renderer.getMediaSteps()[0];
    if (!media || Object.values(steps).some((key) => key.includes('undefined'))) {
      throw new Error('Portrait effect steps could not be resolved.');
    }
  })().catch(restorePhoto);
  return initPromise;
}

function corrupt(point) {
  if (!uploadPortrait()) return;
  seed = seed % 99 + 1;
  renderer.applyStepParameterValues({
    [steps.corrupt]: { seed },
    [steps.mask]: { posX: point[0] * 2 - 1, posY: point[1] * 2 - 1 },
    [steps.feedback]: { resetState: true }
  });
  // Bake a few feedback passes into a still patch; no idle animation loop.
  for (let pass = 0; pass < 3; pass++) {
    renderer.render(seed + pass / 30);
    if (failed) return;
    renderer.applyStepParameterValues({ [steps.feedback]: { resetState: false } });
  }

  output.save();
  output.beginPath();
  output.arc(point[0] * canvas.width, point[1] * canvas.height,
    RADIUS * canvas.height / 2, 0, Math.PI * 2);
  output.clip();
  output.drawImage(effectCanvas, 0, 0);
  output.restore();
  canvas.hidden = false;
  frame.dataset.mosh = 'damaged';
  frame.dataset.hit = point.map((value) => value.toFixed(3)).join(',');
}

frame.addEventListener('click', async (event) => {
  const bounds = frame.getBoundingClientRect();
  const point = event.detail === 0 ? [0.5, 0.35] : [
    Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
  ];
  const clickRevision = revision;
  await initialize();
  if (!failed && clickRevision === revision) corrupt(point);
});

reset.addEventListener('click', () => {
  revision++;
  output.clearRect(0, 0, canvas.width, canvas.height);
  canvas.hidden = true;
  frame.dataset.mosh = failed ? 'unavailable' : 'clean';
  delete frame.dataset.hit;
});
