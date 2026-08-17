import { describe, expect, it } from 'vitest'
import { APPEAL_FORM_ID, FORM_FIELDS, REPORT_FORM_ID } from '../src/config.ts'
import { appealFormUrl, reportFormUrl } from '../src/lib/forms.ts'

describe('reportFormUrl', () => {
  it('points at the report form', () => {
    expect(reportFormUrl('example.co.il')).toContain(REPORT_FORM_ID)
  })

  it('sends no prefill while the report field ID is null', () => {
    // Prefill is opt-in: with no field ID configured the form must open blank rather
    // than silently gaining a query parameter Google will ignore.
    expect(FORM_FIELDS.report.domain).toBeNull()
    const url = new URL(reportFormUrl('example.co.il'))
    expect([...url.searchParams.keys()]).toEqual([])
  })

  it('handles a null domain', () => {
    expect(() => reportFormUrl(null)).not.toThrow()
  })
})

describe('appealFormUrl', () => {
  it('prefills the domain being disputed', () => {
    const url = new URL(appealFormUrl('example.co.il', '2026-08-16'))
    expect(url.searchParams.get(FORM_FIELDS.appeal.domain!)).toBe('example.co.il')
    expect(url.pathname).toContain(APPEAL_FORM_ID)
  })

  it('marks the URL as prefilled so Google honours the values', () => {
    const url = new URL(appealFormUrl('example.co.il', '2026-08-16'))
    expect(url.searchParams.get('usp')).toBe('pp_url')
  })

  it('omits the verified date while that field has no ID', () => {
    expect(FORM_FIELDS.appeal.verified).toBeNull()
    const url = new URL(appealFormUrl('example.co.il', '2026-08-16'))
    expect([...url.searchParams.keys()].sort()).toEqual([FORM_FIELDS.appeal.domain, 'usp'].sort())
  })

  it('skips a field whose value is missing, even when its ID is set', () => {
    const url = new URL(appealFormUrl('example.co.il', null))
    expect(url.searchParams.has('entry.630541094')).toBe(true)
    expect([...url.searchParams.keys()]).toHaveLength(2)
  })

  it('escapes a domain rather than injecting it raw', () => {
    const url = appealFormUrl('a&b=c.co.il', null)
    expect(url).toContain('a%26b%3Dc.co.il')
  })
})
