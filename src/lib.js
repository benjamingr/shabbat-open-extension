/*
 * Shared, dependency-free logic for the "Closed on Shabbat" extension.
 *
 * Exposes `globalThis.ShabbatLib`. This file is loaded both as a content
 * script and via importScripts() in the service worker, so it must stay a
 * plain classic script (no import/export).
 */
(function () {
  "use strict";

  // Jerusalem — used as a single reference point for sunset in Israel.
  const REF_LAT = 31.7683;
  const REF_LNG = 35.2137;
  const REF_TZ = "Asia/Jerusalem";

  const DEFAULTS = {
    enabled: true,
    // Symbol shown on both sides of the banner headline. "⚠️" or "🕯️".
    alertSymbol: "⚠️",
    // Used internally to know if it's currently Shabbat (badge color / popup
    // info). The banner always shows regardless of time.
    candleOffsetMin: 30, // Shabbat starts this many minutes BEFORE Friday sunset
    havdalahOffsetMin: 40, // Shabbat ends this many minutes AFTER Saturday sunset
    minConfidence: "medium", // hide sites below this confidence
  };

  const D2R = Math.PI / 180;
  const R2D = 180 / Math.PI;
  const mod = (a, b) => ((a % b) + b) % b;

  function dayOfYear(y, m, d) {
    const n1 = Math.floor((275 * m) / 9);
    const n2 = Math.floor((m + 9) / 12);
    const n3 = 1 + Math.floor((y - 4 * Math.floor(y / 4) + 2) / 3);
    return n1 - n2 * n3 + d - 30;
  }

  /**
   * Sunset for a given calendar date at a location.
   * Sunrise/Sunset Algorithm (US Naval Observatory almanac).
   * @returns {Date|null} UTC instant of sunset, or null (no sunset that day).
   */
  function sunsetUTC(year, month, day, lat, lng) {
    const zenith = 90.833; // official (accounts for refraction + solar radius)
    const N = dayOfYear(year, month, day);
    const lngHour = lng / 15;

    const t = N + (18 - lngHour) / 24; // 18 = setting
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * D2R) + 0.02 * Math.sin(2 * M * D2R) + 282.634;
    L = mod(L, 360);

    let RA = mod(R2D * Math.atan(0.91764 * Math.tan(L * D2R)), 360);
    RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90; // same quadrant as L
    RA /= 15;

    const sinDec = 0.39782 * Math.sin(L * D2R);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH =
      (Math.cos(zenith * D2R) - sinDec * Math.sin(lat * D2R)) /
      (cosDec * Math.cos(lat * D2R));
    if (cosH > 1 || cosH < -1) return null; // sun never sets/rises that day

    let H = R2D * Math.acos(cosH) / 15; // setting
    const T = H + RA - 0.06571 * t - 6.622;
    const UT = mod(T - lngHour, 24);

    const hours = Math.floor(UT);
    const minF = (UT - hours) * 60;
    const minutes = Math.floor(minF);
    const seconds = Math.round((minF - minutes) * 60);
    return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  }

  /** Israel-local calendar parts + weekday index (Sun=0 … Sat=6). */
  function israelDateParts(date) {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: REF_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
    const parts = {};
    for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
    const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      y: Number(parts.year),
      m: Number(parts.month),
      d: Number(parts.day),
      wd: wdMap[parts.weekday],
    };
  }

  function addDays(y, m, d, n) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }

  /**
   * Is it Shabbat in Israel right now?
   * @returns {{active:boolean, start:Date, end:Date}}
   * `start`/`end` describe the current (or upcoming) Shabbat window.
   */
  function windowForFriday(fri, candleOffsetMin, havdalahOffsetMin) {
    const sat = addDays(fri.y, fri.m, fri.d, 1);
    const friSunset = sunsetUTC(fri.y, fri.m, fri.d, REF_LAT, REF_LNG);
    const satSunset = sunsetUTC(sat.y, sat.m, sat.d, REF_LAT, REF_LNG);
    if (!friSunset || !satSunset) return null;
    return {
      start: new Date(friSunset.getTime() - candleOffsetMin * 60000),
      end: new Date(satSunset.getTime() + havdalahOffsetMin * 60000),
    };
  }

  function getShabbatWindow(now, candleOffsetMin, havdalahOffsetMin) {
    now = now || new Date();
    candleOffsetMin = candleOffsetMin ?? DEFAULTS.candleOffsetMin;
    havdalahOffsetMin = havdalahOffsetMin ?? DEFAULTS.havdalahOffsetMin;

    const { y, m, d, wd } = israelDateParts(now);
    // Friday of this week's Shabbat. On Saturday (wd=6) it was yesterday.
    let fri = addDays(y, m, d, 5 - wd);
    let win = windowForFriday(fri, candleOffsetMin, havdalahOffsetMin);
    if (!win) return { active: false, start: null, end: null };

    // If this week's Shabbat already ended (e.g. Saturday night), roll to the
    // next one so `start`/`end` always describe the current-or-upcoming Shabbat.
    if (now > win.end) {
      fri = addDays(fri.y, fri.m, fri.d, 7);
      const next = windowForFriday(fri, candleOffsetMin, havdalahOffsetMin);
      if (next) win = next;
    }

    return { active: now >= win.start && now <= win.end, start: win.start, end: win.end };
  }

  // ---- Domain matching -----------------------------------------------------

  function normalizeHost(host) {
    if (!host) return "";
    return host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  }

  /** Find the dataset entry matching a hostname (exact or subdomain). */
  function matchSite(host, sites) {
    const h = normalizeHost(host);
    if (!h || !Array.isArray(sites)) return null;
    for (const site of sites) {
      const dom = normalizeHost(site.domain);
      if (h === dom || h.endsWith("." + dom)) return site;
    }
    return null;
  }

  // ---- Presentation helpers ------------------------------------------------

  const CONFIDENCE_RANK = { medium: 1, high: 2, verified: 3 };
  // Statuses that justify a firm "closed on Shabbat" headline.
  const STRONG_STATUSES = new Set([
    "site_blocked",
    "purchase_blocked",
    "operations_paused",
  ]);

  const STATUS_LABEL_HE = {
    site_blocked: "האתר נחסם לגלישה בשבת",
    purchase_blocked: "לא ניתן לרכוש בשבת",
    operations_paused: "פעולות ומשלוחים מושהים בשבת",
    declared_shabbat_observant: "האתר מצהיר ששומר שבת",
    candidate: "ייתכן ששומר שבת (לא מאומת)",
  };

  const CONFIDENCE_LABEL_HE = {
    verified: "מאומת",
    high: "רמת ודאות גבוהה",
    medium: "רמת ודאות בינונית",
  };

  function isStrong(site) {
    return STRONG_STATUSES.has(site.status);
  }

  function meetsConfidence(site, minConfidence) {
    const rank = CONFIDENCE_RANK[site.confidence] || 0;
    const min = CONFIDENCE_RANK[minConfidence] || 0;
    return rank >= min;
  }

  function formatTimeIL(date) {
    if (!date) return "";
    return new Intl.DateTimeFormat("he-IL", {
      timeZone: REF_TZ,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  globalThis.ShabbatLib = {
    DEFAULTS,
    sunsetUTC,
    getShabbatWindow,
    normalizeHost,
    matchSite,
    isStrong,
    meetsConfidence,
    formatTimeIL,
    STATUS_LABEL_HE,
    CONFIDENCE_LABEL_HE,
    CONFIDENCE_RANK,
  };
})();
