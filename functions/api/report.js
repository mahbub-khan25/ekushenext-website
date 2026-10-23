// /api/report: problem reports from ekushenext.com/report become GitHub issues.
//
// GET  → { ready, sitekey, email }: whether reports can be sent, the Turnstile site key, and whether
//        an email address can be kept (only with the REPORTS store bound).
// POST → { ok, number } on success; { ok: false, error } otherwise.
//
// Settings (Cloudflare Pages → Settings → Variables and Secrets / Bindings):
//   GITHUB_TOKEN        secret: fine-grained token, ekushenext repo only, Issues: read and write
//   TURNSTILE_SITEKEY   the Turnstile widget's site key (public)
//   TURNSTILE_SECRET    secret: the Turnstile widget's secret key
//   REPORTS             optional KV namespace: limits reports per visitor, and keeps reply emails
//                       privately (key email:<issue number>), since the issues are public
const REPO = 'mahbub-khan25/ekushenext';
const KINDS = {
  typing: ['টাইপিংয়ে সমস্যা', 'Typing', 'area: typing'],
  words: ['ভুল বা অদ্ভুত পরামর্শ', 'Suggestions', 'area: suggestions'],
  install: ['ইনস্টল বা চালু করা', 'Install', 'area: install'],
  studio: ['স্টুডিও', 'Studio', 'area: studio'],
  crash: ['বন্ধ হয়ে যায় বা আটকে যায়', 'Crash or freeze', 'area: crash'],
  idea: ['নতুন কিছুর প্রস্তাব', 'Idea', 'idea'],
  other: ['অন্য কিছু', 'Other', null],
};
const PER_DAY = 5;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const ready = (env) => Boolean(env.GITHUB_TOKEN && env.TURNSTILE_SITEKEY && env.TURNSTILE_SECRET);

export function onRequestGet({ env }) {
  return json({ ready: ready(env), sitekey: env.TURNSTILE_SITEKEY || null, email: Boolean(env.REPORTS) });
}

// Text from the public goes into a public issue: no HTML, no @mentions, no images or links that load
const clean = (s, max) => String(s ?? '')
  .replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .slice(0, max)
  .trim();
const safe = (s) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/@/g, '@​')
  .replace(/!\[/g, '!​[');
const quote = (s) => safe(s).split('\n').map((l) => `> ${l}`).join('\n');
const field = (s, max = 60) => safe(clean(s, max)).replace(/[|`\n]/g, ' ') || '—';

export async function onRequestPost({ request, env }) {
  if (!ready(env)) return json({ ok: false, error: 'not_ready' }, 503);
  let p;
  try { p = await request.json(); } catch (e) { return json({ ok: false, error: 'bad_request' }, 400); }

  const kind = KINDS[p.kind] ? p.kind : 'other';
  const what = clean(p.what, 4000);
  const typed = clean(p.typed, 300);
  const app = clean(p.app, 120);
  const email = clean(p.email, 200);
  const m = p.meta || {};
  if (what.length < 10) return json({ ok: false, error: 'too_short' }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'bad_email' }, 400);

  // Not a bot
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', String(p.token || ''));
  if (ip) form.append('remoteip', ip);
  const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
    .then((r) => r.json()).catch(() => ({ success: false }));
  if (!check.success) return json({ ok: false, error: 'not_human' }, 403);

  // A few reports a day from one visitor
  if (env.REPORTS && ip) {
    const day = new Date().toISOString().slice(0, 10);
    const key = `rate:${day}:${ip}`;
    const n = Number(await env.REPORTS.get(key)) || 0;
    if (n >= PER_DAY) return json({ ok: false, error: 'too_many' }, 429);
    await env.REPORTS.put(key, String(n + 1), { expirationTtl: 2 * 86400 });
  }

  const version = clean(m.v, 40);
  const [kindBn, kindEn, kindLabel] = KINDS[kind];
  const firstLine = what.split('\n')[0].replace(/\s+/g, ' ');
  const title = `[${kindEn}] ${firstLine.slice(0, 80)}${firstLine.length > 80 ? '…' : ''}`;
  const body = [
    `**${kindBn} · ${kindEn}**`,
    '',
    '### কী হয়েছে · What happened',
    quote(what),
    typed ? `\n### কী টাইপ করছিলেন · What they were typing\n${quote(typed)}` : null,
    app ? `\n### কোন অ্যাপে · In which app\n${quote(app)}` : null,
    '',
    '| Version | Computer | Layout | Typing mode |',
    '|---|---|---|---|',
    `| ${field(version)} | ${field(m.os)} | ${field(m.layout)} | ${field(m.mode)} |`,
    '',
    `<sub>Sent from ekushenext.com/report${email ? ' · the reporter left an email for a reply (kept privately)' : ''} · ${field(m.from, 20)}</sub>`,
  ].filter((x) => typeof x === 'string').join('\n');

  const labels = ['user-report', kindLabel, /beta/i.test(version) ? 'beta' : null].filter(Boolean);
  const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'ekushenext.com',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ title, body, labels }),
  });
  if (!res.ok) return json({ ok: false, error: 'github', status: res.status }, 502);
  const issue = await res.json();
  if (email && env.REPORTS) await env.REPORTS.put(`email:${issue.number}`, email);
  return json({ ok: true, number: issue.number });
}
