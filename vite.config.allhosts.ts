import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import { chromeManifest } from './manifest.config.ts'

/**
 * The `<all_urls>` build — same code, same dataset, one match pattern.
 *
 * Identical to `vite.config.ts` apart from the manifest's host scope and the output
 * directory, so the two builds cannot drift: there is one manifest definition and one
 * entry-point list, parameterised. See `ManifestOptions.allHosts` for why this variant
 * exists at all.
 *
 * Built to `dist-allhosts/`, never to `dist/`, so it can never be packed or uploaded by
 * mistake in place of the scoped build.
 */
export default defineConfig({
  plugins: [crx({ manifest: chromeManifest({ allHosts: true }) })],
  build: {
    outDir: 'dist-allhosts',
    target: 'esnext',
    rollupOptions: {
      // crxjs derives its entry points from the manifest, and it only recognises HTML
      // referenced by `action.default_popup` or `options_page`. The proof page is reached
      // through web_accessible_resources, so without this it is copied verbatim and ships
      // with a `<script src="./proof.ts">` that 404s at runtime.
      input: { proof: 'src/proof/index.html' },
    },
  },
})
