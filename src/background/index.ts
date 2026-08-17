/*
 * Service worker: tags each tab with a toolbar badge indicating whether the site is a
 * Shabbat-observant Israeli site, and colors it differently while it is actually Shabbat
 * in Israel.
 */
import { t } from '../i18n/index.ts'
import { sites } from '../lib/dataset.ts'
import { hostFromUrl, matchSite } from '../lib/domain.ts'
import { badgeFor } from '../lib/display.ts'
import { getSettings, onSettingsChanged } from '../lib/settings.ts'
import { getShabbatWindow } from '../lib/shabbat.ts'
import { statusLabel } from '../lib/site.ts'

async function updateBadge(tabId: number, url: string | undefined): Promise<void> {
  const site = matchSite(hostFromUrl(url), sites)
  const settings = await getSettings()
  const win = getShabbatWindow(new Date(), settings.candleOffsetMin, settings.havdalahOffsetMin)

  const badge = badgeFor(site, settings, win.active)

  if (!badge.flagged) {
    await chrome.action.setBadgeText({ tabId, text: '' })
    return
  }

  await chrome.action.setBadgeText({ tabId, text: badge.text })
  await chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color })

  const vars = { name: site!.name, status: statusLabel(site!.status) }
  await chrome.action.setTitle({
    tabId,
    title: badge.shabbatActive ? t('badge.titleShabbat', vars) : t('badge.title', vars),
  })
}

/** A tab can close mid-navigation; a rejected badge update is not worth surfacing. */
function safeUpdate(tabId: number, url: string | undefined): void {
  void updateBadge(tabId, url).catch(() => {})
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) safeUpdate(tabId, tab.url)
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (!chrome.runtime.lastError && tab) safeUpdate(tabId, tab.url)
  })
})

// Re-tag the active tab when settings change (e.g. the confidence threshold moved).
onSettingsChanged(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id !== undefined) safeUpdate(tab.id, tab.url)
  })
})
