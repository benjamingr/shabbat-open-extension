import en from './en.json'
import he from './he.json'

/**
 * Every user-visible string lives in a bundle here, not inline in the code.
 *
 * `chrome.i18n` is deliberately not used for these: it picks its locale from the browser
 * and cannot be overridden at runtime, so it could never honour a language *setting*.
 * It is used only for the manifest's store-facing name and description, which Chrome
 * reads before any of this code runs (see `public/_locales`).
 *
 * Adding a language is a drop-in: add `xx.json` with the same keys and register it in
 * `BUNDLES`. `MessageKey` is keyed off the Hebrew bundle, so a bundle missing a key is a
 * type error rather than a string that silently falls back at runtime.
 */
const BUNDLES = { he, en } as const

export type Lang = keyof typeof BUNDLES
export type MessageKey = keyof typeof he

export const DEFAULT_LANG: Lang = 'he'
export const LANGS = Object.keys(BUNDLES) as Lang[]

/**
 * Locale used for dates. English gets `en-GB` rather than `en-US` because the extension
 * is about Israel, where dates read day-month-year.
 */
const LOCALES: Record<Lang, string> = { he: 'he-IL', en: 'en-GB' }

/**
 * The active language, as module state rather than an argument threaded through every
 * call site. Each entry point (popup, options, proof page, banner, service worker) reads
 * the setting and calls `setLang` before it renders anything; `translate` stays pure for
 * anything that needs a specific language regardless of the setting.
 */
let activeLang: Lang = DEFAULT_LANG

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && value in BUNDLES
}

/** Anything unrecognised — an older or hand-edited storage value — falls back. */
export function setLang(lang: unknown): void {
  activeLang = isLang(lang) ? lang : DEFAULT_LANG
}

export function getLang(): Lang {
  return activeLang
}

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
  return translate(activeLang, key, vars)
}

export function dirFor(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'he' ? 'rtl' : 'ltr'
}

/**
 * A date the reader can trust to be in their own language. Kept here rather than in each
 * page so the locale follows the language setting in one place; an unparseable date is
 * returned as-is instead of rendering "Invalid Date".
 */
export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(LOCALES[activeLang], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

/**
 * Point the document at the active language. The templates ship with `lang="he" dir="rtl"`
 * so a page is readable before the setting has been read from storage; this corrects it.
 */
export function applyDocumentLang(doc: Document = document): void {
  doc.documentElement.lang = activeLang
  doc.documentElement.dir = dirFor(activeLang)
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
