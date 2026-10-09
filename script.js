const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#nav-links');
const mobileViewport = window.matchMedia('(max-width: 760px)');

function closeMenu({ returnFocus = false } = {}) {
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.querySelector('.menu-label').textContent = 'Menu';
  navigation.hidden = mobileViewport.matches;
  if (returnFocus) menuToggle.focus();
}

menuToggle.hidden = false;
closeMenu();
mobileViewport.addEventListener('change', () => closeMenu());
menuToggle.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.querySelector('.menu-label').textContent = open ? 'Close' : 'Menu';
  navigation.hidden = !open;
});
navigation.addEventListener('click', (event) => {
  if (event.target.closest('a') && mobileViewport.matches) closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
    closeMenu({ returnFocus: true });
  }
});
document.addEventListener('click', (event) => {
  if (mobileViewport.matches && !event.target.closest('.site-header')) closeMenu();
});

const portrait = document.querySelector('.portrait');
function showPortrait() {
  if (!portrait.naturalWidth) return;
  portrait.hidden = false;
  document.querySelector('.portrait-fallback').hidden = true;
}
portrait.addEventListener('load', showPortrait);
portrait.addEventListener('error', () => { portrait.hidden = true; });
if (portrait.complete) showPortrait();

if ('IntersectionObserver' in window) {
  const sectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      navigation.querySelectorAll('[aria-current]').forEach((link) => link.removeAttribute('aria-current'));
      const link = navigation.querySelector(`a[href="#${entry.target.id}"]`);
      if (link) link.setAttribute('aria-current', 'location');
    }
  }, { rootMargin: '-15% 0px -65% 0px', threshold: 0 });
  document.querySelectorAll('main section[id]').forEach((section) => sectionObserver.observe(section));
}
document.querySelector('#year').textContent = new Date().getFullYear();
