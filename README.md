# סגור בשבת — Closed on Shabbat

A Chrome (Manifest V3) extension that tags Israeli e-commerce sites which
observe Shabbat, and shows a direct banner on them:

> **⚠️ שימו לב · האתר סגור בשבת ⚠️**

The alert is deliberately always-on — it's most useful *before* Shabbat, since
during Shabbat the site being closed is self-evident.

- **Banner** at the top of the page for every listed site. Sites with a real
  closure get "האתר סגור בשבת"; sites that only *declare* observance get
  "האתר שומר שבת". The symbol (`⚠️` / `🕯️`) is configurable. Dismissible per tab.
- **Toolbar badge** on every listed site: a green dot for sites that close on
  Shabbat, grey for sites that only declare observance, gold while it is
  actually Shabbat in Israel. Hover for details.
- **Popup** shows the current site's status, evidence source, whether it is
  currently Shabbat, and the settings.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder
   (`shabbat-closed-extension`).

The extension only requests access to the domains in the dataset — the content
script's `matches` are generated from the list, not `<all_urls>`.

## Settings (popup)

- **Alert symbol** — the emoji shown on both sides of the banner headline: `⚠️`
  (default) or `🕯️`. A live preview updates as you pick.
- **Minimum confidence** — hide lower-confidence entries.
- **Extension enabled** — master on/off.

The banner always shows on a listed site. Shabbat times are computed internally
(Jerusalem sunset, 30 min before / 40 min after) only to drive the "currently
Shabbat" cue (banner tint, gold badge, popup indicator) — there's no timing to
configure.

## The data

The list was built in two verified passes on 2026-08-16, and **every entry was
fetched and inspected first-hand** — nothing is included on reputation alone:

1. **Audit of the seed.** Of the 40 sites in the original (ChatGPT-generated,
   unverified) seed, **12 were removed** — no first-party Shabbat evidence, dead,
   or unreachable behind a WAF (see `removed[]` in `sites.json` for each reason).
   28 survived.
2. **Discovery expansion.** A multi-angle web sweep (community directories,
   closure-service vendors like AutoPeak / wp-shamor / shomershabes, phrase
   footprints, store builders, known brands) added **17 more verified sites**.

**45 verified sites** total:

- **18 `site_blocked`** — a real closure mechanism (a closure page, a
  shomer-shabbat blocking plugin/iframe, or a Shabbat open/close time config).
- **2 `purchase_blocked`**, **2 `operations_paused`**, and **23
  `declared_shabbat_observant`** (a first-party "אתר שומר שבת" badge, but no
  technical block observed).

More can be added: the `shamor.app` closure widget alone is reportedly embedded
by ~115 sites — enumerating them (via a source-code search index) is a good next
expansion.

Note: `or-ad.com` and `chez-mishel.co.il` served a closure page even on the
Sunday of the audit — worth confirming their block is time-gated, not stuck.

`data/sites.json` is the editable source of truth. Each entry:

```json
{
  "domain": "togonline.co.il",
  "name": "TOGO Shoes",
  "status": "operations_paused",
  "confidence": "verified",
  "evidence_url": "https://www.togonline.co.il/"
}
```

`status` (strongest → weakest): `site_blocked`, `purchase_blocked`,
`operations_paused`, `declared_shabbat_observant`. The first three get the firm
"האתר סגור בשבת" banner; `declared_shabbat_observant` gets "האתר שומר שבת".
Optional `mechanism` names how a `site_blocked` site enforces closure.

### Adding / editing sites

Edit `data/sites.json`, then rebuild:

```bash
node scripts/build-data.mjs
```

This regenerates `data/sites.js` and rewrites the `content_scripts.matches` in
`manifest.json`. Reload the extension in `chrome://extensions` afterward.

## How Shabbat time is computed

Sunset is computed in pure JS (USNO almanac algorithm) for **Jerusalem** as a
single reference point for Israel. Shabbat = Friday sunset − candle offset →
Saturday sunset + havdalah offset. Day-of-week is resolved in `Asia/Jerusalem`,
so DST is handled automatically.

## Known limitations

- **The list is time-sensitive.** 45 sites, each verified once (2026-08-16).
  `declared_shabbat_observant` means the site *says* it keeps Shabbat, not that
  browsing/checkout is provably blocked. Store policies and site code change —
  re-verify periodically.
- **Most `site_blocked` closures were inferred from site code, not observed
  live.** They were confirmed by finding the closure mechanism (closure page,
  plugin, iframe, or time config) in the page, usually on a weekday — so the
  actual closed page was not always seen rendering during Shabbat. Re-running the
  audit *on* a Shabbat would confirm more and likely surface additional sites
  whose block is only active then.
- **Holidays (חגים) are not in the automatic timing.** Only the weekly Shabbat
  window is computed. Many listed sites also close on Yom Tov (`"holidays":
  true`), but adding those dates needs a Hebrew-calendar table.
- **Single location.** Sunset uses Jerusalem; other parts of Israel differ by a
  few minutes — covered by the default offsets.

## Files

| Path | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest (matches + icons wired in) |
| `icons/icon*.png` | Extension icons (16/32/48/128), generated |
| `data/sites.json` | Editable dataset (source of truth) |
| `data/sites.js` | Generated; `globalThis.SHABBAT_DATA` |
| `src/lib.js` | Sunset/Shabbat math + domain matching |
| `src/content.js` + `src/banner.css` | The on-page banner |
| `src/background.js` | Per-tab toolbar badge |
| `src/popup.html/.css/.js` | Status + settings UI |
| `scripts/build-data.mjs` | Regenerates `sites.js` + manifest matches |
| `scripts/merge-candidates.mjs` | Merge verified new sites into `sites.json` |
| `scripts/make-icons.mjs` | Regenerate the PNG icons |
| `dev-preview/` | Dev-only popup/banner previews (not shipped) |
| `dev-store/` | Dev-only store screenshot/promo slides (not shipped) |
