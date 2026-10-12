const portrait = document.querySelector('.portrait');
function showPortrait() {
  if (!portrait.naturalWidth) return;
  portrait.hidden = false;
  document.querySelector('.portrait-fallback').hidden = true;
}
portrait.addEventListener('load', showPortrait);
portrait.addEventListener('error', () => { portrait.hidden = true; });
if (portrait.complete) showPortrait();

document.querySelector('#year').textContent = new Date().getFullYear();
