import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json' with { type: 'json' }
import dataset from './data/sites.json' with { type: 'json' }

/**
 * Host access is scoped to the listed domains, never `<all_urls>`: the patterns below are
 * derived from `data/sites.json` at build time, so the extension can only ever run on
 * sites it actually has a claim about. Adding a site to the dataset is what grants
 * access to it — there is no second place to update.
 *
 * The trade-off is that the patterns are no longer visible in a git diff of the manifest,
 * because the manifest itself is now generated. `npm run validate` prints the count.
 */
function contentScriptMatches(): string[] {
  const domains = new Set(
    dataset.sites.map((site) => site.domain.trim().toLowerCase().replace(/^www\./, '')),
  )
  return [...domains].flatMap((domain) => [`*://${domain}/*`, `*://*.${domain}/*`])
}

export default defineManifest({
  manifest_version: 3,
  name: 'סגור בשבת — Closed on Shabbat',
  description: 'מסמן אתרי מסחר ישראליים שומרי שבת ומציג באנר: האתר הזה סגור בשבת.',
  version: pkg.version,

  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },

  action: {
    default_title: 'סגור בשבת — סטטוס האתר',
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  },

  permissions: ['tabs', 'storage'],

  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },

  content_scripts: [
    {
      matches: contentScriptMatches(),
      js: ['src/content/banner.ts'],
      css: ['src/content/banner.css'],
      run_at: 'document_idle',
    },
  ],
})
