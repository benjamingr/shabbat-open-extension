import { describe, expect, it } from 'vitest'
import he from '../src/i18n/he.json'
import { dirFor, t, translate } from '../src/i18n/index.ts'
import type { MessageKey } from '../src/i18n/index.ts'

describe('translate', () => {
  it('returns the bundle string', () => {
    expect(t('banner.closed')).toBe('האתר סגור בשבת')
  })

  it('substitutes named placeholders', () => {
    expect(t('banner.headline', { symbol: '⚠️', message: 'בדיקה' })).toBe(
      '⚠️ שימו לב · בדיקה ⚠️',
    )
  })

  it('substitutes the same placeholder everywhere it appears', () => {
    const out = t('settings.alertSymbolPreview', { symbol: '🕯️' })
    expect(out.match(/🕯️/g)).toHaveLength(2)
  })

  it('leaves a placeholder alone when no value is supplied', () => {
    // Better a visible {date} than a string reading "נבדק ב-undefined".
    expect(t('proof.verifiedOn')).toContain('{date}')
    expect(t('proof.verifiedOn', {})).toContain('{date}')
  })

  it('coerces numeric values', () => {
    expect(translate('he', 'proof.verifiedOn', { date: 2026 })).toContain('2026')
  })

  it('falls back to the key itself for an unknown one', () => {
    expect(translate('he', 'no.such.key' as MessageKey)).toBe('no.such.key')
  })
})

describe('bundle', () => {
  it('has a label for every status and confidence level', () => {
    for (const status of [
      'site_blocked',
      'purchase_blocked',
      'operations_paused',
      'declared_shabbat_observant',
    ]) {
      expect(he).toHaveProperty(`status.${status}`)
    }
    for (const confidence of ['verified', 'high', 'medium']) {
      expect(he).toHaveProperty(`confidence.${confidence}`)
    }
  })

  it('has no empty strings', () => {
    for (const [key, value] of Object.entries(he)) {
      expect(value.trim(), `${key} is empty`).not.toBe('')
    }
  })
})

describe('dirFor', () => {
  it('is rtl for Hebrew', () => {
    expect(dirFor('he')).toBe('rtl')
  })
})
