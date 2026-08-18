import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config.ts'

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
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
