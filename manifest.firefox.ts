import pkg from './package.json' with { type: 'json' }
import dataset from './data/sites.json' with { type: 'json' }

/**
 * Firefox (Gecko) manifest, for desktop Firefox — published on addons.mozilla.org (AMO).
 *
 * Kept separate from `manifest.config.ts` because that file is built with
 * `@crxjs/vite-plugin`, which targets Chrome: it emits a `service-worker-loader.js`, a
 * content-script loader that dynamic-imports ES-module chunks, and `use_dynamic_url`
 * web-accessible resources — all Chrome-shaped. This manifest is consumed by
 * `vite-plugin-web-extension` (see `vite.config.firefox.ts`), which bundles each entry as
 * a self-contained script that Firefox loads directly, and emits Gecko-native keys.
 *
 * The host match patterns are derived from `data/sites.json` exactly as the Chrome
 * manifest derives them, so the two builds stay scoped to the same listed domains and
 * never to `<all_urls>`. This mirrors the small helper in `manifest.config.ts` and in
 * `scripts/check-manifest.mjs`; `data/sites.json` remains the single source of truth.
 */
function contentScriptMatches(): string[] {
  const domains = new Set(
    dataset.sites.map((site) => site.domain.trim().toLowerCase().replace(/^www\./, '')),
  )
  return [...domains].flatMap((domain) => [`*://${domain}/*`, `*://*.${domain}/*`])
}

export function firefoxManifest() {
  const MATCHES = contentScriptMatches()

  return {
    manifest_version: 3 as const,
    // `__MSG_*__` resolves from _locales, same as the Chrome build.
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'he',
    version: pkg.version,

    // AMO requires an explicit add-on id for a Gecko extension. Desktop Firefox only —
    // no `gecko_android` key, so it is not offered for Firefox for Android.
    browser_specific_settings: {
      gecko: {
        id: 'shabbat-closed@benjamingr.github.io',
        strict_min_version: '115.0',
        // The extension collects nothing and makes no network requests (see PRIVACY.md);
        // `none` states that explicitly for AMO's data-consent flow, which Firefox is
        // making a required manifest key.
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },

    icons: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },

    action: {
      default_title: '__MSG_actionTitle__',
      default_popup: 'src/popup/index.html',
      default_icon: {
        16: 'icons/icon16.png',
        32: 'icons/icon32.png',
        48: 'icons/icon48.png',
        128: 'icons/icon128.png',
      },
    },

    // Firefox prefers `options_ui`; `open_in_tab` keeps the full-page options experience
    // the extension is designed around (and matches Chrome's `options_page`).
    options_ui: {
      page: 'src/options/index.html',
      open_in_tab: true,
    },

    // Same minimal surface as Chrome: no host_permissions, no `<all_urls>`.
    permissions: ['tabs', 'storage'],

    // Desktop Firefox MV3 background as an event page (`scripts`), supported from the
    // strict_min_version above (service-worker backgrounds need a much newer Firefox).
    background: {
      scripts: ['src/background/index.ts'],
    },

    web_accessible_resources: [
      {
        resources: ['src/proof/index.html'],
        matches: MATCHES,
      },
    ],

    content_scripts: [
      {
        matches: MATCHES,
        js: ['src/content/banner.ts'],
        run_at: 'document_idle',
      },
    ],
  }
}

export default firefoxManifest
