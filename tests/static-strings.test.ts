/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { applyStaticStrings, t } from '../src/i18n/index.ts'

function html(markup: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = markup
  return root
}

describe('applyStaticStrings', () => {
  it('fills textContent from data-i18n', () => {
    const root = html('<h1 data-i18n="appName"></h1>')
    applyStaticStrings(root)
    expect(root.querySelector('h1')?.textContent).toBe(t('appName'))
  })

  it('fills every marked element, including <option>', () => {
    const root = html(`
      <select>
        <option data-i18n="settings.alertSymbolWarning"></option>
        <option data-i18n="settings.alertSymbolCandle"></option>
      </select>`)
    applyStaticStrings(root)
    const options = [...root.querySelectorAll('option')].map((o) => o.textContent)
    expect(options).toEqual([t('settings.alertSymbolWarning'), t('settings.alertSymbolCandle')])
  })

  it('leaves unmarked elements alone', () => {
    const root = html('<p>original</p><p data-i18n="appName"></p>')
    applyStaticStrings(root)
    expect(root.querySelectorAll('p')[0]?.textContent).toBe('original')
  })

  it('sets attributes from data-i18n-attr', () => {
    const root = html('<button data-i18n-attr="title:appName,aria-label:banner.closeAria"></button>')
    applyStaticStrings(root)
    const button = root.querySelector('button')
    expect(button?.getAttribute('title')).toBe(t('appName'))
    expect(button?.getAttribute('aria-label')).toBe(t('banner.closeAria'))
  })

  it('tolerates whitespace around an attr pair', () => {
    const root = html('<i data-i18n-attr=" title : appName "></i>')
    applyStaticStrings(root)
    expect(root.querySelector('i')?.getAttribute('title')).toBe(t('appName'))
  })

  it('ignores a malformed attr pair rather than throwing', () => {
    const root = html('<i data-i18n-attr="titleWithNoKey"></i>')
    expect(() => applyStaticStrings(root)).not.toThrow()
    expect(root.querySelector('i')?.attributes.length).toBe(1)
  })

  it('writes text, never markup', () => {
    // Copy is trusted, but the mechanism should not be a way to inject nodes.
    const root = html('<p data-i18n="appName"></p>')
    applyStaticStrings(root)
    const p = root.querySelector('p')!
    expect(p.children).toHaveLength(0)
  })
})

describe('the shipped templates', () => {
  /*
   * Guards the failure mode this mechanism introduces: a data-i18n key that no longer
   * exists in the bundle renders as the key itself, so the popup would ship reading
   * "popup.footer" instead of a sentence.
   */
  it('reference only keys that exist in the bundle', async () => {
    const { readFileSync } = await import('node:fs')
    const templates = [
      'src/popup/index.html',
      'src/options/index.html',
      'src/proof/index.html',
    ]

    for (const path of templates) {
      const source = readFileSync(path, 'utf8')
      const keys = [...source.matchAll(/data-i18n(?:-attr)?="([^"]+)"/g)].flatMap((match) =>
        match[0].includes('-attr')
          ? match[1]!.split(',').map((pair) => pair.split(':')[1]!.trim())
          : [match[1]!],
      )

      expect(keys.length, `${path} has no data-i18n keys`).toBeGreaterThan(0)
      for (const key of keys) {
        expect(t(key as Parameters<typeof t>[0]), `${path} → ${key}`).not.toBe(key)
      }
    }
  })
})
