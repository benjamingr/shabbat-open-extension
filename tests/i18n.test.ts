import { afterEach, describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'
import he from '../src/i18n/he.json'
import {
  DEFAULT_LANG,
  LANGS,
  dirFor,
  formatDate,
  getLang,
  isLang,
  setLang,
  t,
  translate,
} from '../src/i18n/index.ts'
import type { Lang, MessageKey } from '../src/i18n/index.ts'

const BUNDLES: Record<Lang, Record<string, string>> = { he, en }

// The active language is module state, so a test that changes it has to put it back.
afterEach(() => setLang(DEFAULT_LANG))

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

describe('the active language', () => {
  it('starts as the default', () => {
    expect(getLang()).toBe(DEFAULT_LANG)
  })

  it('is what t() resolves against', () => {
    setLang('en')
    expect(getLang()).toBe('en')
    expect(t('banner.closed')).toBe('This site is closed on Shabbat')
  })

  it('substitutes placeholders in the active language too', () => {
    setLang('en')
    expect(t('banner.headline', { symbol: '⚠️', message: 'test' })).toBe(
      '\u26a0\ufe0f Heads up \u00b7 test \u26a0\ufe0f',
    )
  })

  it('leaves translate() unaffected — it always says which language it wants', () => {
    setLang('en')
    expect(translate('he', 'banner.closed')).toBe('\u05d4\u05d0\u05ea\u05e8 \u05e1\u05d2\u05d5\u05e8 \u05d1\u05e9\u05d1\u05ea')
  })

  it('falls back to the default for a value that is not a language', () => {
    // Storage syncs across machines and versions; an unknown value must not blank the UI.
    setLang('klingon')
    expect(getLang()).toBe(DEFAULT_LANG)
    setLang(undefined)
    expect(getLang()).toBe(DEFAULT_LANG)
  })
})

describe('isLang', () => {
  it('accepts every registered language and nothing else', () => {
    for (const lang of LANGS) expect(isLang(lang)).toBe(true)
    expect(isLang('de')).toBe(false)
    expect(isLang(null)).toBe(false)
    expect(isLang(2)).toBe(false)
  })
})

describe('formatDate', () => {
  it('formats in the active language', () => {
    setLang('en')
    expect(formatDate('2026-08-16')).toBe('16 August 2026')
    setLang('he')
    expect(formatDate('2026-08-16')).toContain('2026')
    expect(formatDate('2026-08-16')).not.toBe(formatDate('2026-08-17'))
  })

  it('hands back an unparseable date rather than "Invalid Date"', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })
})

describe('bundle', () => {
  it('has the same keys in every language', () => {
    // A missing key would silently fall back to Hebrew mid-sentence.
    const expected = Object.keys(he).sort()
    for (const lang of LANGS) {
      expect(Object.keys(BUNDLES[lang]).sort(), `bundle ${lang}`).toEqual(expected)
    }
  })

  it('has no empty strings in any language', () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(BUNDLES[lang])) {
        expect(value.trim(), `${lang} → ${key} is empty`).not.toBe('')
      }
    }
  })

  it('keeps every placeholder a translation is handed', () => {
    // A dropped {name} loses information the caller had no other way to pass in.
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const [key, source] of Object.entries(he)) {
      for (const lang of LANGS) {
        expect(placeholders(BUNDLES[lang][key]!), `${lang} → ${key}`).toEqual(placeholders(source))
      }
    }
  })

  it('names each language in its own language, in both bundles', () => {
    // A reader who cannot read the current UI has to be able to find their own language.
    expect(translate('he', 'settings.languageEn')).toBe(translate('en', 'settings.languageEn'))
    expect(translate('he', 'settings.languageHe')).toBe(translate('en', 'settings.languageHe'))
  })

  it('has a label for every status and confidence level', () => {
    for (const status of [
      'site_blocked',
      'purchase_blocked',
      'operations_paused',
      'declared_shabbat_observant',
    ]) {
      for (const lang of LANGS) expect(BUNDLES[lang]).toHaveProperty(`status.${status}`)
    }
    for (const confidence of ['verified', 'high', 'medium']) {
      for (const lang of LANGS) expect(BUNDLES[lang]).toHaveProperty(`confidence.${confidence}`)
    }
  })

})

describe('dirFor', () => {
  it('is rtl for Hebrew and ltr for English', () => {
    expect(dirFor('he')).toBe('rtl')
    expect(dirFor('en')).toBe('ltr')
  })
})
