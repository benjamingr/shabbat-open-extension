# Porting to Firefox (desktop)

The extension ships from a single codebase to two targets:

| Target  | Build tool                  | Output          | Store            |
| ------- | --------------------------- | --------------- | ---------------- |
| Chrome  | `@crxjs/vite-plugin`        | `dist/`         | Chrome Web Store |
| Firefox | `vite-plugin-web-extension` | `dist-firefox/` | AMO (desktop)    |

This targets **desktop Firefox** only. Firefox for Android is intentionally out of scope
for now (the manifest carries no `gecko_android` key); see [`PLATFORMS.md`](./PLATFORMS.md)
for the mobile plan.

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
  `browser_specific_settings.gecko` (the AMO add-on `id`, a `strict_min_version` of
  `115.0`, and `data_collection_permissions: { required: ["none"] }`). Background is an
  **event page** (`background.scripts`), not a service worker — event pages are supported
  from the min-version floor. Host access is the same set of content-script match patterns
  generated from `data/sites.json` as the Chrome build: minimal `tabs` + `storage`
  permissions, never `<all_urls>`.
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

`build:firefox` runs `validate` + `tsc --noEmit` first, exactly like `build`. CI runs
`build:firefox` + `lint:firefox` on every push and PR (see `.github/workflows/ci.yml`).

## Testing locally with web-ext

Run the built extension in a throwaway desktop-Firefox profile:

```bash
npx web-ext run --source-dir dist-firefox
```

`web-ext run` reloads on changes; re-run `npm run build:firefox` to rebuild the bundle.

## Submitting to AMO

1. `npm run build:firefox && npm run lint:firefox` — lint must report **0 errors**.
2. `npm run build:firefox-xpi` — produces `release/_closed_on_shabbat-<version>.zip`.
3. Upload that zip at <https://addons.mozilla.org/developers/> (Developer Hub → Submit a
   New Add-on) for **Firefox desktop**.
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

## Follow-ups

- **Firefox for Android** is not built (no `gecko_android` key). Adding it later is a small
  manifest change; the mobile plan is in [`PLATFORMS.md`](./PLATFORMS.md).
- E2E (`npm run test:e2e`) drives the Chrome build only; a Firefox/`web-ext` e2e lane is
  not set up yet.
