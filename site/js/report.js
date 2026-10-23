// ekushenext.com/report: a problem report becomes a GitHub issue (functions/api/report.js).
// The app opens this page with its details in the address: ?v=…&os=…&layout=…&mode=…&from=app
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

/* Language, shared with the other pages */
let lang = store.get('ekushe-lang') === 'en' ? 'en' : 'bn';
const TITLES = { bn: 'সমস্যা জানান — একুশে নেক্সট | Report a problem', en: 'Report a problem — Ekushe Next' };
function applyLang(next) {
  lang = next;
  document.documentElement.lang = lang;
  store.set('ekushe-lang', lang);
  $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  document.title = TITLES[lang];
  if (statusKey) say(statusKey);
}
$$('.lang button').forEach((b) => b.addEventListener('click', () => applyLang(b.dataset.lang)));

/* What goes with the report */
const q = new URLSearchParams(location.search);
const ua = navigator.userAgent;
const guessOs = () => (/windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'macOS' : /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iOS' : /linux/i.test(ua) ? 'Linux' : '');
const meta = {
  v: (q.get('v') || '').slice(0, 40),
  os: (q.get('os') || guessOs()).slice(0, 60),
  layout: (q.get('layout') || '').slice(0, 60),
  mode: (q.get('mode') || '').slice(0, 60),
  from: q.get('from') === 'app' ? 'app' : 'web',
};
const LABELS = { v: ['সংস্করণ', 'Version'], os: ['ডিভাইস', 'Device'], layout: ['লেআউট', 'Layout'], mode: ['টাইপিং মোড', 'Typing mode'] };
$('#metaList').innerHTML = Object.entries(LABELS).map(([k, [bn, en]]) =>
  `<div><dt><span lang="bn">${bn}</span><span lang="en">${en}</span></dt><dd>${(meta[k] || '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</dd></div>`).join('');

/* Status line */
const MSG = {
  loading: ['ফর্মটি তৈরি হচ্ছে…', 'Getting the form ready…'],
  unavailable: ['ফর্মটি এখন চালু নেই। দয়া করে support@ekushenext.com-এ লিখুন।', 'The form isn’t available right now. Please write to support@ekushenext.com.'],
  too_short: ['কী হয়েছে, একটু বিস্তারিত লিখুন (অন্তত ১০ অক্ষর)।', 'Please describe what happened (at least 10 characters).'],
  bad_email: ['ইমেইল ঠিকানাটি ঠিক মনে হচ্ছে না।', 'That email address doesn’t look right.'],
  check: ['নিচের যাচাইটি শেষ হওয়া পর্যন্ত একটু অপেক্ষা করুন।', 'Please wait for the check below to finish.'],
  sending: ['পাঠানো হচ্ছে…', 'Sending…'],
  not_human: ['যাচাই হয়নি। আবার চেষ্টা করুন।', 'The check didn’t pass. Please try again.'],
  too_many: ['আজ অনেকগুলো রিপোর্ট পাঠানো হয়েছে। কাল আবার চেষ্টা করুন, বা support@ekushenext.com-এ লিখুন।', 'Too many reports today. Please try tomorrow, or write to support@ekushenext.com.'],
  failed: ['পাঠানো গেল না। একটু পরে আবার চেষ্টা করুন, বা support@ekushenext.com-এ লিখুন।', 'Couldn’t send it. Please try again shortly, or write to support@ekushenext.com.'],
};
let statusKey = '';
const status = $('#status');
function say(key, bad = false) {
  statusKey = key;
  status.textContent = key ? MSG[key][lang === 'bn' ? 0 : 1] : '';
  status.classList.toggle('bad', bad);
}
applyLang(lang);

/* Turnstile (the bot check), loaded only when the form is ready on the server */
let token = '', widget = null, ready = false;
const send = $('#send');
send.disabled = true;
say('loading');
fetch('/api/report', { cache: 'no-store' }).then((r) => r.json()).then((cfg) => {
  if (!cfg.ready || !cfg.sitekey) { say('unavailable', true); return; }
  $('#emailField').hidden = !cfg.email;
  window.onTurnstileReady = () => {
    widget = window.turnstile.render('#turnstile', {
      sitekey: cfg.sitekey,
      language: lang === 'bn' ? 'bn' : 'en',
      theme: 'dark',
      callback: (t) => { token = t; if (statusKey === 'check') say(''); },
      'expired-callback': () => { token = ''; },
      'error-callback': () => { token = ''; },
    });
  };
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileReady';
  s.async = true;
  s.onerror = () => say('unavailable', true);
  document.head.appendChild(s);
  ready = true;
  send.disabled = false;
  say('');
}).catch(() => say('unavailable', true));

/* Sending */
$('#reportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!ready) return;
  const what = $('#what').value.trim();
  const email = $('#email').value.trim();
  if (what.length < 10) { say('too_short', true); $('#what').focus(); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say('bad_email', true); $('#email').focus(); return; }
  if (!token) { say('check'); return; }
  send.disabled = true;
  say('sending');
  try {
    const r = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: $('input[name="kind"]:checked').value, what, typed: $('#typed').value, app: $('#app').value, email, meta, token }),
    });
    const res = await r.json().catch(() => ({}));
    if (!res.ok) throw new Error(res.error || 'failed');
    $('#doneNumber').textContent = `#${res.number}`;
    $('#reportForm').hidden = true;
    $('#done').hidden = false;
    $('#done').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    say(MSG[err.message] ? err.message : 'failed', true);
  } finally {
    send.disabled = false;
    token = '';
    if (widget !== null && window.turnstile) window.turnstile.reset(widget);
  }
});
$('#another').addEventListener('click', () => {
  ['#what', '#typed', '#app'].forEach((s) => { $(s).value = ''; });
  $('#done').hidden = true;
  $('#reportForm').hidden = false;
  say('');
  $('#what').focus();
});
