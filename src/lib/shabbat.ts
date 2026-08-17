/**
 * Shabbat timing, computed locally — no network, no Hebrew-calendar table.
 *
 * Jerusalem is used as a single reference point for all of Israel; elsewhere in the
 * country sunset differs by a few minutes, which the candle/havdalah offsets absorb.
 */
import { DEFAULTS } from '../types.ts'

const REF_LAT = 31.7683
const REF_LNG = 35.2137
const REF_TZ = 'Asia/Jerusalem'

const D2R = Math.PI / 180
const R2D = 180 / Math.PI
const mod = (a: number, b: number): number => ((a % b) + b) % b

function dayOfYear(y: number, m: number, d: number): number {
  const n1 = Math.floor((275 * m) / 9)
  const n2 = Math.floor((m + 9) / 12)
  const n3 = 1 + Math.floor((y - 4 * Math.floor(y / 4) + 2) / 3)
  return n1 - n2 * n3 + d - 30
}

/**
 * Sunset for a calendar date at a location, per the Sunrise/Sunset Algorithm in the
 * US Naval Observatory almanac.
 *
 * @returns UTC instant of sunset, or null on a day with no sunset at that latitude.
 */
export function sunsetUTC(
  year: number,
  month: number,
  day: number,
  lat: number,
  lng: number,
): Date | null {
  const zenith = 90.833 // official — accounts for refraction and the solar radius
  const N = dayOfYear(year, month, day)
  const lngHour = lng / 15

  const t = N + (18 - lngHour) / 24 // 18 = setting
  const M = 0.9856 * t - 3.289
  let L = M + 1.916 * Math.sin(M * D2R) + 0.02 * Math.sin(2 * M * D2R) + 282.634
  L = mod(L, 360)

  let RA = mod(R2D * Math.atan(0.91764 * Math.tan(L * D2R)), 360)
  RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90 // same quadrant as L
  RA /= 15

  const sinDec = 0.39782 * Math.sin(L * D2R)
  const cosDec = Math.cos(Math.asin(sinDec))
  const cosH =
    (Math.cos(zenith * D2R) - sinDec * Math.sin(lat * D2R)) / (cosDec * Math.cos(lat * D2R))
  if (cosH > 1 || cosH < -1) return null // sun never sets that day

  const H = (R2D * Math.acos(cosH)) / 15 // setting
  const T = H + RA - 0.06571 * t - 6.622
  const UT = mod(T - lngHour, 24)

  const hours = Math.floor(UT)
  const minF = (UT - hours) * 60
  const minutes = Math.floor(minF)
  const seconds = Math.round((minF - minutes) * 60)
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds))
}

interface DateParts {
  y: number
  m: number
  d: number
}

/** Israel-local calendar parts plus weekday index (Sun=0 … Sat=6). */
function israelDateParts(date: Date): DateParts & { wd: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: REF_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  const parts: Record<string, string> = {}
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value

  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    y: Number(parts['year']),
    m: Number(parts['month']),
    d: Number(parts['day']),
    wd: wdMap[parts['weekday'] ?? ''] ?? 0,
  }
}

function addDays(y: number, m: number, d: number, n: number): DateParts {
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

export interface ShabbatWindow {
  /** True when `now` falls inside the window. */
  active: boolean
  /** Start and end of the current-or-upcoming Shabbat; null if it could not be computed. */
  start: Date | null
  end: Date | null
}

function windowForFriday(
  fri: DateParts,
  candleOffsetMin: number,
  havdalahOffsetMin: number,
): { start: Date; end: Date } | null {
  const sat = addDays(fri.y, fri.m, fri.d, 1)
  const friSunset = sunsetUTC(fri.y, fri.m, fri.d, REF_LAT, REF_LNG)
  const satSunset = sunsetUTC(sat.y, sat.m, sat.d, REF_LAT, REF_LNG)
  if (!friSunset || !satSunset) return null
  return {
    start: new Date(friSunset.getTime() - candleOffsetMin * 60000),
    end: new Date(satSunset.getTime() + havdalahOffsetMin * 60000),
  }
}

/**
 * Is it Shabbat in Israel at `now`?
 *
 * The weekday is resolved in `Asia/Jerusalem`, so DST is handled by the platform.
 * Yom Tov is not covered — see the README's known limitations.
 */
export function getShabbatWindow(
  now: Date = new Date(),
  candleOffsetMin: number = DEFAULTS.candleOffsetMin,
  havdalahOffsetMin: number = DEFAULTS.havdalahOffsetMin,
): ShabbatWindow {
  const { y, m, d, wd } = israelDateParts(now)

  // Friday of this week's Shabbat. On Saturday (wd=6) that was yesterday.
  let fri = addDays(y, m, d, 5 - wd)
  let win = windowForFriday(fri, candleOffsetMin, havdalahOffsetMin)
  if (!win) return { active: false, start: null, end: null }

  // Once this week's Shabbat has ended (Saturday night), roll forward so start/end always
  // describe the current-or-upcoming one.
  if (now > win.end) {
    fri = addDays(fri.y, fri.m, fri.d, 7)
    const next = windowForFriday(fri, candleOffsetMin, havdalahOffsetMin)
    if (next) win = next
  }

  return { active: now >= win.start && now <= win.end, start: win.start, end: win.end }
}
