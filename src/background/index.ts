/*
 * Service worker: tags each tab with a toolbar badge indicating whether the site is a
 * Shabbat-observant Israeli site, and colors it differently while it is actually Shabbat
 * in Israel.
 */
import { t } from '../i18n/index.ts'
import { sites } from '../lib/dataset.ts'
import { hostFromUrl, matchSite } from '../lib/domain.ts'
import { getSettings, onSettingsChanged } from '../lib/settings.ts'
import { getShabbatWindow } from '../lib/shabbat.ts'
import { isStrong, meetsConfidence, statusLabel } from '../lib/site.ts'

const BADGE_SHABBAT = '#c9a227'
const BADGE_STRONG = '#2f7d4f'
const BADGE_WEAK = '#8a8a8a'

async function updateBadge(tabId: number, url: string | undefined): Promise<void> {
  const site = matchSite(hostFromUrl(url), sites)
  const settings = await getSettings()

  // The confidence threshold gates the badge as well as the banner. Gating only the
  // banner left a site below the threshold silently badged and tooltipped, which is
  // exactly what "אתרים מתחת לסף לא יתויגו" promises not to happen.
  if (!site || !settings.enabled || !meetsConfidence(site, settings.minConfidence)) {
    await chrome.action.setBadgeText({ tabId, text: '' })
    return
  }

  const win = getShabbatWindow(new Date(), settings.candleOffsetMin, settings.havdalahOffsetMin)

  await chrome.action.setBadgeText({ tabId, text: '●' })
  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: win.active ? BADGE_SHABBAT : isStrong(site) ? BADGE_STRONG : BADGE_WEAK,
  })

  const vars = { name: site.name, status: statusLabel(site.status) }
  await chrome.action.setTitle({
    tabId,
    title: win.active ? t('badge.titleShabbat', vars) : t('badge.title', vars),
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
