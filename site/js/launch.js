// The one switch for opening downloads, used by every page.
// false: download buttons are greyed out ("coming soon") and links to the files are hidden.
// true: downloads are open, and always point at the newest release.
export const LAUNCHED = true;

const REPO = 'mahbub-khan25/ekushenext';
if (LAUNCHED) document.documentElement.classList.add('live');

const slim = (r) => ({
  tag_name: r.tag_name, published_at: r.published_at, html_url: r.html_url,
  assets: r.assets.map(({ name, size, browser_download_url }) => ({ name, size, browser_download_url })),
});
const usable = (r) => r && !r.draft && r.published_at && r.assets?.some((a) => a.name === 'Ekushe-Setup.exe');

// The newest release: from this site's /api/latest (cached for everyone), else straight from GitHub,
// else `fallback` (the release the site was last updated with). Whichever is newest wins.
export async function latestRelease(fallback) {
  try {
    const c = JSON.parse(sessionStorage.getItem('ekushe-release') || 'null');
    if (c && Date.now() - c.at < 5 * 60e3 && usable(c.r)) return c.r;
  } catch (e) { /* no storage */ }
  const tries = [
    async () => { const r = await fetch('/api/latest', { cache: 'no-cache' }); if (!r.ok) throw 0; return r.json(); },
    async () => {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw 0;
      return (await r.json()).filter(usable).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0];
    },
  ];
  for (const t of tries) {
    try {
      const r = await t();
      if (!usable(r)) continue;
      const best = Date.parse(r.published_at) >= Date.parse(fallback.published_at) ? slim(r) : fallback;
      try { sessionStorage.setItem('ekushe-release', JSON.stringify({ at: Date.now(), r: best })); } catch (e) { /* no storage */ }
      return best;
    } catch (e) { /* try the next */ }
  }
  return fallback;
}
