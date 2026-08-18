/*
 * Invariants over the real data/sites.json.
 *
 * scripts/build-data.mjs already gates the build on shape and enum validity. These are
 * the properties the *runtime* depends on — the ones where a bad row would not fail the
 * build but would misbehave in the browser.
 */
import { describe, expect, it } from 'vitest'
import { dataset, sites } from '../src/lib/dataset.ts'
import { matchSite, normalizeHost } from '../src/lib/domain.ts'
import { statusLabel, confidenceLabel } from '../src/lib/site.ts'

describe('dataset', () => {
  it('is not empty', () => {
    expect(sites.length).toBeGreaterThan(0)
  })

  it('stores every domain already normalized', () => {
    // matchSite normalizes both sides, so a stray "www." or capital would still match —
    // but it would show up raw in the popup, the proof page, and the dismissed list.
    for (const site of sites) {
      expect(site.domain, site.domain).toBe(normalizeHost(site.domain))
    }
  })

  it('has a translated label for every status and confidence in use', () => {
    for (const site of sites) {
      expect(statusLabel(site.status), site.domain).not.toBe(`status.${site.status}`)
      expect(confidenceLabel(site.confidence), site.domain).not.toBe(
        `confidence.${site.confidence}`,
      )
    }
  })

  it('resolves every listed domain to its own entry', () => {
    // Guards against a shadowing pair: one listed domain sitting under another means the
    // second is unreachable, because exact-or-subdomain matching stops at the first hit.
    for (const site of sites) {
      expect(matchSite(site.domain, sites)?.domain, site.domain).toBe(site.domain)
    }
  })

  it('never lists a domain that is also in removed[]', () => {
    const listed = new Set(sites.map((site) => normalizeHost(site.domain)))
    for (const entry of dataset.removed) {
      expect(listed.has(normalizeHost(entry.domain)), entry.domain).toBe(false)
    }
  })

  it('gives every entry an https evidence URL', () => {
    for (const site of sites) {
      expect(() => new URL(site.evidence_url), site.domain).not.toThrow()
      expect(new URL(site.evidence_url).protocol, site.domain).toBe('https:')
    }
  })

  it('defines every status and confidence value the sites use', () => {
    // The proof page reads these definitions straight out of the dataset.
    for (const site of sites) {
      expect(dataset.status_definitions[site.status], site.status).toBeTruthy()
      expect(dataset.confidence_definitions[site.confidence], site.confidence).toBeTruthy()
    }
  })
})
