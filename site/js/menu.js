// The menu button on phones and tablets: opens the section links as a panel under the top bar.
const nav = document.getElementById('nav');
const btn = document.getElementById('navMenu');
if (nav && btn) {
  const set = (open) => { nav.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); set(!nav.classList.contains('open')); });
  document.getElementById('navLinks')?.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('click', (e) => { if (!nav.contains(e.target)) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  matchMedia('(min-width: 981px)').addEventListener('change', (m) => { if (m.matches) set(false); });
}
