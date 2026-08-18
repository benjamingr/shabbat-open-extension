import { describe, expect, it } from 'vitest'
import {
  CONFIDENCE_RANK,
  confidenceLabel,
  isStrong,
  meetsConfidence,
  statusLabel,
} from '../src/lib/site.ts'
import { makeSite } from './helpers.ts'

describe('isStrong', () => {
  it('is true for the three statuses that describe an actual closure', () => {
    for (const status of ['site_blocked', 'purchase_blocked', 'operations_paused'] as const) {
      expect(isStrong(makeSite({ status })), status).toBe(true)
    }
  })

  /*
   * The distinction the whole banner headline turns on: a site that displays an
   * "אתר שומר שבת" badge has not been shown to block anything, so it gets
   * "האתר שומר שבת" rather than "האתר סגור בשבת".
   */
  it('is false for a site that only declares observance', () => {
    expect(isStrong(makeSite({ status: 'declared_shabbat_observant' }))).toBe(false)
  })
})

describe('meetsConfidence', () => {
  it('ranks verified above high above medium', () => {
    expect(CONFIDENCE_RANK.verified).toBeGreaterThan(CONFIDENCE_RANK.high)
    expect(CONFIDENCE_RANK.high).toBeGreaterThan(CONFIDENCE_RANK.medium)
  })

  it('accepts a site at exactly the threshold', () => {
    expect(meetsConfidence(makeSite({ confidence: 'high' }), 'high')).toBe(true)
  })

  it('accepts anything above the threshold and rejects anything below', () => {
    expect(meetsConfidence(makeSite({ confidence: 'verified' }), 'high')).toBe(true)
    expect(meetsConfidence(makeSite({ confidence: 'medium' }), 'high')).toBe(false)
  })

  it('accepts everything at the lowest threshold', () => {
    for (const confidence of ['medium', 'high', 'verified'] as const) {
      expect(meetsConfidence(makeSite({ confidence }), 'medium'), confidence).toBe(true)
    }
  })
})

describe('labels', () => {
  it('resolves a status to its Hebrew label', () => {
    expect(statusLabel('site_blocked')).toBe('האתר נחסם לגלישה בשבת')
  })

  it('resolves a confidence level to its Hebrew label', () => {
    expect(confidenceLabel('verified')).toBe('מאומת')
  })

  it('returns a real string for every status and confidence value', () => {
    // A missing key would fall through to the key itself, which would ship to users as
    // "status.site_blocked" in the banner.
    for (const status of [
      'site_blocked',
      'purchase_blocked',
      'operations_paused',
      'declared_shabbat_observant',
    ] as const) {
      expect(statusLabel(status), status).not.toContain('status.')
    }
    for (const confidence of ['medium', 'high', 'verified'] as const) {
      expect(confidenceLabel(confidence), confidence).not.toContain('confidence.')
    }
  })
})
