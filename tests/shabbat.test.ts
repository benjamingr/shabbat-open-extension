import { describe, expect, it } from 'vitest'
import { getShabbatWindow, sunsetUTC } from '../src/lib/shabbat.ts'

const LAT = 31.7683
const LNG = 35.2137

/** Wall-clock time in Israel, which is what every assertion here is really about. */
function israelTime(date: Date | null): string {
  if (!date) return 'null'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'short',
    timeStyle: 'short',
    hour12: false,
  }).format(date)
}

describe('sunsetUTC', () => {
  /*
   * Checked against published Jerusalem sunset times, which these match to within a
   * minute. The almanac algorithm is an approximation; the candle and havdalah offsets
   * are far larger than its error, so a minute of drift never moves the window's edge in
   * any way a user would notice.
   */
  it('matches the real Jerusalem sunset in summer', () => {
    expect(israelTime(sunsetUTC(2026, 6, 19, LAT, LNG))).toBe('19/06/2026, 19:47')
  })

  it('matches the real Jerusalem sunset in winter', () => {
    expect(israelTime(sunsetUTC(2026, 12, 18, LAT, LNG))).toBe('18/12/2026, 16:38')
  })

  it('returns null above the Arctic circle in midsummer, where the sun never sets', () => {
    expect(sunsetUTC(2026, 6, 21, 78.2, 15.6)).toBeNull()
  })
})

describe('getShabbatWindow', () => {
  it('opens 30 min before Friday sunset and closes 40 min after Saturday sunset', () => {
    const win = getShabbatWindow(new Date('2026-06-17T09:00:00Z'))
    expect(israelTime(win.start)).toBe('19/06/2026, 19:17')
    expect(israelTime(win.end)).toBe('20/06/2026, 20:27')
  })

  it('honours custom offsets', () => {
    const win = getShabbatWindow(new Date('2026-06-17T09:00:00Z'), 0, 0)
    expect(israelTime(win.start)).toBe('19/06/2026, 19:47')
    expect(israelTime(win.end)).toBe('20/06/2026, 19:47')
  })

  it('is inactive midweek', () => {
    expect(getShabbatWindow(new Date('2026-06-17T09:00:00Z')).active).toBe(false)
  })

  it('is active on Saturday afternoon', () => {
    expect(getShabbatWindow(new Date('2026-06-20T12:00:00Z')).active).toBe(true)
  })

  it('is active just after candle-lighting on Friday', () => {
    // 19:18 Israel time, one minute past the start computed above.
    expect(getShabbatWindow(new Date('2026-06-19T16:18:00Z')).active).toBe(true)
  })

  it('is inactive just before candle-lighting on Friday', () => {
    // 19:16 Israel time, one minute before it.
    expect(getShabbatWindow(new Date('2026-06-19T16:16:00Z')).active).toBe(false)
  })

  it('rolls to the next Shabbat once this one has ended', () => {
    // Sunday morning: the window must describe the *coming* Friday, not the past one.
    const win = getShabbatWindow(new Date('2026-06-21T09:00:00Z'))
    expect(israelTime(win.start)).toBe('26/06/2026, 19:18')
    expect(win.active).toBe(false)
  })

  it('resolves the weekday in Israel, not in UTC', () => {
    /*
     * 21:00 UTC on Thursday is already Friday in Israel (UTC+3). A UTC-based weekday
     * would compute the window from the wrong Friday and land a week out.
     */
    const win = getShabbatWindow(new Date('2026-06-18T21:00:00Z'))
    expect(israelTime(win.start)).toBe('19/06/2026, 19:17')
  })

  it('follows Israeli DST without a timezone table', () => {
    // Same computation in December, when Israel is on UTC+2 rather than UTC+3.
    const win = getShabbatWindow(new Date('2026-12-16T09:00:00Z'))
    expect(israelTime(win.start)).toBe('18/12/2026, 16:08')
    expect(israelTime(win.end)).toBe('19/12/2026, 17:18')
  })
})

/*
 * Carried over from test/lib.test.js, which tested the pre-TypeScript globalThis.ShabbatLib
 * and could not survive the port. The dates are independent of the ones chosen above, so
 * they are kept rather than folded in — a second set of fixtures is worth more than tidiness.
 */
describe('getShabbatWindow (cases carried over from test/lib.test.js)', () => {
  it('is active on Friday night in Israel', () => {
    expect(getShabbatWindow(new Date('2026-08-14T17:00:00Z'), 30, 40).active).toBe(true)
  })

  it('is active at Saturday midday', () => {
    expect(getShabbatWindow(new Date('2026-08-15T12:00:00Z'), 30, 40).active).toBe(true)
  })

  it('is not active on a weekday', () => {
    expect(getShabbatWindow(new Date('2026-08-12T10:00:00Z'), 30, 40).active).toBe(false)
  })

  it('rolls to the upcoming Shabbat after havdalah', () => {
    const now = new Date('2026-08-15T19:00:00Z') // Sat night, after the ~17:03Z end
    const win = getShabbatWindow(now, 30, 40)
    expect(win.active).toBe(false)
    expect(win.start!.getTime()).toBeGreaterThan(now.getTime())
  })
})
