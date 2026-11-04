// /api/voice-sample: sentences that people read aloud in Ekushe Studio ("একুশেকে কণ্ঠ দিন") and chose
// to send, so Ekushe's own voice typing models can be trained on many voices and microphones. The
// recordings are used only to train Ekushe's models and are never published.
//
// POST  (from the app, only after the person agreed and pressed "send"), one sentence per request:
//   { contributor, batch, n, text, audio: <base64 WebM/Ogg/WAV>, seconds, app, os, region, age, mic }
//   → { ok: true }  |  { ok: false, error }
//   Stored in the R2 bucket as v/<contributor>/<batch>-<n>-<time>.<webm|ogg|wav> and the same name
//   with .json (sentence, details, app version, system, date). No address or name is kept; the
//   contributor code is random, made on the person's computer.
// POST  { delete: <contributor> } → removes everything sent with that code → { ok: true, deleted }
// GET   → { ready }: whether recordings can be received.
// GET   with "Authorization: Bearer <VOICE_ADMIN_KEY>" (or OCR_ADMIN_KEY), for collecting them:
//   ?list=1[&cursor=…]  → { objects: [{ key, size }], cursor }
//   ?get=<key>          → the stored file
//   ?del=<key>          → removes it (after it was downloaded)
//
// Settings (Cloudflare Pages → Settings → Bindings / Variables and Secrets):
//   VOICE_SAMPLES   R2 bucket binding where recordings are kept (no delete rule: kept until collected)
//   VOICE_ADMIN_KEY secret (optional; OCR_ADMIN_KEY is used when it is not set)
//   REPORTS         optional KV namespace (already used by /api/report): limits sends
const PER_DAY = 400;         // sentences per visitor per day (20 batches)
const ALL_PER_DAY = 20000;   // sentences per day from everyone together
const MB_PER_DAY = 400;      // stored megabytes per day from everyone together
const MAX_AUDIO = 2 * 1024 * 1024;
const MAX_SECONDS = 60;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
});
const ready = (env) => Boolean(env.VOICE_SAMPLES);
const adminKey = (env) => env.VOICE_ADMIN_KEY || env.OCR_ADMIN_KEY;

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

async function same(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(String(s)))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const auth = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!auth || ![...url.searchParams].length) return json({ ready: ready(env) });
  if (!ready(env) || !adminKey(env) || !(await same(auth, adminKey(env)))) return json({ ok: false, error: 'forbidden' }, 403);
  if (url.searchParams.get('list')) {
    const r = await env.VOICE_SAMPLES.list({ prefix: 'v/', cursor: url.searchParams.get('cursor') || undefined, limit: 1000 });
    return json({ objects: r.objects.map((o) => ({ key: o.key, size: o.size })), cursor: r.truncated ? r.cursor : null });
  }
  const del = url.searchParams.get('del');
  if (del) {
    if (!del.startsWith('v/')) return json({ ok: false, error: 'bad_key' }, 400);
    await env.VOICE_SAMPLES.delete(del);
    return json({ ok: true });
  }
  const key = url.searchParams.get('get') || '';
  if (!key.startsWith('v/')) return json({ ok: false, error: 'bad_key' }, 400);
  const obj = await env.VOICE_SAMPLES.get(key);
  if (!obj) return json({ ok: false, error: 'not_found' }, 404);
  return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'no-store' } });
}

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
const code = (s) => (/^[a-f0-9]{16,32}$/.test(String(s)) ? String(s) : null);

function b64(s) {
  try {
    const bin = atob(String(s));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (e) { return null; }
}

// What kind of audio file the bytes are (only these three are kept)
function kind(b) {
  if (b.length < 16) return null;
  if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return ['webm', 'audio/webm'];
  if (b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return ['ogg', 'audio/ogg'];
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x41) return ['wav', 'audio/wav'];
  return null;
}

async function hit(env, key, limit) {
  const n = Number(await env.REPORTS.get(key)) || 0;
  if (n >= limit) return false;
  await env.REPORTS.put(key, String(n + 1), { expirationTtl: 2 * 86400 });
  return true;
}

export async function onRequestPost({ request, env }) {
  if (!ready(env)) return json({ ok: false, error: 'not_ready' }, 503);
  if (Number(request.headers.get('Content-Length') || 0) > MAX_AUDIO * 1.4 + 20000) return json({ ok: false, error: 'too_big' }, 413);
  let p;
  try { p = await request.json(); } catch (e) { return json({ ok: false, error: 'bad_request' }, 400); }

  // "Delete everything I sent": the random code made on the person's computer
  if (p && p.delete !== undefined) {
    const c = code(p.delete);
    if (!c) return json({ ok: false, error: 'bad_code' }, 400);
    let deleted = 0, cursor;
    do {
      const r = await env.VOICE_SAMPLES.list({ prefix: `v/${c}/`, cursor, limit: 1000 });
      if (r.objects.length) await env.VOICE_SAMPLES.delete(r.objects.map((o) => o.key));
      deleted += r.objects.length;
      cursor = r.truncated ? r.cursor : undefined;
    } while (cursor);
    return json({ ok: true, deleted });
  }

  const contributor = code(p.contributor);
  const batch = Math.trunc(Number(p.batch)), n = Math.trunc(Number(p.n));
  const text = clean(p.text, 500);
  const seconds = Number(p.seconds) || 0;
  if (!contributor) return json({ ok: false, error: 'bad_code' }, 400);
  if (!(batch >= 1 && batch <= 99 && n >= 1 && n <= 99)) return json({ ok: false, error: 'bad_sentence' }, 400);
  if (!/[ঀ-৿]/.test(text)) return json({ ok: false, error: 'no_text' }, 400);
  if (!(seconds > 0.5 && seconds <= MAX_SECONDS)) return json({ ok: false, error: 'bad_length' }, 400);
  const audio = b64(p.audio);
  if (!audio || audio.length > MAX_AUDIO) return json({ ok: false, error: 'bad_audio' }, 400);
  const k = kind(audio);
  if (!k) return json({ ok: false, error: 'bad_audio' }, 400);

  // A limited number of sends a day; the address itself is never stored, only a one-way fingerprint
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const day = new Date().toISOString().slice(0, 10);
  if (env.REPORTS) {
    if (!(await hit(env, `voice-all:${day}`, ALL_PER_DAY))) return json({ ok: false, error: 'too_many' }, 429);
    const used = Number(await env.REPORTS.get(`voice-bytes:${day}`)) || 0;
    if (used + audio.length > MB_PER_DAY * 1048576) return json({ ok: false, error: 'too_many' }, 429);
    await env.REPORTS.put(`voice-bytes:${day}`, String(used + audio.length), { expirationTtl: 2 * 86400 });
    if (ip) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`voice|${day}|${ip}`));
      const fp = [...new Uint8Array(digest)].slice(0, 8).map((x) => x.toString(16).padStart(2, '0')).join('');
      if (!(await hit(env, `voice-rate:${day}:${fp}`, PER_DAY))) return json({ ok: false, error: 'too_many' }, 429);
    }
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const base = `v/${contributor}/${String(batch).padStart(2, '0')}-${String(n).padStart(2, '0')}-${stamp}`;
  const meta = {
    text, batch, n, seconds,
    region: clean(p.region, 40), age: clean(p.age, 20), mic: clean(p.mic, 40),
    app: clean(p.app, 60), os: clean(p.os, 60), received: new Date().toISOString(),
  };
  await Promise.all([
    env.VOICE_SAMPLES.put(`${base}.${k[0]}`, audio, { httpMetadata: { contentType: k[1] } }),
    env.VOICE_SAMPLES.put(`${base}.json`, JSON.stringify(meta), { httpMetadata: { contentType: 'application/json' } }),
  ]);
  return json({ ok: true });
}
