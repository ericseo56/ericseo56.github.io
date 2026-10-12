const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

document.querySelectorAll('.entry').forEach((entry) => {
  const heading = entry.querySelector('summary');
  let animation = null;
  let opening = entry.open;

  function finish() {
    entry.open = opening;
    entry.style.removeProperty('overflow');
    animation = null;
  }

  heading.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.target.closest('a, button, input')) return;
    if (reducedMotion.matches || !entry.animate) return;
    event.preventDefault();

    // Read the current height before cancelling, so rapid clicks reverse smoothly.
    const start = entry.getBoundingClientRect().height;
    opening = animation ? !opening : !entry.open;
    if (animation) {
      animation.onfinish = null;
      animation.cancel();
    }

    entry.open = true;
    const style = getComputedStyle(entry);
    const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const end = opening
      ? entry.getBoundingClientRect().height
      : heading.getBoundingClientRect().height + borders;

    entry.style.overflow = 'hidden';
    animation = entry.animate(
      { height: [`${start}px`, `${end}px`] },
      { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
    );
    animation.onfinish = finish;
  });

  reducedMotion.addEventListener('change', () => {
    if (!animation) return;
    animation.onfinish = null;
    animation.cancel();
    finish();
  });
});
