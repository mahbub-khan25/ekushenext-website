// GET /api/latest: the newest published Ekushe Next release (betas included), as
// { tag_name, published_at, html_url, assets: [{ name, size, browser_download_url }] }.
// Asked of GitHub at most every few minutes for everyone, so visitors never hit GitHub's per-visitor
// rate limit and the download buttons always point at the newest files.
const REPO = 'mahbub-khan25/ekushenext';
const FRESH = 300; // seconds

export async function onRequestGet(context) {
  const cache = caches.default;
  const key = new Request(new URL('/api/latest', context.request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  let body, status = 200;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ekushenext.com' },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const list = await res.json();
    const r = list
      .filter((x) => !x.draft && x.published_at && x.assets?.some((a) => a.name === 'Ekushe-Setup.exe'))
      .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0];
    if (!r) throw new Error('no release');
    body = {
      tag_name: r.tag_name,
      published_at: r.published_at,
      html_url: r.html_url,
      assets: r.assets.map(({ name, size, browser_download_url }) => ({ name, size, browser_download_url })),
    };
  } catch (e) {
    body = { error: String(e.message || e) };
    status = 502;
  }
  const out = new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? `public, max-age=${FRESH}` : 'no-store',
    },
  });
  if (status === 200) context.waitUntil(cache.put(key, out.clone()));
  return out;
}
