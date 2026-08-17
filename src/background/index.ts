/*
 * Service worker: tags each tab with a toolbar badge indicating whether the site is a
 * Shabbat-observant Israeli site, and colors it differently while it is actually Shabbat
 * in Israel.
 */
import { sites } from '../lib/dataset.ts'
import { hostFromUrl, matchSite } from '../lib/domain.ts'
import { getSettings, onSettingsChanged } from '../lib/settings.ts'
import { getShabbatWindow } from '../lib/shabbat.ts'
import { isStrong, STATUS_LABEL_HE } from '../lib/site.ts'

const BADGE_SHABBAT = '#c9a227'
const BADGE_STRONG = '#2f7d4f'
const BADGE_WEAK = '#8a8a8a'

async function updateBadge(tabId: number, url: string | undefined): Promise<void> {
  const site = matchSite(hostFromUrl(url), sites)

  if (!site) {
    await chrome.action.setBadgeText({ tabId, text: '' })
    return
  }

  const settings = await getSettings()
  const win = getShabbatWindow(new Date(), settings.candleOffsetMin, settings.havdalahOffsetMin)

  await chrome.action.setBadgeText({ tabId, text: '●' })
  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: win.active ? BADGE_SHABBAT : isStrong(site) ? BADGE_STRONG : BADGE_WEAK,
  })

  const statusHe = STATUS_LABEL_HE[site.status]
  await chrome.action.setTitle({
    tabId,
    title: win.active
      ? `${site.name} — ${statusHe}\nכעת שבת בישראל`
      : `${site.name} — ${statusHe}`,
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
