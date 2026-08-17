import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { proofPageUrl } from '../src/lib/proof.ts'
import { installChromeMock, makeSite, uninstallChromeMock } from './helpers.ts'

beforeEach(installChromeMock)
afterEach(uninstallChromeMock)

describe('proofPageUrl', () => {
  it('points at the packaged proof page', () => {
    const url = new URL(proofPageUrl(makeSite()))
    expect(url.protocol).toBe('chrome-extension:')
    expect(url.pathname).toBe('/src/proof/index.html')
  })

  it('carries the domain the page has to look up', () => {
    const url = new URL(proofPageUrl(makeSite({ domain: 'or-ad.com' })))
    expect(url.searchParams.get('domain')).toBe('or-ad.com')
  })

  it('matches the path declared in web_accessible_resources', () => {
    // A mismatch here means the banner's link is blocked on every real site, silently.
    expect(proofPageUrl(makeSite())).toContain('src/proof/index.html')
  })

  it('escapes the domain rather than injecting it raw', () => {
    expect(proofPageUrl(makeSite({ domain: 'a&b.co.il' }))).toContain('a%26b.co.il')
  })
})
