// /api/ocr-sample: scanned pages that people corrected in Ekushe Studio and chose to send, so the
// Bangla picture-to-text reader can be trained on real pages.
//
// POST  (from the app, only after the person presses "send" and agrees)
//   { app, os, corrected, original, pages: [{ jpg: <base64 JPEG>, lines: [{ text, bbox }] }] }
//   → { ok: true, id }  |  { ok: false, error }
//   Stored in the R2 bucket as s/<date>/<id>/page-0001.jpg, page-0001.json, corrected.txt,
//   original.txt, meta.json (app version, system, page count, date). No address or name is kept.
// GET   → { ready }: whether samples can be received.
// GET   with "Authorization: Bearer <OCR_ADMIN_KEY>" (for collecting the samples):
//   ?list=1[&cursor=…]  → { objects: [{ key, size }], cursor }
//   ?get=<key>          → the stored file
//
// Settings (Cloudflare Pages → Settings → Bindings / Variables and Secrets):
//   OCR_SAMPLES     R2 bucket binding where samples are kept
//   OCR_ADMIN_KEY   secret: long random text; needed to list and download samples
//   REPORTS         optional KV namespace (already used by /api/report): limits sends per visitor
const PER_DAY = 30;          // sends per visitor per day
const ALL_PER_DAY = 1000;    // sends per day from everyone together
const MB_PER_DAY = 250;      // stored megabytes per day from everyone together (with a 30-day
                             // delete rule on the bucket this stays inside R2's free 10 GB)
const MAX_PAGES = 10;
const MAX_JPG = 4 * 1024 * 1024;
const MAX_TEXT = 300000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
});
const ready = (env) => Boolean(env.OCR_SAMPLES);

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
  if (!ready(env) || !env.OCR_ADMIN_KEY || !(await same(auth, env.OCR_ADMIN_KEY))) return json({ ok: false, error: 'forbidden' }, 403);
  if (url.searchParams.get('list')) {
    const r = await env.OCR_SAMPLES.list({ prefix: 's/', cursor: url.searchParams.get('cursor') || undefined, limit: 1000 });
    return json({ objects: r.objects.map((o) => ({ key: o.key, size: o.size })), cursor: r.truncated ? r.cursor : null });
  }
  const key = url.searchParams.get('get') || '';
  if (!key.startsWith('s/')) return json({ ok: false, error: 'bad_key' }, 400);
  const obj = await env.OCR_SAMPLES.get(key);
  if (!obj) return json({ ok: false, error: 'not_found' }, 404);
  return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'no-store' } });
}

const clean = (s, max) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max);

function b64(s) {
  try {
    const bin = atob(String(s));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (e) { return null; }
}

async function hit(env, key, limit) {
  const n = Number(await env.REPORTS.get(key)) || 0;
  if (n >= limit) return false;
  await env.REPORTS.put(key, String(n + 1), { expirationTtl: 2 * 86400 });
  return true;
}

export async function onRequestPost({ request, env }) {
  if (!ready(env)) return json({ ok: false, error: 'not_ready' }, 503);
  if (Number(request.headers.get('Content-Length') || 0) > (MAX_PAGES * MAX_JPG * 1.4) + 2 * MAX_TEXT) {
    return json({ ok: false, error: 'too_big' }, 413);
  }
  let p;
  try { p = await request.json(); } catch (e) { return json({ ok: false, error: 'bad_request' }, 400); }
  const pages = Array.isArray(p.pages) ? p.pages : [];
  const corrected = clean(p.corrected, MAX_TEXT).trim();
  if (!pages.length || pages.length > MAX_PAGES) return json({ ok: false, error: 'bad_pages' }, 400);
  if (!/[ঀ-৿]/.test(corrected)) return json({ ok: false, error: 'no_text' }, 400);

  const jpgs = [];
  for (const pg of pages) {
    const bytes = b64(pg && pg.jpg);
    if (!bytes || bytes.length > MAX_JPG || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return json({ ok: false, error: 'bad_picture' }, 400);
    const lines = (Array.isArray(pg.lines) ? pg.lines : []).slice(0, 2000).map((l) => ({
      text: clean(l && l.text, 2000),
      bbox: l && l.bbox ? { x0: +l.bbox.x0 || 0, y0: +l.bbox.y0 || 0, x1: +l.bbox.x1 || 0, y1: +l.bbox.y1 || 0 } : null,
    }));
    jpgs.push({ bytes, lines });
  }

  // A limited number of sends a day; the address itself is never stored, only a one-way fingerprint
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const day = new Date().toISOString().slice(0, 10);
  if (env.REPORTS) {
    if (!(await hit(env, `ocr-all:${day}`, ALL_PER_DAY))) return json({ ok: false, error: 'too_many' }, 429);
    const bytes = jpgs.reduce((n, j) => n + j.bytes.length, 0) + corrected.length * 3;
    const used = Number(await env.REPORTS.get(`ocr-bytes:${day}`)) || 0;
    if (used + bytes > MB_PER_DAY * 1048576) return json({ ok: false, error: 'too_many' }, 429);
    await env.REPORTS.put(`ocr-bytes:${day}`, String(used + bytes), { expirationTtl: 2 * 86400 });
    if (ip) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ocr|${day}|${ip}`));
      const fp = [...new Uint8Array(digest)].slice(0, 8).map((x) => x.toString(16).padStart(2, '0')).join('');
      if (!(await hit(env, `ocr-rate:${day}:${fp}`, PER_DAY))) return json({ ok: false, error: 'too_many' }, 429);
    }
  }

  const id = `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}-${crypto.randomUUID().slice(0, 8)}`;
  const base = `s/${day}/${id}/`;
  const put = (name, data, type) => env.OCR_SAMPLES.put(base + name, data, { httpMetadata: { contentType: type } });
  const text = 'text/plain; charset=utf-8';
  await Promise.all([
    ...jpgs.map((j, i) => put(`page-${String(i + 1).padStart(4, '0')}.jpg`, j.bytes, 'image/jpeg')),
    ...jpgs.map((j, i) => put(`page-${String(i + 1).padStart(4, '0')}.json`, JSON.stringify(j.lines), 'application/json')),
    put('corrected.txt', corrected, text),
    put('original.txt', clean(p.original, MAX_TEXT), text),
    put('meta.json', JSON.stringify({ app: clean(p.app, 60), os: clean(p.os, 60), pages: jpgs.length, received: new Date().toISOString() }), 'application/json'),
  ]);
  return json({ ok: true, id });
}
