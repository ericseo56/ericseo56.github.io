(() => {
  const main = document.querySelector('main');
  const contact = document.querySelector('#contact');
  const bottomCanvas = document.querySelector('.glitch-bottom');
  const colors = ['#2685ff', '#21e6ef', '#fa397e', '#bd5cff',
    '#ff9347', '#e9e65c', '#68ed9d'];
  let resizeRequest = 0;
  let lastBottomLayout;

  function random(seed) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
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
