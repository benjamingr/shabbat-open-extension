/*
 * What the extension shows, as pure decisions.
 *
 * The badge and the banner have to agree about when a site counts as flagged — they
 * disagreed once already, which is how a site below the confidence threshold ended up
 * badged but not bannered. Keeping the rule in one place, with no chrome.* or DOM around
 * it, is what makes that agreement checkable.
 */
import { normalizeHost } from './domain.ts'
import { isStrong, meetsConfidence } from './site.ts'
import type { Settings, Site } from '../types.ts'

export const BADGE_TEXT = '●'
export const BADGE_COLOR_SHABBAT = '#c9a227'
export const BADGE_COLOR_STRONG = '#2f7d4f'
export const BADGE_COLOR_WEAK = '#8a8a8a'

/**
 * The shared gate. Below it the extension says nothing at all: no badge, no banner.
 * Note this is not about dismissals — those silence the notice only.
 */
export function isFlagged(site: Site | null | undefined, settings: Settings): boolean {
  if (!site) return false
  if (!settings.enabled) return false
  return meetsConfidence(site, settings.minConfidence)
}

/**
 * @param sessionDismissed the per-tab "not right now" flag, read from sessionStorage by
 *   the caller — this stays out of here so the decision has no I/O in it.
 */
export function shouldShowBanner(
  site: Site | null | undefined,
  settings: Settings,
  sessionDismissed: boolean,
): boolean {
  if (!isFlagged(site, settings)) return false
  if (settings.dismissedDomains.includes(normalizeHost(site!.domain))) return false
  return !sessionDismissed
}

export type BadgeState =
  | { flagged: false }
  | { flagged: true; text: string; color: string; shabbatActive: boolean }

export function badgeFor(
  site: Site | null | undefined,
  settings: Settings,
  shabbatActive: boolean,
): BadgeState {
  if (!isFlagged(site, settings)) return { flagged: false }

  // Gold takes precedence over both green and grey: "it is Shabbat right now" is the more
  // urgent fact, whatever the site's status.
  const color = shabbatActive
    ? BADGE_COLOR_SHABBAT
    : isStrong(site!)
      ? BADGE_COLOR_STRONG
      : BADGE_COLOR_WEAK

  return { flagged: true, text: BADGE_TEXT, color, shabbatActive }
}
