/*
 * Service worker: tags each tab with a toolbar badge indicating whether the site is a
 * Shabbat-observant Israeli site, and colors it differently while it is actually Shabbat
 * in Israel.
 */
import '../lib/browser-polyfill.ts'
import { browser } from '../lib/browser.ts'
import { setLang, t } from '../i18n/index.ts'
import { sites } from '../lib/dataset.ts'
import { hostFromUrl, matchSite } from '../lib/domain.ts'
import { badgeFor } from '../lib/display.ts'
import { getSettings, onSettingsChanged } from '../lib/settings.ts'
import { getShabbatWindow } from '../lib/shabbat.ts'
import { statusLabel } from '../lib/site.ts'

async function updateBadge(tabId: number, url: string | undefined): Promise<void> {
  const site = matchSite(hostFromUrl(url), sites)
  const settings = await getSettings()
  // The worker is long-lived and the setting can change under it, so the language is
  // re-read on every badge update rather than once at startup.
  setLang(settings.lang)
  const win = getShabbatWindow(new Date(), settings.candleOffsetMin, settings.havdalahOffsetMin)

  const badge = badgeFor(site, settings, win.active)

  if (!badge.flagged) {
    await browser.action.setBadgeText({ tabId, text: '' })
    return
  }

  await browser.action.setBadgeText({ tabId, text: badge.text })
  await browser.action.setBadgeBackgroundColor({ tabId, color: badge.color })

  const vars = { name: site!.name, status: statusLabel(site!.status) }
  await browser.action.setTitle({
    tabId,
    title: badge.shabbatActive ? t('badge.titleShabbat', vars) : t('badge.title', vars),
  })
}

/** A tab can close mid-navigation; a rejected badge update is not worth surfacing. */
function safeUpdate(tabId: number, url: string | undefined): void {
  void updateBadge(tabId, url).catch(() => {})
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) safeUpdate(tabId, tab.url)
})

browser.tabs.onActivated.addListener(({ tabId }) => {
  // The promise-based API rejects (rather than setting `runtime.lastError`) when the tab
  // has already gone; a dropped badge update there is not worth surfacing.
  void browser.tabs
    .get(tabId)
    .then((tab) => safeUpdate(tabId, tab.url))
    .catch(() => {})
})

// Re-tag the active tab when settings change (e.g. the confidence threshold moved).
onSettingsChanged(() => {
  void browser.tabs
    .query({ active: true, currentWindow: true })
    .then(([tab]) => {
      if (tab?.id !== undefined) safeUpdate(tab.id, tab.url)
    })
    .catch(() => {})
})
