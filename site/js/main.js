import { Ekushe } from '/engine/ekushe.js';
import { EN, BN_EXTRA } from '/js/i18n.js';
import { LAUNCHED, latestRelease } from '/js/launch.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── Language ───────────────────────── */
const BN = { ...BN_EXTRA };
$$('[data-t]').forEach((el) => { if (!(el.dataset.t in BN)) BN[el.dataset.t] = el.innerHTML; });
let lang = 'bn';
try { lang = localStorage.getItem('ekushe-lang') || 'bn'; } catch (e) {}
const t = (k) => (lang === 'en' ? EN[k] : BN[k]) ?? BN[k] ?? k;
const bnDigits = (s) => String(s).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
const num = (s) => (lang === 'bn' ? bnDigits(s) : String(s));
const langListeners = [];

function applyLang(next) {
  lang = next;
  document.documentElement.lang = lang;
  try { localStorage.setItem('ekushe-lang', lang); } catch (e) {}
  $$('[data-t]').forEach((el) => { const v = t(el.dataset.t); if (v != null) el.innerHTML = v; });
  $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  document.title = lang === 'en' ? 'Ekushe Next — a new keyboard for writing Bangla' : 'একুশে নেক্সট — বাংলা লেখার নতুন কিবোর্ড | Ekushe Next';
  langListeners.forEach((f) => f());
}
$$('.lang button').forEach((b) => b.addEventListener('click', () => applyLang(b.dataset.lang)));
if (lang !== 'bn') applyLang(lang);

/* ───────────────────────── Nav, reveal ───────────────────────── */
const nav = $('#nav');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 12);
addEventListener('scroll', onScroll, { passive: true }); onScroll();

const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { threshold: 0.25 });
$$('.section .h2, .section .section-lede').forEach((el) => { el.classList.add('reveal'); io.observe(el); });
$$('.feat-demo, .race, .shot, .minar').forEach((el) => io.observe(el));

/* ───────────────────────── Engine ───────────────────────── */
const enginePromise = Ekushe.load(new URL('/engine/', location.href)).catch((e) => { console.warn('engine', e); return null; });

// type a whole string into a fresh composition; returns the text and the last output
function typeAll(ek, s) {
  ek.reset();
  let text = '', out = {};
  for (const c of s) {
    out = ek.key(c);
    if (out.delete_before) text = text.slice(0, -out.delete_before);
    text += out.committed || '';
  }
  return { text, out };
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const candList = (cands, sel = 0, max = 5) =>
  cands.slice(0, max).map((c, i) => `<li role="option" aria-selected="${i === sel}"><b>${num(i + 1)}</b>${esc(c.text)}${c.kind === 'English' ? ' <small>EN</small>' : ''}</li>`).join('');

/* ───────────────────────── Hero stage ───────────────────────── */
const stage = $('#stage'), input = $('#stageInput');
const romanLine = $('#romanLine'), committedEl = $('#committed'), preeditEl = $('#preedit');
const popup = $('#popup'), popupRoman = $('#popupRoman'), popupCands = $('#popupCands'), stageText = $('#stageText');
let ek = null, live = false, autoplayRun = 0;
let committed = '', roman = '', cands = [], sel = 0;

function render() {
  committedEl.textContent = committed;
  preeditEl.textContent = roman ? (cands[sel]?.text ?? '') : '';
  romanLine.textContent = roman || (live && !committed ? '' : romanLine.dataset.keep || '');
  romanLine.dataset.placeholder = live && !committed && !roman ? t('hero.placeholder') : '';
  if (roman && cands.length) {
    popupRoman.textContent = roman;
    popupCands.innerHTML = candList(cands, sel, 6);
    popup.hidden = false;
    placePopup();
  } else popup.hidden = true;
}
function placePopup() {
  const caret = $('.caret', stage).getBoundingClientRect(), box = stage.getBoundingClientRect();
  const w = Math.min(popup.offsetWidth || 320, box.width);
  const x = Math.max(0, Math.min(caret.left - box.left - 24, box.width - w));
  popup.style.setProperty('--px', `${x}px`);
  popup.style.setProperty('--py', `${caret.bottom - box.top + 10}px`);
}
function apply(out) {
  if (out.delete_before) committed = committed.slice(0, -out.delete_before);
  committed += out.committed || '';
  roman = out.roman_buffer || '';
  cands = out.candidates || [];
  if (!roman) sel = 0;
  render();
}

async function autoplay() {
  const run = ++autoplayRun;
  const phrases = [
    'jebhabe bolen, shebhabe likhun.',
    'amar praner bhasha bangla',
    'ekushe february, amar gorbo.',
    'kkhoma korben, deri hoye gelo.',
    'tumi kemon acho?',
    'shuvo noboborsho!',
  ];
  await sleep(1400);
  for (let i = 0; run === autoplayRun; i = (i + 1) % phrases.length) {
    ek.reset(); committed = ''; roman = ''; romanLine.dataset.keep = '';
    let typed = '';
    for (const c of phrases[i] + ' ') {
      if (run !== autoplayRun) return;
      typed += c;
      romanLine.dataset.keep = typed.trim();
      apply(ek.key(c));
      await sleep(c === ' ' ? 260 : 70 + Math.random() * 70);
    }
    romanLine.dataset.keep = phrases[i];
    render();
    await sleep(2600);
    if (run !== autoplayRun) return;
    stageText.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).onfinish = (a) => a.target.cancel();
    await sleep(320);
  }
}

function goLive() {
  if (live || !ek) return;
  live = true; autoplayRun++;
  stage.classList.add('live');
  ek.reset(); committed = ''; roman = ''; cands = []; sel = 0; romanLine.dataset.keep = '';
  render();
}
function commitSel(trailing = ' ') { apply(ek.select(sel, trailing)); sel = 0; }

input.addEventListener('focus', goLive);
input.addEventListener('blur', () => { if (live && !committed && !roman) { live = false; stage.classList.remove('live'); autoplay(); } });
input.addEventListener('beforeinput', (e) => {
  if (!ek) return;
  goLive();
  if (e.inputType === 'insertText' && e.data) {
    e.preventDefault();
    for (const c of e.data) {
      if (c === ' ' && roman) commitSel(' ');
      else apply(ek.key(c));
    }
  } else if (e.inputType === 'deleteContentBackward') {
    e.preventDefault();
    if (roman) { apply(ek.backspace()); return; }
    if (!committed) return;
    const out = ek.backspace(); // right after a word this brings the Roman letters back
    if (out.delete_before || out.committed) apply(out);
    else { committed = Array.from(new Intl.Segmenter('bn', { granularity: 'grapheme' }).segment(committed), (g) => g.segment).slice(0, -1).join(''); render(); }
  } else if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') {
    e.preventDefault();
    if (roman) commitSel('');
  } else if (e.inputType.startsWith('insert')) {
    // composition from a mobile keyboard: let it land, then read it below
  } else e.preventDefault();
});
input.addEventListener('input', () => {
  // text that bypassed beforeinput (some mobile keyboards): feed it in and clear the field
  if (input.value) { const v = input.value; input.value = ''; for (const c of v) c === ' ' && roman ? commitSel(' ') : apply(ek.key(c)); }
});
input.addEventListener('keydown', (e) => {
  if (!roman || !cands.length) return;
  if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.min(cands.length, 6); render(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + Math.min(cands.length, 6) - 1) % Math.min(cands.length, 6); render(); }
  else if (e.key === 'Escape') { e.preventDefault(); apply(ek.commit('')); }
});
popupCands.addEventListener('pointerdown', (e) => {
  const li = e.target.closest('li'); if (!li) return;
  e.preventDefault(); sel = [...popupCands.children].indexOf(li); commitSel(' '); input.focus();
});
addEventListener('resize', () => { if (!popup.hidden) placePopup(); });

/* ───────────────────────── Feature demos ───────────────────────── */
// Everything is computed once, before the hero starts typing, so nothing else ever touches the
// engine while a word is being composed.
let demo = null;
function computeDemos() {
  const top = (w) => typeAll(ek, w).out.candidates[0].text;
  demo = {
    forgiving: ['kkhoma', 'khoma', 'kkhma', 'khkhoma'].map((w) => [w, top(w)]),
    standard: ['banglades', 'sikkha', 'porikha', 'itihash'].map((w) => [w, top(w)]),
    predict: ['shuvo', 'dhonnobad', 'amar'].map((w) => {
      const { text, out } = typeAll(ek, w + ' ');
      return { text: text.trim(), preds: (out.next_word_predictions || []).slice(0, 3).map((p) => ({ text: p })) };
    }),
    undo: { bn: typeAll(ek, 'office ').text.trim(), en: typeAll(ek, '/office ').text.trim() },
  };
  ek.reset();
}
const rows = (list) => `<div class="demo-rows">${list.map(([w, bn]) => `<div class="demo-row"><span class="demo-roman">${w}</span><span class="demo-arrow">→</span><span class="demo-bn">${esc(bn)}</span></div>`).join('')}</div>`;
let demoTimers = [];
function buildDemos() {
  demoTimers.forEach(clearInterval); demoTimers = [];
  const el = (k) => $(`.feat-demo[data-demo="${k}"]`);
  el('forgiving').innerHTML = rows(demo.forgiving) + `<p class="demo-caption">${t('demo.forgiving')}</p>`;
  el('standard').innerHTML = rows(demo.standard) + `<p class="demo-caption">${t('demo.standard')}</p>`;
  let pi = 0;
  const predict = () => {
    const d = demo.predict[pi++ % demo.predict.length];
    el('predict').innerHTML = `<p class="demo-sentence">${esc(d.text)} <span class="ghost">…</span></p><div class="demo-popup"><ol class="popup-cands">${candList(d.preds, 0, 3)}</ol></div><p class="demo-caption">${t('demo.predict')}</p>`;
  };
  let ui = 0;
  const undoSteps = [[esc(demo.undo.bn), 'demo.undo.1', 'Space'], ['office', 'demo.undo.2', '⌫'], [esc(demo.undo.en), 'demo.undo.3', '/']];
  const undo = () => {
    const [sentence, cap, key] = undoSteps[ui++ % undoSteps.length];
    el('undo').innerHTML = `<p class="demo-sentence">${sentence}</p><p class="demo-caption"><span class="keycap press">${key}</span> ${t(cap)}</p>`;
  };
  predict(); undo();
  if (!reduceMotion) demoTimers.push(setInterval(predict, 3200), setInterval(undo, 2200));
}

/* ───────────────────────── Speed, measured here ───────────────────────── */
function measureSpeed() {
  const sample = 'amar sonar bangla ami tomay bhalobashi chirodin tomar akash tomar batash amar prane bajay bashi ';
  let keys = 0;
  typeAll(ek, sample); // warm-up
  const t0 = performance.now();
  for (let r = 0; r < 3; r++) { typeAll(ek, sample); keys += sample.length; }
  const ms = (performance.now() - t0) / keys;
  ek.reset();
  const row = $('#raceYou');
  const show = () => { $('#raceYouVal').textContent = lang === 'bn' ? `গড়ে ${bnDigits(ms.toFixed(2))} মিলিসেকেন্ড` : `${ms.toFixed(2)} ms on average`; };
  show(); langListeners.push(show);
  row.hidden = false;
}

/* ───────────────────────── Studio screenshots ───────────────────────── */
let shotName = 'playground', shotTheme = 'dark';
const shotImg = $('#shotImg');
function showShot() {
  const src = `/img/studio-${shotName}-${shotTheme}.webp`;
  if (shotImg.getAttribute('src') === src) return;
  const pre = new Image(); pre.src = src;
  shotImg.classList.add('fade');
  pre.decode().catch(() => {}).then(() => { setTimeout(() => { shotImg.src = src; shotImg.classList.remove('fade'); }, 180); });
  $('#studioCaption').innerHTML = t(`studio.c.${shotName}`);
  $('#studioCaption').dataset.t = `studio.c.${shotName}`;
}
$$('[data-shot]').forEach((b) => b.addEventListener('click', () => {
  shotName = b.dataset.shot;
  $$('[data-shot]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  showShot();
}));
$$('[data-shot-theme]').forEach((b) => b.addEventListener('click', () => {
  shotTheme = b.dataset.shotTheme;
  $$('[data-shot-theme]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  showShot();
}));
// preload the rest once the page is idle
setTimeout(() => {
  ['playground', 'xray', 'signs', 'spell', 'converter', 'settings'].forEach((n) => ['dark', 'light'].forEach((th) => { const i = new Image(); i.src = `/img/studio-${n}-${th}.webp`; }));
}, 4000);
// gentle tilt toward the pointer
const shot = $('#shot');
if (!reduceMotion && matchMedia('(pointer: fine)').matches) {
  shot.addEventListener('pointermove', (e) => {
    const r = shot.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    shotImg.style.setProperty('--ry', `${x * 4}deg`); shotImg.style.setProperty('--rx', `${-y * 3}deg`);
  });
  shot.addEventListener('pointerleave', () => { shotImg.style.setProperty('--ry', '0deg'); shotImg.style.setProperty('--rx', '0deg'); });
}

/* ───────────────────────── Bijoy ───────────────────────── */
function bijoyLive() {
  const i = $('#bijoyIn'), o = $('#bijoyOut');
  const run = () => { o.textContent = ek.bijoyToUnicode(i.value); };
  i.addEventListener('input', run); run();
}

/* ───────────────────────── Petals (21 February) ───────────────────────── */
(function petals() {
  if (reduceMotion) return;
  const box = $('#petals');
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('i');
    const size = 10 + Math.random() * 18;
    p.className = 'petal';
    Object.assign(p.style, {
      left: `${Math.random() * 100}%`, width: `${size}px`, height: `${size * 0.62}px`,
      animationDuration: `${12 + Math.random() * 14}s`, animationDelay: `${-Math.random() * 26}s`,
      opacity: String(0.35 + Math.random() * 0.5), background: Math.random() > 0.3 ? '#E0303F' : '#F26B4F',
    });
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 160}px`);
    p.style.setProperty('--rot', `${360 + Math.random() * 540}deg`);
    box.appendChild(p);
  }
  // only animate while visible
  new IntersectionObserver(([e]) => { box.style.display = e.isIntersecting ? '' : 'none'; }).observe($('#ekushe'));
})();

/* ───────────────────────── Downloads ───────────────────────── */
const REPO = 'mahbub-khan25/ekushenext';
// Downloads are greyed out ("coming soon") until launch: the switch is LAUNCHED in js/launch.js.
const COMING_SOON = !LAUNCHED;
// Used only when the newest release can't be looked up (and while it is older than this one).
const FALLBACK = {
  tag_name: 'v0.1.0-beta.12', published_at: '2026-10-24T00:27:31Z', html_url: `https://github.com/${REPO}/releases/tag/v0.1.0-beta.12`,
  assets: [
    ['Ekushe-Setup.exe', 18190128], ['Ekushe-Setup.zip', 16035298], ['Ekushe-Portable.exe', 18190128], ['Ekushe-macOS.pkg', 34000864], ['Ekushe-macOS.zip', 33999314], ['ekushe_0.1.0-beta.12_amd64.deb', 31201874], ['ekushe-0.1.0-beta.12.x86_64.rpm', 31407117], ['Ekushe-0.1.0-beta.12-x86_64.AppImage', 31504888], ['Ekushe-Next-Android.apk', 22786490],
  ].map(([name, size]) => ({ name, size, browser_download_url: `https://github.com/${REPO}/releases/download/v0.1.0-beta.12/${name}` })),
};
const FILES = {
  windows: [[/^Ekushe-Setup\.exe$/, 'winSetup', 'windows'], [/^Ekushe-Setup\.zip$/, 'winZip', 'windows'], [/^Ekushe-Portable\.exe$/, 'winPortable', 'windows']],
  mac: [[/^Ekushe-macOS\.pkg$/, 'macPkg', 'apple'], [/^Ekushe-macOS\.zip$/, 'macZip', 'apple']],
  linux: [[/\.deb$/, 'deb', 'linux'], [/\.rpm$/, 'rpm', 'linux'], [/\.AppImage$/, 'appimage', 'linux']],
  android: [[/^Ekushe-Next-Android\.apk$/, 'android', 'android']],
};
function detectOS() {
  const ua = navigator.userAgent, p = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (p.includes('mac') && navigator.maxTouchPoints > 1)) return 'mobile';
  if (p.includes('win') || /windows/i.test(ua)) return 'windows';
  if (p.includes('mac') || /mac os/i.test(ua)) return 'mac';
  if (p.includes('linux') || /linux|cros/i.test(ua)) return 'linux';
  return 'windows';
}
const os = detectOS();
let release = FALLBACK;

const fmtSize = (b) => `${num((b / 1048576).toFixed(b > 1048576 * 10 ? 0 : 1))} MB`;
const fileOf = (osKey, i = 0) => { const [re] = FILES[osKey][i]; return release.assets.find((a) => re.test(a.name)); };

function renderDownloads() {
  for (const osKey of Object.keys(FILES)) {
    const box = $(`[data-files="${osKey}"]`);
    box.innerHTML = FILES[osKey].map(([re, key, icon], i) => {
      const a = release.assets.find((x) => re.test(x.name));
      // before launch every platform shows its "coming soon" tile, even one the fallback release lacks
      if (!a && !COMING_SOON) return '';
      if (COMING_SOON) return `<div class="file is-soon" aria-disabled="true">
        <svg aria-hidden="true"><use href="#i-${icon}"/></svg>
        <div><b>${t(`file.${key}`)}</b><span>${t(`file.${key}Sub`)}</span></div>
        <span class="size">${t('soon.short')}</span></div>`;
      return `<a class="file${i === 0 ? ' recommended' : ''}" href="${a.browser_download_url}" download>
        <svg aria-hidden="true"><use href="#i-${icon}"/></svg>
        <div><b>${t(`file.${key}`)}</b><span>${t(`file.${key}Sub`)}</span><span class="fname">${esc(a.name)}</span></div>
        <span class="size">${fmtSize(a.size)}</span></a>`;
    }).join('');
  }
  const v = release.tag_name.replace(/^v/, '');
  const d = new Date(release.published_at).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#dlVersion').textContent = COMING_SOON ? '' : t('dl.versionFmt').replace('{v}', v).replace('{d}', d);
  if (COMING_SOON) { renderComingSoon(); return; }

  // the big button: this computer's download, with the others one click away
  const prim = $('#dlPrimary'), heroBtn = $('#heroDownload'), heroLbl = $('#heroDownloadLabel');
  const icon = { windows: 'windows', mac: 'apple', linux: 'linux', android: 'android' }[os];
  if (os === 'mobile') {
    prim.innerHTML = `<p class="alt">${t('dl.mobileNote')}</p>`;
    heroLbl.textContent = t('dl.for.mobile'); heroLbl.dataset.t = 'dl.for.mobile'; heroBtn.href = '#download';
    return;
  }
  const a = fileOf(os);
  if (!a) { prim.innerHTML = `<p class="alt">${t('dl.notYet')}</p>`; return; }
  const others = ['windows', 'mac', 'linux', 'android'].filter((x) => x !== os)
    .map((x) => `<a href="#download" data-pick="${x}">${{ windows: 'Windows', mac: 'macOS', linux: 'Linux', android: 'Android' }[x]}</a>`).join(lang === 'bn' ? ' বা ' : ' or ');
  prim.innerHTML = `<a class="btn btn-primary btn-lg" href="${a.browser_download_url}" download><svg class="os-ico" aria-hidden="true"><use href="#i-${icon}"/></svg>${t(`dl.for.${os}`)}</a>
    <span class="alt">${fmtSize(a.size)}${os === 'windows' ? `. ${t('dl.signed')}` : ''}. ${t('dl.alt')} ${others}</span>`;
  heroBtn.href = a.browser_download_url; heroBtn.setAttribute('download', '');
  heroBtn.querySelector('use').setAttribute('href', `#i-${icon}`);
  heroLbl.textContent = t(`dl.for.${os}`); heroLbl.dataset.t = `dl.for.${os}`;
  $$('[data-pick]', prim).forEach((l) => l.addEventListener('click', () => pickOS(l.dataset.pick)));
}
function renderComingSoon() {
  const label = `<svg class="os-ico" aria-hidden="true"><use href="#i-clock"/></svg>${t('soon.label')}`;
  $('#dlPrimary').innerHTML = `<button class="btn btn-lg btn-soon" type="button" disabled>${label}</button><span class="alt">${t('soon.note')}</span>`;
  const hero = $('#heroDownload');
  const btn = document.createElement('button');
  btn.className = 'btn btn-lg btn-soon'; btn.type = 'button'; btn.disabled = true; btn.id = 'heroDownload';
  btn.innerHTML = `<svg class="os-ico" aria-hidden="true"><use href="#i-clock"/></svg><span id="heroDownloadLabel">${t('soon.label')}</span>`;
  hero.replaceWith(btn);
  $('#heroMeta').textContent = t('soon.meta'); $('#heroMeta').dataset.t = 'soon.meta';
  const more = $('.hero-meta a'); if (more) more.remove();
  $$('.dl-files').forEach((b) => b.setAttribute('aria-label', t('soon.label')));
  const cta = $('.nav-cta'); cta.textContent = t('soon.short'); cta.dataset.t = 'soon.short'; cta.classList.replace('btn-primary', 'btn-soon');
  const lede = $('#dlLede'); lede.textContent = t('soon.lede'); lede.dataset.t = 'soon.lede';
}
function pickOS(key) {
  $$('.dl-tabs [data-os]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.os === key)));
  $$('.dl-panel').forEach((p) => { p.hidden = p.dataset.panel !== key; });
}
$$('.dl-tabs [data-os]').forEach((b) => b.addEventListener('click', () => pickOS(b.dataset.os)));
pickOS(os === 'mobile' ? 'windows' : os);
renderDownloads();
langListeners.push(renderDownloads);
if (!COMING_SOON) latestRelease(FALLBACK).then((r) => { release = r; renderDownloads(); });

/* ───────────────────────── Android showcase ───────────────────────── */
(function androidShowcase() {
  const phone = $('#phone'), img = $('#phoneKb'), chips = $$('#themeChips [data-kb]');
  if (!phone) return;
  const alts = { default: 'একুশে ডিফল্ট', smooth: 'একুশে মসৃণ', ekushe: 'একুশে', krishnachura: 'কৃষ্ণচূড়া', padma: 'পদ্মা', shapla: 'শাপলা', kashful: 'কাশফুল', night: 'রাত', photo: 'নিজের ছবি', '3d': 'থ্রিডি কী' };
  let current = 'ekushe', userPicked = false;
  const show = (k) => {
    if (k === current) return;
    current = k;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.kb === k)));
    const pre = new Image(); pre.src = `/img/android/kb-${k}.webp`;
    img.classList.add('fade');
    pre.decode().catch(() => {}).then(() => setTimeout(() => {
      img.src = pre.src; img.alt = `একুশে নেক্সট অ্যান্ড্রয়েড কিবোর্ড, ${alts[k]} থিম`;
      phone.dataset.theme = k; img.classList.remove('fade');
    }, 160));
  };
  chips.forEach((c) => c.addEventListener('click', () => { userPicked = true; show(c.dataset.kb); }));
  // preload once the section is near
  new IntersectionObserver(([e], obs) => {
    if (!e.isIntersecting) return;
    obs.disconnect();
    chips.forEach((c) => { const i = new Image(); i.src = `/img/android/kb-${c.dataset.kb}.webp`; });
    if (reduceMotion) return;
    // walk through the themes until the visitor picks one
    const order = chips.map((c) => c.dataset.kb);
    setInterval(() => { if (!userPicked && !document.hidden) show(order[(order.indexOf(current) + 1) % order.length]); }, 3200);
    // the message being typed
    const phrases = ['একুশে এবার ফোনেও', 'আমার সোনার বাংলা', 'শুভ নববর্ষ! 🎉', 'কাল দেখা হবে, ইনশাআল্লাহ', 'ধন্যবাদ, ভালো থেকো'];
    const out = $('#phoneTyping');
    const seg = (s) => Array.from(new Intl.Segmenter('bn', { granularity: 'grapheme' }).segment(s), (g) => g.segment);
    (async () => {
      for (let i = 1; ; i = (i + 1) % phrases.length) {
        await sleep(2600);
        const g = seg(phrases[i]);
        out.textContent = '';
        for (const ch of g) { out.textContent += ch; await sleep(90 + Math.random() * 80); }
      }
    })();
  }, { rootMargin: '200px' }).observe(phone);
})();

/* ───────────────────────── Film ───────────────────────── */
const film = $('#film'), video = $('#filmVideo');
const openFilm = () => {
  const vertical = innerHeight > innerWidth;
  film.classList.toggle('vertical', vertical);
  const src = vertical ? '/media/ekushe-film-vertical.mp4' : '/media/ekushe-film-1080.mp4';
  if (!video.src.endsWith(src)) { video.src = src; video.poster = vertical ? '' : '/media/film-poster.webp'; }
  film.showModal();
  video.play().catch(() => {});
};
$('#playFilm').addEventListener('click', openFilm);
$('#posterPlay').addEventListener('click', openFilm);
const closeFilm = () => { video.pause(); film.close(); };
$('#filmClose').addEventListener('click', closeFilm);
film.addEventListener('click', (e) => { if (e.target === film) closeFilm(); });
film.addEventListener('close', () => video.pause());

/* ───────────────────────── Start ───────────────────────── */
enginePromise.then((engine) => {
  if (!engine) return;
  ek = engine;
  computeDemos();
  buildDemos();
  langListeners.push(() => { buildDemos(); if (live || roman) render(); });
  measureSpeed();
  bijoyLive();
  if (reduceMotion) { romanLine.dataset.keep = 'jebhabe bolen, shebhabe likhun.'; return; }
  autoplay();
});
