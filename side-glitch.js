(() => {
  const main = document.querySelector('main');
  const hero = document.querySelector('.hero');
  const topLayer = document.querySelector('.top-glitches');
  const topCanvas = document.querySelector('.glitch-top');
  const contact = document.querySelector('#contact');
  const bottomCanvas = document.querySelector('.glitch-bottom');
  const colors = ['#2685ff', '#21e6ef', '#fa397e', '#bd5cff',
    '#ff9347', '#e9e65c', '#68ed9d'];
  let resizeRequest = 0;
  let lastBottomLayout;
  let lastTopLayout;

  function random(seed) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function buildTop(width, height) {
    const density = Math.min(window.devicePixelRatio || 1, 1.5);
    const context = topCanvas.getContext('2d');
    topLayer.style.height = `${height}px`;
    topCanvas.style.width = `${width}px`;
    topCanvas.style.height = `${height}px`;
    topCanvas.width = Math.max(1, Math.round(width * density));
    topCanvas.height = Math.max(1, Math.round(height * density));
    context.scale(density, density);
    const rng = random(4357);
    const pickColor = () => colors[Math.floor(rng() * colors.length)];
    const cluster = (x, y, length, depth, opacity) => {
      const color = pickColor();
      for (let row = 0; row < depth; row += 2 + Math.floor(rng() * 5)) {
        const rowWidth = length * (0.3 + rng() * 0.7);
        for (let cell = 0; cell < rowWidth; cell += 3 + rng() * 14) {
          if (rng() < 0.3) continue;
          const w = Math.min(rowWidth - cell, 2 + rng() * 15);
          const h = Math.min(depth - row, 1 + Math.floor(rng() * 5));
          const left = x + cell;
          context.fillStyle = rng() < 0.55 ? color : pickColor();
          context.globalAlpha = opacity * (0.5 + rng() * 0.5);
          context.fillRect(Math.floor(left), Math.floor(y + row), w, h);
          if (w > 5 && h > 2 && rng() > 0.55) {
            context.fillStyle = '#171717';
            context.globalAlpha = 0.9;
            context.fillRect(Math.floor(left + 1), Math.floor(y + row + 1), w - 3, 1);
          }
        }
      }
    };
    // Top fragments live only in the empty space above the hero content.
    for (let x = -10; x < width; x += 70 + rng() * 220) {
      const length = Math.min(width - Math.max(0, x), 22 + rng() * 95);
      const depth = Math.min(height, 5 + Math.pow(rng(), 1.4) * Math.max(0, height - 5));
      cluster(Math.max(0, x), 0, length, depth, 0.3 + rng() * 0.4);
    }
    context.globalAlpha = 1;
  }

  function buildBottom(width, height) {
    const density = Math.min(window.devicePixelRatio || 1, 1.5);
    const context = bottomCanvas.getContext('2d');
    bottomCanvas.style.width = `${width}px`;
    bottomCanvas.style.height = `${height}px`;
    bottomCanvas.width = Math.max(1, Math.round(width * density));
    bottomCanvas.height = Math.max(1, Math.round(height * density));
    bottomCanvas.hidden = height < 1;
    if (bottomCanvas.hidden) return;
    context.scale(density, density);
    const rng = random(9271);
    const pickColor = () => colors[Math.floor(rng() * colors.length)];
    const fragment = (x, y, w, h, color, opacity) => {
      w = Math.min(w, width - x);
      h = Math.min(h, height - y);
      if (w <= 0 || h <= 0) return;
      context.fillStyle = color;
      context.globalAlpha = opacity;
      context.fillRect(x, height - y - h, w, h);
    };
    // Unequal islands rise from the bottom, with open gaps instead of a solid frame.
    for (let x = -12; x < width; x += 28 + rng() * 100) {
      const length = 18 + rng() * 90;
      const depth = 8 + Math.pow(rng(), 1.8) * (height - 8);
      const color = pickColor();
      for (let y = 0; y < depth; y += 3 + Math.floor(rng() * 6)) {
        const rowWidth = length * (0.2 + 0.8 * (1 - y / depth));
        const offset = rng() * (length - rowWidth);
        for (let cell = 0; cell < rowWidth; cell += 4 + rng() * 16) {
          if (rng() < 0.32) continue;
          const left = Math.max(0, Math.floor(x + offset + cell));
          const w = Math.min(rowWidth - cell, 2 + rng() * 14);
          const h = Math.min(depth - y, 1 + Math.floor(rng() * 5));
          fragment(left, y, w, h, rng() < 0.5 ? color : pickColor(), 0.25 + rng() * 0.5);
          if (rng() > 0.6) fragment(left + 2, y + h, w * 0.7, 1, pickColor(), 0.6);
        }
      }
    }
    context.globalAlpha = 1;
  }

  function resize() {
    resizeRequest = 0;
    const viewport = document.documentElement.clientWidth;
    const mainBounds = main.getBoundingClientRect();
    const topDepth = Math.max(0, Math.min(48, parseFloat(getComputedStyle(hero).paddingTop) - 20));
    const topLayout = [viewport, topDepth, window.devicePixelRatio].join(':');
    if (topLayout !== lastTopLayout) {
      lastTopLayout = topLayout;
      buildTop(viewport, topDepth);
    }
    const height = Math.ceil(Math.max(window.innerHeight, mainBounds.height));
    const contactBottom = Math.max(...[...contact.children].map(element =>
      element.getBoundingClientRect().bottom - mainBounds.top));
    const bottomHeight = Math.max(0, Math.min(viewport <= 760 ? 64 : 80,
      Math.floor(height - contactBottom - 28)));
    const bottomLayout = [viewport, bottomHeight, window.devicePixelRatio].join(':');
    if (bottomLayout !== lastBottomLayout) {
      lastBottomLayout = bottomLayout;
      buildBottom(viewport, bottomHeight);
    }
  }

  function scheduleResize() {
    if (!resizeRequest) resizeRequest = requestAnimationFrame(resize);
  }
  window.addEventListener('resize', scheduleResize);
  new ResizeObserver(scheduleResize).observe(main);
  resize();
})();
