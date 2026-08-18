import he from './he.json'

/**
 * Every user-visible string lives in a bundle here, not inline in the code.
 *
 * `chrome.i18n` is deliberately not used for these: it picks its locale from the browser
 * and cannot be overridden at runtime, so it could never honour a language *setting*.
 * It is used only for the manifest's store-facing name and description, which Chrome
 * reads before any of this code runs (see `public/_locales`).
 *
 * Hebrew is currently the only bundle. Adding one is a drop-in: add `en.json` with the
 * same keys, extend `Lang`, and register it in `BUNDLES`.
 */
const BUNDLES = { he } as const

export type Lang = keyof typeof BUNDLES
export type MessageKey = keyof typeof he

export const DEFAULT_LANG: Lang = 'he'

/** `{name}` placeholders are replaced from `vars`; an unmatched one is left as-is. */
export function translate(
  lang: Lang,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const template: string = BUNDLES[lang][key] ?? BUNDLES[DEFAULT_LANG][key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}

/** Translate in the active language. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(DEFAULT_LANG, key, vars)
}

export function dirFor(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'he' ? 'rtl' : 'ltr'
}

/**
 * Fill every `[data-i18n]` element in a document from the bundle, so page chrome
 * (headings, labels, option text) does not have to be built in script.
 *
 * `data-i18n` sets textContent; `data-i18n-attr="title:key,aria-label:key"` sets
 * attributes.
 */
export function applyStaticStrings(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset['i18n'] as MessageKey | undefined
    if (key) el.textContent = t(key)
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-attr]')) {
    for (const pair of (el.dataset['i18nAttr'] ?? '').split(',')) {
      const [attr, key] = pair.split(':').map((s) => s.trim())
      if (attr && key) el.setAttribute(attr, t(key as MessageKey))
    }
  }
}
