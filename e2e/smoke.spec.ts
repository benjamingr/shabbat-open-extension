import { test, expect } from './fixtures.ts'

// A neutral storefront page. We serve it *as* a listed / unlisted domain via request
// interception, so the content script's match patterns decide whether it injects — no
// external demo URL and no live network needed.
const STORE_HTML =
  '<!doctype html><html lang="he"><head><meta charset="utf-8"><title>test store</title></head>' +
  '<body><header>חנות לדוגמה</header><main>מוצרים</main></body></html>'

const serve = (body: string) => (route: import('@playwright/test').Route) =>
  route.fulfill({ contentType: 'text/html; charset=utf-8', body })

test('injects the "closed on Shabbat" banner on a listed site', async ({ context }) => {
  const page = await context.newPage()
  // or-ad.com is a site_blocked / verified entry, so it clears the default confidence gate.
  await page.route(/(^|\/\/|\.)or-ad\.com\//, serve(STORE_HTML))
  await page.goto('https://or-ad.com/', { waitUntil: 'load' })

  const banner = page.locator('#shabbat-closed-banner')
  await expect(banner).toHaveCount(1)
  // Headline lives in an open shadow root; Playwright pierces it automatically.
  await expect(page.locator('.scb-headline')).toContainText('סגור בשבת')
})

test('does not inject a banner on an unlisted site', async ({ context }) => {
  const page = await context.newPage()
  await page.route(/(^|\/\/|\.)example\.org\//, serve(STORE_HTML))
  await page.goto('https://example.org/', { waitUntil: 'load' })
  await page.waitForTimeout(800) // give any content script a chance to run
  await expect(page.locator('#shabbat-closed-banner')).toHaveCount(0)
})

test('the popup page renders', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`)
  await expect(page.locator('body')).toContainText('סגור בשבת')
})
