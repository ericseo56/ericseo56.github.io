(() => {
  const shell = document.querySelector('.shell');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const colors = ['#1762dc', '#2279f5', '#259dff', '#15c5eb', '#2849b9',
    '#4743a7', '#704286', '#3a6344', '#52683d', '#683c38'];
  const edges = [...document.querySelectorAll('.glitch-edge')].map((canvas, index) => ({
    canvas, context: canvas.getContext('2d'), base: document.createElement('canvas'),
    seed: index ? 6197 : 2833, index
  }));
  let timer = 0;
  let resizeRequest = 0;
  let phase = 0;

  function random(seed) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function build(edge, width, height) {
    const density = Math.min(window.devicePixelRatio || 1, 1.5);
    const { canvas, base } = edge;
    canvas.style.width = `${width}px`;
    canvas.width = base.width = Math.max(1, Math.round(width * density));
    canvas.height = base.height = Math.round(height * density);
    canvas.hidden = width < 1;
    const context = base.getContext('2d');
    context.scale(density, density);
    const rng = random(edge.seed);
    // Hard-edged columns, rather than a glow or color gradient.
    const column = (x, y, w, h, color, alpha) => {
      context.fillStyle = color;
      context.globalAlpha = alpha;
      context.fillRect(edge.index ? width - x - w : x, y, w, h);
    };
    for (let x = 0; x < width; x += 2 + Math.floor(rng() * 4)) {
      const strength = 0.25 + 0.75 * (1 - x / Math.max(width, 1));
      const w = 1 + Math.floor(rng() * 7);
      // Dark green and violet trails underneath the brighter blue fragments.
      column(x, -30, w, height + 60, colors[4 + Math.floor(rng() * 6)], (0.12 + rng() * 0.18) * strength);
      const start = Math.floor(rng() * height * 0.34) - height * 0.12;
      const length = height * (0.2 + rng() * 0.65);
      const color = colors[Math.floor(rng() * 5)];
      column(x, start, w, length, color, (0.22 + rng() * 0.45) * strength);
      // Uneven overlapping fragments break up the vertical smears.
      for (let part = 0; part < 4; part++) {
        const y = start + rng() * length;
        column(x + Math.floor(rng() * 3), y, Math.max(1, w - 1),
          8 + rng() * height * 0.2, colors[Math.floor(rng() * 7)], (0.12 + rng() * 0.36) * strength);
      }
      if (rng() > 0.55) column(x, start, 1, 18 + rng() * 90, '#36d1ff', 0.75 * strength);
    }
    context.globalAlpha = 1;
    edge.context.imageSmoothingEnabled = false;
    edge.context.drawImage(base, 0, 0);
  }

  function paint(edge) {
    const { context, canvas, base } = edge;
    if (canvas.hidden) return;
    const rng = random(edge.seed + Math.floor(phase / 3) * 719);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(base, 0, 0);
    // Move just a few narrow columns. Most of the texture stays still.
    for (let part = 0; part < 3; part++) {
      const x = Math.floor(rng() * canvas.width);
      const w = Math.max(1, Math.floor(canvas.width * (0.04 + rng() * 0.09)));
      const shift = Math.round((rng() - 0.5) * canvas.height * 0.09);
      context.save();
      context.beginPath();
      context.rect(x, 0, w, canvas.height);
      context.clip();
      context.clearRect(x, 0, w, canvas.height);
      context.drawImage(base, 0, shift);
      context.drawImage(base, 0, shift > 0 ? shift - canvas.height : shift + canvas.height);
      context.restore();
    }
  }

  function stop() {
    clearTimeout(timer);
    timer = 0;
  }

  function animate() {
    stop();
    if (document.hidden || motion.matches) return;
    phase++;
    edges.forEach(paint);
    // Four inexpensive updates a second; no full-screen rendering loop.
    timer = setTimeout(animate, 250);
  }

  function resize() {
    resizeRequest = 0;
    stop();
    const bounds = shell.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const gap = viewport <= 760 ? 12 : viewport <= 1000 ? 16 : 24;
    // Derive the available margins from the actual content, so the artwork
    // always ends before the text, even at narrow responsive breakpoints.
    const widths = [bounds.left - gap, viewport - bounds.right - gap];
    edges.forEach((edge, index) => build(edge, Math.max(0, Math.min(180, Math.floor(widths[index]))), window.innerHeight));
    animate();
  }

  window.addEventListener('resize', () => {
    if (!resizeRequest) resizeRequest = requestAnimationFrame(resize);
  });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : animate());
  motion.addEventListener('change', () => {
    stop();
    edges.forEach(edge => {
      edge.context.clearRect(0, 0, edge.canvas.width, edge.canvas.height);
      edge.context.drawImage(edge.base, 0, 0);
    });
    animate();
  });
  resize();
})();
