/*
 * The dataset validator is what stands between a hand-edited JSON file and a shipped
 * build, so its *rejections* are the thing worth testing — a validator that passes
 * everything is worse than none, because it advertises a guarantee it isn't giving.
 *
 * Runs the real script as a subprocess against generated fixtures.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const SCRIPT = 'scripts/build-data.mjs'
let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'shabbat-validator-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

function validSite(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    domain: 'example.co.il',
    name: 'דוגמה',
    category: 'test',
    status: 'site_blocked',
    confidence: 'verified',
    holidays: null,
    evidence_text: 'האתר סגור בשבת',
    evidence_url: 'https://example.co.il/',
    verified: '2026-08-16',
    ...overrides,
  }
}

interface Result {
  ok: boolean
  output: string
}

let counter = 0

/**
 * Write a fixture and run the validator over it. Both streams are captured: errors go to
 * stderr, but so do the non-fatal warnings, which are asserted on the success path.
 */
function validate(data: unknown): Result {
  const path = join(dir, `sites-${counter++}.json`)
  writeFileSync(path, JSON.stringify(data))
  const run = spawnSync('node', [SCRIPT, path], { encoding: 'utf8' })
  return { ok: run.status === 0, output: (run.stdout ?? '') + (run.stderr ?? '') }
}

function dataset(sites: unknown[], extra: Record<string, unknown> = {}): unknown {
  return { sites, removed: [], ...extra }
}

describe('the real dataset', () => {
  it('passes', () => {
    const result = validate(JSON.parse(readFileSync('data/sites.json', 'utf8')))
    expect(result.ok, result.output).toBe(true)
  })
})

describe('accepts', () => {
  it('a minimal valid entry', () => {
    expect(validate(dataset([validSite()])).ok).toBe(true)
  })

  it('an optional mechanism and holidays flag', () => {
    const site = validSite({ mechanism: 'closure modal', holidays: true })
    expect(validate(dataset([site])).ok).toBe(true)
  })

  it('a proof_image that exists in public/proof/', () => {
    // README.md is the one file that folder is guaranteed to contain.
    const site = validSite({ proof_image: 'README.md' })
    expect(validate(dataset([site])).ok).toBe(true)
  })
})

describe('rejects', () => {
  it('an empty site list', () => {
    const result = validate(dataset([]))
    expect(result.ok).toBe(false)
    expect(result.output).toContain('no sites[]')
  })

  it('a duplicate domain', () => {
    const result = validate(dataset([validSite(), validSite()]))
    expect(result.ok).toBe(false)
    expect(result.output).toContain('duplicate')
  })

  it('a duplicate that differs only by www. or case', () => {
    const result = validate(dataset([validSite(), validSite({ domain: 'WWW.Example.co.il' })]))
    expect(result.ok).toBe(false)
    expect(result.output).toContain('duplicate')
  })

  it('an unknown status', () => {
    const result = validate(dataset([validSite({ status: 'probably_closed' })]))
    expect(result.ok).toBe(false)
    expect(result.output).toContain('bad status')
  })

  it('an unknown confidence level', () => {
    const result = validate(dataset([validSite({ confidence: 'pretty_sure' })]))
    expect(result.ok).toBe(false)
    expect(result.output).toContain('bad confidence')
  })

  it.each(['name', 'evidence_text', 'evidence_url'])('a missing %s', (field) => {
    const site = validSite()
    delete site[field]
    expect(validate(dataset([site])).ok).toBe(false)
  })

  it('a non-ISO verified date', () => {
    const result = validate(dataset([validSite({ verified: '16/08/2026' })]))
    expect(result.ok).toBe(false)
    expect(result.output).toContain('YYYY-MM-DD')
  })

  it('a holidays value that is not a boolean or null', () => {
    const result = validate(dataset([validSite({ holidays: 'yes' })]))
    expect(result.ok).toBe(false)
    expect(result.output).toContain('holidays')
  })

  it('a proof_image with no file behind it', () => {
    // Otherwise the proof page renders a broken image and explains nothing.
    const result = validate(dataset([validSite({ proof_image: 'nope.webp' })]))
    expect(result.ok).toBe(false)
    expect(result.output).toContain('not found')
  })

  it('a domain that is listed and rejected at once', () => {
    const data = dataset([validSite()], {
      removed: [{ domain: 'example.co.il', reason: 'no evidence' }],
    })
    const result = validate(data)
    expect(result.ok).toBe(false)
    expect(result.output).toContain('both sites[] and removed[]')
  })

  it('a removed entry with no reason', () => {
    const data = dataset([validSite()], { removed: [{ domain: 'other.co.il' }] })
    expect(validate(data).ok).toBe(false)
  })

  it('reports every problem at once rather than stopping at the first', () => {
    const result = validate(
      dataset([validSite({ status: 'nope' }), validSite({ domain: 'b.co.il', confidence: 'x' })]),
    )
    expect(result.output).toContain('2 error(s)')
  })
})

describe('warns without failing', () => {
  it('when one listed domain shadows another', () => {
    /*
     * Matching is exact-or-subdomain and stops at the first hit, so shop.example.co.il
     * listed alongside example.co.il can never match. Legal data, dead entry.
     */
    const result = validate(dataset([validSite(), validSite({ domain: 'shop.example.co.il' })]))
    expect(result.ok).toBe(true)
    expect(result.output).toContain('shadowed by')
  })
})
