(() => {
  const shell = document.querySelector('.shell');
  const main = document.querySelector('main');
  const colors = ['#2279f5', '#259dff', '#15c5eb', '#2849b9',
    '#4743a7', '#704286', '#3a6344'];
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
    const rng = random(edge.seed);
    const fragment = (x, y, w, h, color, opacity) => {
      context.fillStyle = color;
      context.globalAlpha = opacity;
      context.fillRect(edge.index ? width - x - w : x, y, w, h);
    };
    // Sparse horizontal fragments belong to the document, not the viewport.
    for (let y = 24 + rng() * 35; y < height; y += (22 + rng() * 38) * (1 - 0.65 * Math.pow(y / height, 1.7))) {
      const progress = y / height;
      const intensity = Math.pow(progress, 1.6);
      const reach = Math.min(width, 6 + Math.max(0, width - 6) * Math.pow(progress, 1.7));
      const length = Math.max(1, Math.floor(reach * (0.35 + rng() * 0.65)));
      const offset = Math.floor(rng() * Math.min(5, width - length));
      const thickness = rng() > 0.85 - 0.35 * intensity ? 2 : 1;
      let x = offset;
      const end = offset + length;
      while (x < end) {
        const w = Math.min(end - x, 2 + Math.floor(rng() * Math.max(3, length * 0.45)));
        const opacity = 0.07 + rng() * 0.13 + 0.45 * intensity;
        fragment(x, Math.round(y), w, thickness, colors[Math.floor(rng() * colors.length)], opacity);
        if (rng() > 0.65 - 0.35 * intensity) fragment(x + 1, Math.round(y) + 3, Math.max(1, w - 2), 1,
          colors[Math.floor(rng() * colors.length)], opacity * 0.45);
        x += w + 1 + Math.floor(rng() * 4);
      }
    }
    context.globalAlpha = 1;
  }

  function resize() {
    resizeRequest = 0;
    const bounds = shell.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const height = Math.ceil(Math.max(window.innerHeight, main.getBoundingClientRect().height));
    const gap = viewport <= 760 ? 12 : viewport <= 1000 ? 16 : 24;
    const widths = [bounds.left - gap, viewport - bounds.right - gap]
      .map(width => Math.max(0, Math.min(180, Math.floor(width))));
    const layout = [widths[0], widths[1], height, window.devicePixelRatio].join(':');
    if (layout === lastLayout) return;
    lastLayout = layout;
    edges.forEach((edge, index) => build(edge, widths[index], height));
  }

  function scheduleResize() {
    if (!resizeRequest) resizeRequest = requestAnimationFrame(resize);
  }
  window.addEventListener('resize', scheduleResize);
  new ResizeObserver(scheduleResize).observe(main);
  resize();
})();
