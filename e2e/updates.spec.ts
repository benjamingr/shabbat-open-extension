/*
 * The update path, in a real browser.
 *
 * `tests/remote.test.ts` covers the fetch, the validation and the gates against a stubbed
 * `fetch` and a hand-written storage mock. What it cannot prove is that the cached list
 * actually reaches the extension's own pages: that crosses a real `storage.local`, the
 * webextension polyfill, and page code that used to read the list synchronously at module
 * load. So this seeds the cache the way a completed refresh would, and checks the pages.
 *
 * Nothing here touches the network — the point is the plumbing behind the fetch, not the
 * fetch itself.
 */
import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures.ts'

const bundled = JSON.parse(readFileSync('data/sites.json', 'utf8')) as {
  revision: number
  schema_version: string
  sites: Record<string, unknown>[]
}

/** A listing that exists only in the fetched copy — impossible to confuse with the bundle. */
const FETCHED_ONLY = {
  domain: 'fetched-only.co.il',
  name: 'אתר שנוסף בעדכון',
  category: 'test',
  status: 'site_blocked',
  confidence: 'verified',
  holidays: null,
  evidence_text: 'האתר סגור בשבת',
  evidence_url: 'https://fetched-only.co.il/',
  verified: '2026-08-29',
}

function cacheRecord(overrides: Record<string, unknown> = {}): unknown {
  return {
    dataset: {
      ...bundled,
      revision: bundled.revision + 1,
      sites: [...bundled.sites, FETCHED_ONLY],
      ...overrides,
    },
    fetchedAt: Date.now(),
    checkedAt: Date.now(),
    etag: 'W/"e2e"',
    lastError: null,
  }
}

/**
 * Write the cache from inside an extension page, which is the only context with access to
 * `chrome.storage.local` for this extension.
 *
 * Automatic updates are switched off first, so these tests never reach the network: a
 * scheduled check firing in the background would make them depend on GitHub being up and
 * on whatever revision happens to be on `main`.
 */
async function seedCache(
  page: import('@playwright/test').Page,
  record: unknown = cacheRecord(),
): Promise<void> {
  await page.evaluate(async (value) => {
    await chrome.storage.sync.set({ autoUpdate: false })
    await chrome.storage.local.set({ remoteDataset: value })
  }, record)
}

test('the proof page renders a listing that exists only in the fetched list', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/src/options/index.html`)
  await seedCache(page)

  await page.goto(
    `chrome-extension://${extensionId}/src/proof/index.html?domain=fetched-only.co.il`,
  )

  await expect(page.locator('#site-name')).toHaveText('אתר שנוסף בעדכון')
  await expect(page.locator('#evidence-text')).toContainText('סגור בשבת')
  // Definitions come from the fetched dataset too, not the bundled one.
  await expect(page.locator('#status-definition')).not.toBeEmpty()
  await expect(page.locator('#notfound')).toBeHidden()
})

test('the same listing is unknown before the update lands', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(
    `chrome-extension://${extensionId}/src/proof/index.html?domain=fetched-only.co.il`,
  )

  await expect(page.locator('#notfound')).toBeVisible()
  await expect(page.locator('#content')).toBeHidden()
})

test('the options page reports the list as updated, and counts the fetched sites', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/src/options/index.html`)

  // Before: the shipped list.
  await expect(page.locator('#update-stats')).toContainText(String(bundled.revision))
  await expect(page.locator('#data-stats')).toContainText(String(bundled.sites.length))

  await seedCache(page)
  await page.reload()

  await expect(page.locator('#update-stats')).toContainText(String(bundled.revision + 1))
  await expect(page.locator('#data-stats')).toContainText(String(bundled.sites.length + 1))
  await expect(page.locator('#update-error')).toBeHidden()
})

test('a cached list written against a newer schema major is ignored', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/src/options/index.html`)

  // The case this guards: the dataset format moves on, and an extension too old to read it
  // has to keep using what it shipped with rather than render fields it misunderstands.
  await seedCache(page, cacheRecord({ schema_version: '2.0' }))
  await page.reload()

  await expect(page.locator('#data-stats')).toContainText(String(bundled.sites.length))

  await page.goto(
    `chrome-extension://${extensionId}/src/proof/index.html?domain=fetched-only.co.il`,
  )
  await expect(page.locator('#notfound')).toBeVisible()
})

test('turning updates off is remembered', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/src/options/index.html`)

  const toggle = page.locator('#autoUpdate')
  await expect(toggle).toBeChecked()

  await toggle.uncheck()
  await page.reload()

  await expect(page.locator('#autoUpdate')).not.toBeChecked()
})
