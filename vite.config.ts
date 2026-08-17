import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config.ts'

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    // The dataset is bundled into the content script, so a listed page pays for it on
    // every load. Keep the output readable-ish and avoid splitting it further.
    target: 'esnext',
  },
})
