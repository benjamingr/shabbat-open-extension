/*
 * Content script: injected only on domains listed in the dataset (see the generated match
 * patterns in the manifest). Decides whether to show the "closed on Shabbat" banner for
 * the current site.
 */
import { t } from '../i18n/index.ts'
import { sites } from '../lib/dataset.ts'
import { matchSite, normalizeHost } from '../lib/domain.ts'
import { getSettings } from '../lib/settings.ts'
import { getShabbatWindow } from '../lib/shabbat.ts'
import { isStrong, meetsConfidence, statusLabel } from '../lib/site.ts'
import type { Settings, Site } from '../types.ts'

const BANNER_ID = 'shabbat-closed-banner'

async function main(): Promise<void> {
  const site = matchSite(location.hostname, sites)
  if (!site) return // shouldn't happen given the match patterns, but be safe

  const settings = await getSettings()
  if (!settings.enabled) return
  if (!meetsConfidence(site, settings.minConfidence)) return

  // Respect a per-tab dismissal for this host.
  const dismissKey = 'shabbatClosedDismissed:' + normalizeHost(location.hostname)
  try {
    if (sessionStorage.getItem(dismissKey) === '1') return
  } catch {
    // sessionStorage can be blocked by the page's storage partitioning; ignore.
  }

  // The banner always shows on a listed site — the alert is most useful *before* Shabbat,
  // since during Shabbat the site being closed is self-evident.
  renderBanner(site, settings, dismissKey)
}

function renderBanner(site: Site, settings: Settings, dismissKey: string): void {
  if (document.getElementById(BANNER_ID)) return

  const win = getShabbatWindow(new Date(), settings.candleOffsetMin, settings.havdalahOffsetMin)

  const el = document.createElement('div')
  el.id = BANNER_ID
  el.dir = 'rtl'
  el.setAttribute('role', 'status')
  el.setAttribute('aria-live', 'polite')
  el.className = 'shabbat-closed-banner' + (win.active ? ' is-active' : '')

  const symbol = settings.alertSymbol || '⚠️'

  const text = document.createElement('div')
  text.className = 'scb-text'

  const headline = document.createElement('div')
  headline.className = 'scb-headline'
  headline.textContent = t('banner.headline', {
    symbol,
    message: t(isStrong(site) ? 'banner.closed' : 'banner.observant'),
  })

  const sub = document.createElement('div')
  sub.className = 'scb-sub'
  sub.textContent = statusLabel(site.status)

  text.append(headline, sub)

  const spacer = document.createElement('div')
  spacer.className = 'scb-spacer'

  const actions = document.createElement('div')
  actions.className = 'scb-actions'

  if (site.evidence_url) {
    const link = document.createElement('a')
    link.className = 'scb-link'
    link.href = site.evidence_url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = t('banner.source')
    if (site.evidence_text) link.title = site.evidence_text
    actions.append(link)
  }

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'scb-close'
  close.setAttribute('aria-label', t('banner.closeAria'))
  close.textContent = '✕'
  close.addEventListener('click', dismiss)
  actions.append(close)

  el.append(text, spacer, actions)
  ;(document.body || document.documentElement).append(el)

  // Push the page down so the banner doesn't cover the site's own header.
  applyOffset(el)

  function dismiss(): void {
    try {
      sessionStorage.setItem(dismissKey, '1')
    } catch {
      // Nothing to do — the banner still closes for this page view.
    }
    clearOffset()
    el.remove()
  }
}

/**
 * Keep a top offset on <html> equal to the banner's height, tracking wraps and viewport
 * changes via ResizeObserver.
 */
let ro: ResizeObserver | null = null

function applyOffset(el: HTMLElement): void {
  const root = document.documentElement
  root.dataset['scbPrevPad'] = root.style.getPropertyValue('padding-top')

  const sync = (): void => {
    root.style.setProperty('padding-top', el.offsetHeight + 'px', 'important')
  }
  sync()

  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(sync)
    ro.observe(el)
  } else {
    window.addEventListener('resize', sync)
  }
}

function clearOffset(): void {
  const root = document.documentElement
  if (ro) {
    ro.disconnect()
    ro = null
  }
  const prev = root.dataset['scbPrevPad'] || ''
  if (prev) root.style.setProperty('padding-top', prev)
  else root.style.removeProperty('padding-top')
  delete root.dataset['scbPrevPad']
}

void main()
