// The guide page (/guide/): language, platform filter, contents, copy buttons and the practice box.
import '/js/launch.js';
import '/js/menu.js';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

/* ───────── Language (shared with the home page) ───────── */
const TITLES = {
  bn: 'ব্যবহার নির্দেশিকা — একুশে নেক্সট | Ekushe Next Guide',
  en: 'Guide — Ekushe Next, the Bangla keyboard',
};
const langListeners = [];
let lang = store.get('ekushe-lang') === 'en' ? 'en' : 'bn';
function applyLang(next) {
  lang = next;
  document.documentElement.lang = lang;
  store.set('ekushe-lang', lang);
  $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  document.title = TITLES[lang];
  langListeners.forEach((f) => f());
}
$$('.lang button').forEach((b) => b.addEventListener('click', () => applyLang(b.dataset.lang)));
applyLang(lang);

/* ───────── Platform filter ───────── */
function detectOs() {
  const p = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '').toLowerCase();
  if (/android/i.test(navigator.userAgent)) return 'android';
  if (p.includes('win')) return 'win';
  if (p.includes('mac')) return 'mac';
  if (p.includes('linux') && !/android/i.test(navigator.userAgent)) return 'linux';
  return 'all';
}
function applyOs(os) {
  if (os === 'all') delete document.documentElement.dataset.os;
  else document.documentElement.dataset.os = os;
  $$('[data-os-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.osPick === os)));
}
const urlOs = new URLSearchParams(location.search).get('os');
let os = ['all', 'win', 'mac', 'linux', 'android'].includes(urlOs) ? urlOs : store.get('ekushe-guide-os') || detectOs();
applyOs(os);
$$('[data-os-pick]').forEach((b) => b.addEventListener('click', () => {
  os = b.dataset.osPick;
  store.set('ekushe-guide-os', os);
  applyOs(os);
}));

/* ───────── Contents: mobile copy and the current section ───────── */
const tocLinks = $$('#toc a');
$('#tocMobile ol').innerHTML = $('#toc').innerHTML;
$$('#tocMobile a').forEach((a) => a.addEventListener('click', () => { $('#tocMobile').open = false; }));
const sections = tocLinks.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
const spy = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    tocLinks.forEach((a) => a.classList.toggle('active', a.hash === `#${e.target.id}`));
  });
}, { rootMargin: '-80px 0px -70% 0px' });
sections.forEach((s) => spy.observe(s));

/* ───────── Copy buttons on commands ───────── */
const COPY = { bn: 'কপি করুন', en: 'Copy' };
$$('.cmd-box').forEach((box) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'copy';
  btn.innerHTML = '<svg aria-hidden="true"><use href="#i-copy"/></svg>';
  const label = () => { btn.setAttribute('aria-label', COPY[lang]); btn.title = COPY[lang]; };
  label(); langListeners.push(label);
  btn.addEventListener('click', async () => {
    // Only the commands, without the comment lines
    const text = $('code', box).textContent.split('\n').filter((l) => !l.trim().startsWith('#') || box.dataset.keepComments).join('\n').trim();
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add('done');
      btn.innerHTML = '<svg aria-hidden="true"><use href="#i-check"/></svg>';
      setTimeout(() => { btn.classList.remove('done'); btn.innerHTML = '<svg aria-hidden="true"><use href="#i-copy"/></svg>'; }, 1400);
    } catch (e) { /* clipboard not allowed: the text can still be selected */ }
  });
  box.appendChild(btn);
});
// The sample config file is copied whole, comments included
$$('.cmd-box').forEach((box) => { if ($('code', box).textContent.includes('switch_hotkey')) box.dataset.keepComments = '1'; });

/* ───────── Practice box: the real engine ───────── */
const input = $('#practiceInput');
if (input) {
  const out = $('#practiceOut'), candsEl = $('#practiceCands'), tipsEl = $('#practiceTips');
  const bnDigits = (s) => String(s).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let ek = null, text = '', roman = '', cands = [], sel = 0, hints = [];
  const enginePromise = import('/engine/ekushe.js?v=2')
    .then(({ Ekushe }) => Ekushe.load(new URL('/engine/', location.href)))
    .then((e) => { ek = e; input.disabled = false; render(); })
    .catch(() => { tipsEl.textContent = lang === 'bn' ? 'এই ব্রাউজারে ইঞ্জিনটি চালানো গেল না।' : 'The engine could not start in this browser.'; });
  input.disabled = true;

  function render() {
    const pre = roman ? (cands[sel]?.text ?? '') : '';
    out.innerHTML = esc(text) + (pre ? `<span class="pre">${esc(pre)}</span>` : '');
    candsEl.innerHTML = roman ? cands.slice(0, 6).map((c, i) =>
      `<li role="option" data-i="${i}" aria-selected="${i === sel}"><i>${lang === 'bn' ? bnDigits(i + 1) : i + 1}</i>${esc(c.text)}${c.kind === 'English' ? ' <small>EN</small>' : ''}</li>`).join('') : '';
    const tips = roman ? hints.slice(0, 4) : [];
    tipsEl.innerHTML = tips.length
      ? `${lang === 'bn' ? 'সংকেত' : 'Hints'}: ` + tips.map((h) => `<b>${esc(h.result_bangla)}</b> <code>${esc(h.key_hint)}</code>`).join(' · ')
      : '';
    input.value = roman;
  }
  function apply(o) {
    if (o.delete_before) text = text.slice(0, -o.delete_before);
    text += o.committed || '';
    roman = o.roman_buffer || '';
    cands = o.candidates || [];
    hints = o.sign_hints || [];
    if (!roman) sel = 0;
    else sel = Math.min(sel, Math.max(0, cands.length - 1));
    render();
  }
  function key(ch) { sel = 0; apply(ek.key(ch)); }
  function place(trailing) { if (roman) { apply(ek.select(sel, trailing)); sel = 0; } else if (trailing) apply(ek.key(trailing)); }
  function finish() { if (roman) { apply(ek.select(sel, '')); sel = 0; } }

  input.addEventListener('keydown', (e) => {
    if (!ek || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (e.key === 'Tab') {
      if (roman && cands.length > 1) { e.preventDefault(); sel = (sel + 1) % Math.min(cands.length, 6); render(); }
      return;
    }
    if (e.key === ' ') { e.preventDefault(); place(' '); return; }
    if (e.key === 'Enter') { e.preventDefault(); finish(); return; }
    if (e.key === 'Escape') { e.preventDefault(); finish(); return; }
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (roman) { apply(ek.backspace()); return; }
      const o = ek.backspace();
      if (o.delete_before || o.committed) apply(o);
      else { text = [...text].slice(0, -1).join(''); render(); }
      return;
    }
    if (e.key.length === 1) { e.preventDefault(); key(e.key); }
  });
  // Typing through an on-screen keyboard (no usable keydown): take what arrived
  input.addEventListener('input', () => {
    if (!ek) return;
    const v = input.value;
    if (v.startsWith(roman)) { for (const ch of v.slice(roman.length)) ch === ' ' ? place(' ') : key(ch); }
    else render();
  });
  candsEl.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li || !ek) return;
    sel = Number(li.dataset.i);
    place(' ');
    input.focus();
  });
  $('#practiceClear').addEventListener('click', () => { if (ek) ek.reset(); text = ''; roman = ''; cands = []; hints = []; sel = 0; render(); input.focus(); });

  // Examples: type them into the box, one key at a time
  let run = 0;
  async function typeExample(s) {
    await enginePromise;
    if (!ek) return;
    const me = ++run;
    finish();
    if (text && !/\s$/.test(text)) { text += ' '; }
    ek.reset();
    const p = $('#practice');
    if (p.getBoundingClientRect().top < 0 || p.getBoundingClientRect().top > innerHeight - 120) p.scrollIntoView({ behavior: 'smooth', block: 'center' });
    for (const ch of s) {
      if (me !== run) return;
      key(ch);
      await new Promise((r) => setTimeout(r, 55));
    }
    input.focus();
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-try]');
    if (t) { e.preventDefault(); typeExample(t.dataset.try); }
  });
  langListeners.push(render);
}
