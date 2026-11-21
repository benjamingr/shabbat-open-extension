/*
 * The runtime validator — the only thing standing between a fetched JSON file and what
 * the extension puts on screen and into `link.href`.
 *
 * `scripts/build-data.mjs` gates the bundled copy; this gates every other copy. Its
 * *rejections* are the point, so that is what is tested here. Two of them are not
 * duplicated from the build validator at all, because only remote data can violate them:
 * a non-https `evidence_url` (assigned to an anchor, so `javascript:` would execute), and
 * a `proof_image` that is not a bare filename (interpolated into a URL).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAX_SITES, isSchemaCompatible, validateDataset } from '../src/lib/validate.ts'
import { makeSite } from './helpers.ts'

function dataset(sites: unknown[], extra: Record<string, unknown> = {}): unknown {
  return {
    schema_version: '1.2',
    revision: 2,
    generated_at: '2026-08-16',
    audited_at: '2026-08-22',
    country: 'IL',
    purpose: 'test',
    audit_note: 'test',
    status_definitions: {
      site_blocked: 'blocked',
      purchase_blocked: 'purchase blocked',
      operations_paused: 'paused',
      declared_shabbat_observant: 'declared',
    },
    confidence_definitions: { verified: 'seen', high: 'confirmed', medium: 'weaker' },
    sites,
    removed: [],
    notes: [],
    ...extra,
  }
}

/** The error message, or a marker — so a passing result in a rejection test reads clearly. */
function errorOf(input: unknown): string {
  const result = validateDataset(input)
  return result.ok ? '<accepted>' : result.error
}

describe('the real dataset', () => {
  /*
   * The bundled copy has to satisfy the runtime validator as well as the build one:
   * `revision` and the schema major aside, a fetched dataset is the same file, so any rule
   * here that the real file breaks is a rule that would reject every future update.
   */
  it('passes the runtime validator too', () => {
    const real = JSON.parse(readFileSync('data/sites.json', 'utf8')) as unknown
    const result = validateDataset(real)
    expect(result.ok ? '' : result.error).toBe('')
  })
})

describe('accepts', () => {
  it('a minimal valid dataset', () => {
    expect(validateDataset(dataset([makeSite()])).ok).toBe(true)
  })

  it('an optional mechanism, holidays flag and proof_image', () => {
    const site = makeSite({ mechanism: 'closure modal', holidays: true, proof_image: 'a.webp' })
    expect(validateDataset(dataset([site])).ok).toBe(true)
  })

  it('a dataset carrying fields this build does not know about', () => {
    // A minor schema bump adds fields. Older code ignores them, and must not refuse the
    // file over them — that is what makes `1.3` readable by a build that shipped `1.2`.
    const data = dataset([makeSite({ future_field: 'x' } as never)], { future_top_level: 42 })
    expect(validateDataset(data).ok).toBe(true)
  })

  it('a status_definitions entry missing for a status nobody uses', () => {
    const definitions = { site_blocked: 'blocked' }
    const data = dataset([makeSite()], { status_definitions: definitions })
    expect(validateDataset(data).ok).toBe(true)
  })
})

describe('rejects, for the same reasons the build validator does', () => {
  it.each([
    ['a non-object', 42],
    ['a null', null],
    ['an array', []],
  ])('%s', (_label, input) => {
    expect(validateDataset(input).ok).toBe(false)
  })

  it('an empty site list', () => {
    expect(errorOf(dataset([]))).toContain('sites[]')
  })

  it('a missing removed[]', () => {
    expect(errorOf(dataset([makeSite()], { removed: undefined }))).toContain('removed[]')
  })

  it('a duplicate domain', () => {
    expect(errorOf(dataset([makeSite(), makeSite()]))).toContain('duplicate')
  })

  it.each(['probably_closed', '', null, undefined])('the status %s', (status) => {
    expect(errorOf(dataset([makeSite({ status } as never)]))).toContain('bad status')
  })

  it.each(['pretty_sure', '', null])('the confidence %s', (confidence) => {
    expect(errorOf(dataset([makeSite({ confidence } as never)]))).toContain('bad confidence')
  })

  it.each(['name', 'category', 'evidence_text'])('a missing %s', (field) => {
    const site = makeSite() as unknown as Record<string, unknown>
    delete site[field]
    expect(errorOf(dataset([site]))).toContain(field)
  })

  it('a non-ISO verified date', () => {
    expect(errorOf(dataset([makeSite({ verified: '16/08/2026' })]))).toContain('YYYY-MM-DD')
  })

  it('a holidays value that is neither boolean nor null', () => {
    expect(errorOf(dataset([makeSite({ holidays: 'yes' } as never)]))).toContain('holidays')
  })

  it('a domain listed and rejected at once', () => {
    const data = dataset([makeSite()], {
      removed: [{ domain: 'example.co.il', reason: 'no evidence' }],
    })
    expect(errorOf(data)).toContain('both sites[] and removed[]')
  })

  it('a removed entry with no reason', () => {
    expect(errorOf(dataset([makeSite()], { removed: [{ domain: 'other.co.il' }] }))).toContain(
      'reason',
    )
  })

  it('a status_definitions entry missing for a status in use', () => {
    const data = dataset([makeSite({ status: 'operations_paused' })], {
      status_definitions: { site_blocked: 'blocked' },
    })
    // The proof page reads this straight onto the page; missing means a blank element.
    expect(errorOf(data)).toContain('status_definitions')
  })

  it('a confidence_definitions entry missing for a confidence in use', () => {
    const data = dataset([makeSite()], { confidence_definitions: { medium: 'weaker' } })
    expect(errorOf(data)).toContain('confidence_definitions')
  })
})

describe('rejects, for reasons only a fetched dataset can trigger', () => {
  /*
   * `evidence_url` is assigned to `link.href` in the banner — which runs in the host
   * page — and again on the proof page. A `javascript:` URL there is script execution,
   * so the scheme is checked rather than merely the parse.
   */
  it.each([
    'javascript:alert(document.cookie)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://example.co.il/',
    'not a url',
    '',
  ])('the evidence_url %s', (evidence_url) => {
    expect(errorOf(dataset([makeSite({ evidence_url })]))).toContain('evidence_url')
  })

  it('accepts an https evidence_url', () => {
    expect(validateDataset(dataset([makeSite({ evidence_url: 'https://a.co.il/x' })])).ok).toBe(true)
  })

  /*
   * `proof_image` is interpolated into a URL under the repo's proof folder. Anything with
   * a separator, a scheme, or a parent-directory hop addresses something else.
   */
  it.each([
    '../../../etc/passwd',
    'sub/dir/shot.webp',
    'https://evil.example/shot.webp',
    '//evil.example/shot.webp',
    'shot.svg',
    'shot',
    '',
  ])('the proof_image %s', (proof_image) => {
    expect(errorOf(dataset([makeSite({ proof_image })]))).toContain('proof_image')
  })

  it('a domain stored unnormalized', () => {
    // Matching would still find it, but the raw value is what the popup, the proof page
    // and the dismissed-domains list display and key on.
    expect(errorOf(dataset([makeSite({ domain: 'WWW.Example.co.il' })]))).toContain('normalized')
  })

  it.each([undefined, '3', 3.5, -1, Number.NaN])('the revision %s', (revision) => {
    expect(errorOf(dataset([makeSite()], { revision }))).toContain('revision')
  })

  it.each([undefined, '1', 'v1.2', 1.2])('the schema_version %s', (schema_version) => {
    expect(errorOf(dataset([makeSite()], { schema_version }))).toContain('schema_version')
  })

  it('a site list far larger than any real one', () => {
    // Bounded because it is about to be written to storage, not because the list could
    // not legitimately grow.
    const many = Array.from({ length: MAX_SITES + 1 }, (_unused, i) =>
      makeSite({ domain: `site${i}.co.il` }),
    )
    expect(errorOf(dataset(many))).toContain('over')
  })
})

describe('isSchemaCompatible', () => {
  it('accepts an equal or higher minor within the same major', () => {
    // A minor bump adds fields; the checks above prove unknown fields survive.
    expect(isSchemaCompatible('1.2', '1.2')).toBe(true)
    expect(isSchemaCompatible('1.3', '1.2')).toBe(true)
    expect(isSchemaCompatible('1.10', '1.2')).toBe(true)
  })

  it('accepts a lower minor — an older file is readable, just not newer', () => {
    expect(isSchemaCompatible('1.1', '1.2')).toBe(true)
  })

  it('refuses a different major', () => {
    // A major bump means a field this build depends on changed meaning. The honest
    // response is to keep the bundled list and wait for a release.
    expect(isSchemaCompatible('2.0', '1.2')).toBe(false)
    expect(isSchemaCompatible('0.9', '1.2')).toBe(false)
  })

  it('refuses a version with no major at all', () => {
    expect(isSchemaCompatible('', '1.2')).toBe(false)
    expect(isSchemaCompatible('.2', '1.2')).toBe(false)
  })
})
