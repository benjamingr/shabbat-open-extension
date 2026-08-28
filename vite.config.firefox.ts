import { defineConfig } from 'vite'
import webExtension from 'vite-plugin-web-extension'
import { firefoxManifest } from './manifest.firefox.ts'

/**
 * Firefox build. Separate from `vite.config.ts` (which uses `@crxjs/vite-plugin`, a
 * Chrome-only toolchain) so `npm run build` stays exactly the Chrome build it was.
 *
 * `vite-plugin-web-extension` bundles every entry point named in the Gecko manifest into
 * a self-contained script — no ES-module content-script loader, no service-worker
 * shim — which is what Firefox (and Firefox for Android) can load directly. Output goes
 * to `dist-firefox/`; `public/` is copied to its root exactly as the Chrome build copies
 * it, so `_locales/`, `icons/`, and the `proof/*.webp` evidence images line up with the
 * paths the manifest and `browser.runtime.getURL` expect.
 *
 *   npm run build:firefox       -> dist-firefox/
 *   npm run lint:firefox        -> web-ext lint dist-firefox/
 *   npm run build:firefox-xpi   -> packaged .zip/.xpi for AMO
 */
const OUT_DIR = 'dist-firefox'

/*
 * The plugin runs each entry point as its own nested `vite build`. Those nested builds
 * must NOT pick up the default `vite.config.ts` (crxjs) — doing so would re-inject the
 * Chrome service-worker/content-script loaders, write into `dist/`, and force the
 * code-splitting that makes an IIFE content script impossible. Pinning `configFile: false`
 * and the shared out dir on both the HTML and the script sub-builds keeps them isolated
 * to this Firefox toolchain.
 */
const subBuildBase = {
  configFile: false as const,
  build: { outDir: OUT_DIR },
}

export default defineConfig({
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    target: 'esnext',
  },
  plugins: [
    webExtension({
      manifest: () => firefoxManifest(),
      browser: 'firefox',
      // The proof page is reached through web_accessible_resources rather than a manifest
      // entry key, so it has to be declared as an extra input to get bundled.
      additionalInputs: ['src/proof/index.html'],
      // web-ext is driven by the dedicated npm scripts, not auto-launched by the build.
      disableAutoLaunch: true,
      // The bundled Chrome-vs-Firefox validity is asserted by `web-ext lint`; the plugin's
      // own schema check does not know about `gecko_android` in older bundled schemas.
      skipManifestValidation: true,
      htmlViteConfig: subBuildBase,
      // Content scripts cannot be ES modules in Firefox, so each script is emitted as a
      // single-entry IIFE with the webextension-polyfill inlined (Vite's lib mode disables
      // code-splitting for these on its own once crxjs is out of the picture).
      scriptViteConfig: subBuildBase,
    }),
  ],
})
