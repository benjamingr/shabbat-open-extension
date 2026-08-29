import { test as base, chromium, type BrowserContext } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

/*
 * Which build to load. Defaults to the scoped one; `EXT_DIST=dist-allhosts` runs the same
 * suite against the `<all_urls>` variant, which is how the claim that the two behave
 * identically is actually checked rather than asserted.
 */
const distName = process.env['EXT_DIST'] ?? 'dist'
const extensionPath = join(dirname(fileURLToPath(import.meta.url)), '..', distName)

if (!existsSync(join(extensionPath, 'manifest.json'))) {
  throw new Error(`${distName}/manifest.json not found — build it before the e2e tests.`)
}

/**
 * A fresh persistent context per test with the built extension loaded. Extensions only
 * run in a persistent context; `--headless=new` is the Chromium headless mode that still
 * runs MV3 service workers and content scripts (the old headless did not).
 */
export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    })
    await use(context)
    await context.close()
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers()
    if (!sw) sw = await context.waitForEvent('serviceworker')
    await use(sw.url().split('/')[2] as string)
  },
})

export const expect = test.expect
