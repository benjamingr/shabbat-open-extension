import { describe, expect, it } from 'vitest'
import {
  BADGE_COLOR_SHABBAT,
  BADGE_COLOR_STRONG,
  BADGE_COLOR_WEAK,
  badgeFor,
  isFlagged,
  shouldShowBanner,
} from '../src/lib/display.ts'
import { makeSettings, makeSite } from './helpers.ts'

describe('isFlagged', () => {
  it('flags a listed site that clears the threshold', () => {
    expect(isFlagged(makeSite(), makeSettings())).toBe(true)
  })

  it('does not flag an unlisted site', () => {
    expect(isFlagged(null, makeSettings())).toBe(false)
    expect(isFlagged(undefined, makeSettings())).toBe(false)
  })

  it('does not flag anything while the extension is off', () => {
    expect(isFlagged(makeSite(), makeSettings({ enabled: false }))).toBe(false)
  })

  it('does not flag a site below the confidence threshold', () => {
    const site = makeSite({ confidence: 'medium' })
    expect(isFlagged(site, makeSettings({ minConfidence: 'verified' }))).toBe(false)
    expect(isFlagged(site, makeSettings({ minConfidence: 'high' }))).toBe(false)
    expect(isFlagged(site, makeSettings({ minConfidence: 'medium' }))).toBe(true)
  })

  it('treats the threshold as "this level or better"', () => {
    const settings = makeSettings({ minConfidence: 'high' })
    expect(isFlagged(makeSite({ confidence: 'verified' }), settings)).toBe(true)
    expect(isFlagged(makeSite({ confidence: 'high' }), settings)).toBe(true)
    expect(isFlagged(makeSite({ confidence: 'medium' }), settings)).toBe(false)
  })
})

describe('shouldShowBanner', () => {
  it('shows on a flagged site that has not been dismissed', () => {
    expect(shouldShowBanner(makeSite(), makeSettings(), false)).toBe(true)
  })

  it('is suppressed by a session dismissal', () => {
    expect(shouldShowBanner(makeSite(), makeSettings(), true)).toBe(false)
  })

  it('is suppressed by a permanent dismissal of the listed domain', () => {
    const settings = makeSettings({ dismissedDomains: ['example.co.il'] })
    expect(shouldShowBanner(makeSite(), settings, false)).toBe(false)
  })

  it('normalizes the listed domain before comparing', () => {
    // A dismissal recorded before normalization tightened up must still apply.
    const site = makeSite({ domain: 'www.Example.co.il' })
    const settings = makeSettings({ dismissedDomains: ['example.co.il'] })
    expect(shouldShowBanner(site, settings, false)).toBe(false)
  })

  it('is not suppressed by an unrelated dismissal', () => {
    const settings = makeSettings({ dismissedDomains: ['other.co.il'] })
    expect(shouldShowBanner(makeSite(), settings, false)).toBe(true)
  })

  it('never shows for something the shared gate rejects', () => {
    expect(shouldShowBanner(null, makeSettings(), false)).toBe(false)
    expect(shouldShowBanner(makeSite(), makeSettings({ enabled: false }), false)).toBe(false)
  })
})

describe('badgeFor', () => {
  it('is green for a site with a real closure', () => {
    const badge = badgeFor(makeSite({ status: 'site_blocked' }), makeSettings(), false)
    expect(badge).toMatchObject({ flagged: true, color: BADGE_COLOR_STRONG })
  })

  it('is grey for a site that only declares observance', () => {
    const site = makeSite({ status: 'declared_shabbat_observant' })
    expect(badgeFor(site, makeSettings(), false)).toMatchObject({ color: BADGE_COLOR_WEAK })
  })

  it('is gold during Shabbat, whatever the status', () => {
    for (const status of ['site_blocked', 'declared_shabbat_observant'] as const) {
      expect(badgeFor(makeSite({ status }), makeSettings(), true)).toMatchObject({
        color: BADGE_COLOR_SHABBAT,
      })
    }
  })

  it('clears for an unlisted site', () => {
    expect(badgeFor(null, makeSettings(), false)).toEqual({ flagged: false })
  })

  /*
   * The regression that motivated extracting this. The badge used to consult neither
   * setting, so a suppressed site stayed dotted and tooltipped in the toolbar.
   */
  it('clears when the extension is off', () => {
    expect(badgeFor(makeSite(), makeSettings({ enabled: false }), false)).toEqual({
      flagged: false,
    })
  })

  it('clears for a site below the confidence threshold', () => {
    const site = makeSite({ confidence: 'medium' })
    expect(badgeFor(site, makeSettings({ minConfidence: 'verified' }), false)).toEqual({
      flagged: false,
    })
  })

  it('agrees with the banner on every combination of the shared gate', () => {
    // The two must never disagree about whether a site counts as flagged. Dismissals are
    // excluded here because they are the banner's alone.
    const settings = makeSettings({ dismissedDomains: [] })
    for (const enabled of [true, false]) {
      for (const minConfidence of ['medium', 'high', 'verified'] as const) {
        for (const confidence of ['medium', 'high', 'verified'] as const) {
          const site = makeSite({ confidence })
          const s = makeSettings({ ...settings, enabled, minConfidence })
          expect(badgeFor(site, s, false).flagged, `${enabled} ${minConfidence} ${confidence}`)
            .toBe(shouldShowBanner(site, s, false))
        }
      }
    }
  })
})
