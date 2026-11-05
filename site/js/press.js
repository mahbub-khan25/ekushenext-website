// ekushenext.com/press: the language switch (shared with the other pages) and the current version.
const $$ = (s) => [...document.querySelectorAll(s)];
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};
const TITLES = location.pathname.startsWith('/privacy')
  ? { bn: 'গোপনীয়তা নীতি — একুশে নেক্সট | Privacy policy', en: 'Privacy policy — Ekushe Next' }
  : { bn: 'সংবাদমাধ্যমের জন্য — একুশে নেক্সট | Press', en: 'Press — Ekushe Next' };
function applyLang(lang) {
  document.documentElement.lang = lang;
  store.set('ekushe-lang', lang);
  $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  document.title = TITLES[lang];
}
$$('.lang button').forEach((b) => b.addEventListener('click', () => applyLang(b.dataset.lang)));
applyLang(store.get('ekushe-lang') === 'en' ? 'en' : 'bn');
// the newest version, from the same place the download buttons use
fetch('/api/latest').then((r) => r.json()).then((r) => {
  if (r && r.tag_name) $$('.press-ver').forEach((e) => { e.textContent = r.tag_name; });
}).catch(() => {});
