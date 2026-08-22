# Porting to Firefox (and Firefox for Android)

The extension ships from a single codebase to two targets:

| Target  | Build tool                | Output          | Store            |
| ------- | ------------------------- | --------------- | ---------------- |
| Chrome  | `@crxjs/vite-plugin`      | `dist/`         | Chrome Web Store |
| Firefox | `vite-plugin-web-extension` | `dist-firefox/` | AMO              |

The Firefox package is what installs on **Firefox for Android** — that is the only real
Android path, because Chrome for Android does not support extensions at all.

Nothing here changes the Chrome build: `npm run build` is byte-for-byte the same crxjs
build it always was, and `npm test` / `npm run typecheck` / `npm run validate` are
unchanged.

## How one codebase runs on both engines

WebExtension APIs differ between engines: Chrome exposes a callback-based `chrome.*`,
Firefox a promise-based `browser.*`. The source calls **`browser.*` everywhere**, through
a thin shim:

- **`src/lib/browser.ts`** — a lazy Proxy that resolves to `globalThis.browser`
  (Firefox's native, promise-based API) or `globalThis.chrome` (Chrome). Resolution is
  lazy so the unit tests, which install a promise-based `chrome` stand-in per test, keep
  working untouched.
- **`src/lib/browser-polyfill.ts`** — a side-effect module imported first by every entry
  point (background, content script, popup, options, proof). On Chrome it installs the
  [`webextension-polyfill`](https://github.com/mozilla/webextension-polyfill) wrapper onto
  `globalThis.browser`, giving Chrome the same promise-based surface. On Firefox `browser`
  already exists, so it is a no-op. It lives apart from `browser.ts` because importing the
  polyfill throws outside a real extension, and the shared library modules that the tests
  import must never pull it in.

No `chrome.*` call remains in `src/` (comments aside).

## The Firefox manifest and build

- **`manifest.firefox.ts`** — a Gecko MV3 manifest. It carries
  `browser_specific_settings.gecko` (the AMO add-on `id` + `data_collection_permissions`)
  and `browser_specific_settings.gecko_android` (what makes it installable on Firefox for
  Android). Background is an **event page** (`background.scripts`), not a service worker —
  service workers do not run on Firefox for Android. Host access is the same set of
  content-script match patterns generated from `data/sites.json` as the Chrome build:
  minimal `tabs` + `storage` permissions, never `<all_urls>`.
- **`vite.config.firefox.ts`** — builds to `dist-firefox/` with `vite-plugin-web-extension`.
  Each background/content script is emitted as a self-contained IIFE (Firefox content
  scripts cannot be ES modules), with the polyfill inlined. The plugin's nested sub-builds
  are pinned to `configFile: false` so they do not pick up the crxjs config.

## Commands

```bash
npm run build           # Chrome  -> dist/           (unchanged)
npm run build:firefox   # Firefox -> dist-firefox/
npm run lint:firefox    # web-ext lint dist-firefox/  (must pass: 0 errors)
npm run build:firefox-xpi   # package dist-firefox/ -> release/*.zip for AMO
```

`build:firefox` runs `validate` + `tsc --noEmit` first, exactly like `build`.

## Testing locally with web-ext

Run the built extension in a throwaway Firefox profile:

```bash
# Desktop Firefox
npx web-ext run --source-dir dist-firefox

# Firefox for Android (device or emulator over adb; Firefox for Android installed)
npx web-ext run --source-dir dist-firefox \
  --target firefox-android \
  --android-device <adb-device-id>
```

`web-ext run` reloads on changes; re-run `npm run build:firefox` to rebuild the bundle.

## Submitting to AMO

1. `npm run build:firefox && npm run lint:firefox` — lint must report **0 errors**.
2. `npm run build:firefox-xpi` — produces `release/_closed_on_shabbat-<version>.zip`.
3. Upload that zip at <https://addons.mozilla.org/developers/> (Developer Hub → Submit a
   New Add-on). AMO signs it and, because the manifest declares `gecko_android`, offers it
   for **Firefox for Android** as well.
4. Because the source is bundled/minified, AMO review requires a **source-code
   submission**. Provide this repository and the build steps above (Node, `npm ci`,
   `npm run build:firefox`).
5. Keep the `browser_specific_settings.gecko.id`
   (`shabbat-closed@benjamingr.github.io`) stable across releases — it is the add-on's
   identity on AMO.

### Privacy posture AMO review checks

The extension is a good AMO citizen by construction, and the manifest says so:

- **No network requests, no telemetry, no analytics, no remote code.** All logic and data
  are local; the dataset is bundled. See [`PRIVACY.md`](./PRIVACY.md).
- `browser_specific_settings.gecko.data_collection_permissions.required` is `["none"]`,
  the explicit "collects no data" declaration for Firefox's data-consent flow.
- Host access is scoped to the listed domains only (never `<all_urls>`), and permissions
  are just `tabs` + `storage`, used only to check the current URL against the local list
  and to store user preferences.

The one outbound action — the "report a site" / "appeal" links — opens an external form in
a new tab only on an explicit user click, and is described in `PRIVACY.md`.

## Installing on Firefox for Android (for users)

Once the add-on is public on AMO:

1. Install **Firefox** for Android from the Play Store (the standard release supports
   add-ons; Chrome for Android cannot run extensions).
2. Open the add-on's AMO listing (`https://addons.mozilla.org/...`) in Firefox for
   Android and tap **Add to Firefox**, or go to **Menu → Add-ons → Add-ons manager** and
   find it there.
3. Grant the requested permissions. The toolbar badge, popup, and on-site banner behave
   the same as on desktop.

Before public listing, a build can be tried on Android via `web-ext run --target
firefox-android` (above) or by installing a self-signed/unlisted xpi.

## Known limitations / follow-ups

- The Firefox `gecko.strict_min_version` (`115.0`) and `gecko_android`
  (`120.0`) are conservative floors; raise or lower them once tested against specific
  Firefox for Android versions.
- E2E (`npm run test:e2e`) currently drives the Chrome build only; a Firefox/`web-ext`
  e2e lane is not set up.
- CI builds only Chrome today; add a `build:firefox` + `lint:firefox` job to guard the
  Firefox target on every push.
