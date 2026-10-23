# ekushenext.com

The website for [Ekushe Next](https://github.com/mahbub-khan25/ekushenext), a free and open-source Bangla keyboard for Windows, macOS and Linux.

It's a static site with no build step: everything Cloudflare Pages serves is in `site/`.

- The hero, the feature examples, the speed test and the Bijoy converter all run Ekushe Next's real engine in the browser. It's ekushe-core compiled to WebAssembly (`site/engine/ekushe.wasm`) with a smaller 30,000-word dictionary (`site/engine/ekushe-web.dict.z`, about 1.7 MB).
- Download buttons always point at the newest published release (betas included), picking the right file for the visitor's computer. They ask `/api/latest` (a Cloudflare Pages Function in `functions/api/latest.js` that asks GitHub at most every five minutes for everyone), then GitHub's API directly, and only if both fail use the release listed in `site/js/main.js`.
- **Opening the downloads:** until launch, download buttons are greyed out ("coming soon") and links to the release files are hidden. To open them, set `LAUNCHED = true` in `site/js/launch.js` and push. Nothing else needs changing at launch or at later releases.
- The page is in Bangla, and the English text is in `site/js/i18n.js`.

## Deploying on Cloudflare Pages

Connect this repository in **Workers & Pages → Create → Pages → Connect to Git**, and set:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Build command | *(leave empty)* |
| Build output directory | `site` |

Every push to `main` then updates the site. `site/_headers` sets the security and caching headers.

## Rebuilding the engine

You only need to do this after the engine changes in the main repository. Clone both repositories side by side (`ekushenext/` and `ekushenext-website/`), then run:

```sh
./engine/build.sh
```

It builds the WebAssembly engine and the small dictionary, and copies both into `site/engine/`.

## Licence

Code is MPL-2.0, like Ekushe Next. The dictionary data is CC BY-SA 4.0. The fonts (Anek Bangla, Hind Siliguri, Inter Tight) are under the SIL Open Font License; see `site/fonts/`.
