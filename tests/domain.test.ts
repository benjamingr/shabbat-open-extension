import { describe, expect, it } from 'vitest'
import { hostFromUrl, matchSite, normalizeHost } from '../src/lib/domain.ts'
import type { Site } from '../src/types.ts'

function site(domain: string): Site {
  return {
    domain,
    name: domain,
    category: 'test',
    status: 'site_blocked',
    confidence: 'verified',
    holidays: null,
    evidence_text: 'x',
    evidence_url: `https://${domain}/`,
    verified: '2026-08-16',
  }
}

describe('normalizeHost', () => {
  it('lowercases, and strips www. and a trailing dot', () => {
    expect(normalizeHost('WWW.Example.CO.IL.')).toBe('example.co.il')
  })

  it('returns "" for empty input', () => {
    expect(normalizeHost('')).toBe('')
    expect(normalizeHost(null)).toBe('')
    expect(normalizeHost(undefined)).toBe('')
  })

  it('strips only a leading www., not a www. deeper in the host', () => {
    expect(normalizeHost('shop.www.example.co.il')).toBe('shop.www.example.co.il')
  })
})

describe('hostFromUrl', () => {
  it('extracts the hostname', () => {
    expect(hostFromUrl('https://www.example.co.il/cart?a=1')).toBe('www.example.co.il')
  })

  it('returns "" for non-URLs and for undefined', () => {
    expect(hostFromUrl('chrome://extensions')).toBe('')
    expect(hostFromUrl('not a url')).toBe('')
    expect(hostFromUrl(undefined)).toBe('')
  })
})

describe('matchSite', () => {
  const list = [site('example.co.il'), site('yudaica.starmap.co.il')]

  it('matches exactly', () => {
    expect(matchSite('example.co.il', list)?.domain).toBe('example.co.il')
  })

  it('matches a subdomain of a listed domain', () => {
    expect(matchSite('shop.example.co.il', list)?.domain).toBe('example.co.il')
    expect(matchSite('a.b.example.co.il', list)?.domain).toBe('example.co.il')
  })

  it('matches through www. and casing', () => {
    expect(matchSite('WWW.Example.co.il', list)?.domain).toBe('example.co.il')
  })

  /*
   * The regression this file exists for. The dataset lists a subdomain, so matching must
   * not collapse hosts to their registrable domain: that would resolve the listing to
   * starmap.co.il and flag every unrelated site under it.
   */
  it('does not let a listed subdomain flag its parent domain', () => {
    expect(matchSite('yudaica.starmap.co.il', list)?.domain).toBe('yudaica.starmap.co.il')
    expect(matchSite('starmap.co.il', list)).toBeNull()
    expect(matchSite('other.starmap.co.il', list)).toBeNull()
  })

  it('does not match a domain that merely ends with the same characters', () => {
    expect(matchSite('notexample.co.il', list)).toBeNull()
    expect(matchSite('example.co.il.evil.com', list)).toBeNull()
  })

  it('returns null for an empty host or an empty list', () => {
    expect(matchSite('', list)).toBeNull()
    expect(matchSite('example.co.il', [])).toBeNull()
  })
})
