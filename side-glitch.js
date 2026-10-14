(() => {
  const shell = document.querySelector('.shell');
  const main = document.querySelector('main');
  const contact = document.querySelector('#contact');
  const bottomCanvas = document.querySelector('.glitch-bottom');
  const colors = ['#2685ff', '#21e6ef', '#fa397e', '#bd5cff',
    '#ff9347', '#e9e65c', '#68ed9d'];
  const edges = [...document.querySelectorAll('.glitch-edge')].map((canvas, index) => ({
    canvas, context: canvas.getContext('2d'), seed: index ? 6197 : 2833, index
  }));
  let resizeRequest = 0;
  let lastLayout;

  function random(seed) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function build(edge, width, height) {
    const density = Math.min(window.devicePixelRatio || 1, 1.5);
    const { canvas, context } = edge;
    canvas.style.width = `${width}px`;
    canvas.width = Math.max(1, Math.round(width * density));
    canvas.height = Math.round(height * density);
    canvas.hidden = width < 1;
    if (canvas.hidden) return;
    context.scale(density, density);
    context.imageSmoothingEnabled = false;
    const rng = random(edge.seed);
    const fragment = (x, y, w, h, color, opacity) => {
      const right = Math.min(width, x + w);
      const bottom = Math.min(height, y + h);
      x = Math.max(0, x);
      y = Math.max(0, y);
      w = right - x;
      h = bottom - y;
      if (w <= 0 || h <= 0) return;
      context.fillStyle = color;
      context.globalAlpha = opacity;
      context.fillRect(edge.index ? width - x - w : x, y, w, h);
    };
    const pickColor = () => colors[Math.floor(rng() * colors.length)];
    // Independent, uneven pockets advance and retreat inside the same edge bounds.
    const pockets = [];
    for (let y = -180; y < height + 400; y += 140 + rng() * 260) {
      pockets.push({ y, radius: 65 + rng() * 180, strength: 0.25 + rng() * 0.75 });
    }
    for (let y = 24 + rng() * 35; y < height; y += 12 + Math.pow(rng(), 1.6) * 100) {
      const progress = y / height;
      const pocket = Math.max(0, ...pockets.map(p =>
        p.strength * Math.pow(Math.max(0, 1 - Math.abs(y - p.y) / p.radius), 0.7)));
      const lowerEdge = Math.max(0, (progress - 0.68) / 0.32);
      const lowerPocket = pocket + 0.16 * lowerEdge * (1 - pocket);
      if (rng() > 0.3 + 0.7 * pocket + 0.14 * lowerEdge) continue;
      const intensity = Math.min(1, 0.15 + progress * 0.35 + pocket * 0.6);
      const reach = Math.min(width, (6 + Math.max(0, width - 6) * Math.pow(progress, 0.85))
        * (0.12 + lowerPocket * 0.88));
      const length = Math.max(1, Math.floor(reach * (0.5 + rng() * 0.5)));
      const blockHeight = Math.floor(5 + rng() * (12 + 30 * intensity));
      const baseColor = pickColor();
      const splitColor = pickColor();
      const opacity = 0.22 + rng() * 0.2 + 0.4 * intensity;
      const top = Math.round(y);

      for (let row = 0; row < blockHeight;) {
        const cellHeight = Math.min(blockHeight - row, 1 + Math.floor(rng() * (3 + 5 * intensity)));
        const rowEnd = Math.max(1, Math.floor(length * (0.45 + rng() * 0.55)));
        let x = Math.floor(rng() * Math.min(5, rowEnd));
        while (x < rowEnd) {
          const cellWidth = Math.min(rowEnd - x, 2 + Math.floor(rng() * (4 + 19 * intensity)));
          if (rng() > 0.28) {
            fragment(x, top + row, cellWidth, cellHeight,
              rng() > 0.6 ? pickColor() : baseColor, opacity * (0.4 + rng() * 0.6));
            // Offset color channels make the blocks look torn and misregistered.
            if (rng() > 0.45) {
              const shift = 1 + Math.floor(rng() * 4);
              fragment(x + shift, top + row + cellHeight, Math.min(cellWidth, reach - x - shift),
                1 + Math.floor(rng() * 2), splitColor, opacity * 0.75);
            }
            if (cellWidth > 5 && cellHeight > 2 && rng() > 0.45) {
              fragment(x + 1, top + row + 1, Math.max(1, cellWidth - 3), 1, '#171717', 0.9);
            }
          }
          x += cellWidth + 1 + Math.floor(rng() * 3);
        }
        row += cellHeight + Math.floor(rng() * 3);
      }

      // Scattered pixel noise and occasional shifted slices break up the grid.
      for (let pixel = 0; pixel < 4 + Math.floor(18 * intensity); pixel++) {
        const x = Math.floor(rng() * reach);
        const size = 1 + Math.floor(rng() * 3);
        fragment(x, top + Math.floor(rng() * blockHeight), Math.min(size, reach - x),
          size, pickColor(), opacity * (0.45 + rng() * 0.5));
      }
      if (rng() < 0.3 + 0.4 * intensity) {
        const x = Math.floor(rng() * length * 0.3);
        fragment(x, top + Math.floor(rng() * blockHeight), length - x, 1,
          pickColor(), opacity);
      }
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
    const bounds = shell.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const mainBounds = main.getBoundingClientRect();
    const height = Math.ceil(Math.max(window.innerHeight, mainBounds.height));
    const gap = viewport <= 760 ? 12 : viewport <= 1000 ? 16 : 24;
    const widths = [bounds.left - gap, viewport - bounds.right - gap]
      .map(width => Math.max(0, Math.min(180, Math.floor(width))));
    const contactBottom = Math.max(...[...contact.children].map(element =>
      element.getBoundingClientRect().bottom - mainBounds.top));
    const bottomHeight = Math.max(0, Math.min(viewport <= 760 ? 64 : 80,
      Math.floor(height - contactBottom - 28)));
    const layout = [viewport, widths[0], widths[1], height, bottomHeight, window.devicePixelRatio].join(':');
    if (layout === lastLayout) return;
    lastLayout = layout;
    edges.forEach((edge, index) => build(edge, widths[index], height));
    buildBottom(viewport, bottomHeight);
  }

  function scheduleResize() {
    if (!resizeRequest) resizeRequest = requestAnimationFrame(resize);
  }
  window.addEventListener('resize', scheduleResize);
  new ResizeObserver(scheduleResize).observe(main);
  resize();
})();
