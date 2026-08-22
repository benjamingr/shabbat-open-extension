import { defineConfig } from '@playwright/test'

// Smoke tests load the *built* extension (dist/) into Chromium and check the
// content script, popup, and non-listed behaviour. Run `npm run build` first.
// A single worker: the tests share one persistent browser context per test via
// the fixture, and extensions want a real (persistent) context.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
})
