# Safari Web Extension wrapper (iOS + macOS)

This directory holds everything needed to ship **סגור בשבת — Closed on Shabbat**
as a Safari Web Extension on the **App Store**, for both **macOS** and **iOS /
iPadOS**, without changing the Chrome/Vite build.

Safari supports Manifest V3 and the `browser.*` WebExtension API, so the same
`dist/` that Chrome loads is the input to Apple's converter — the wrapper is a
thin native app (a macOS app and an iOS app) whose only job is to host the
extension and let the user enable it in Safari.

> **Nothing here modifies the Chrome build.** `vite.config.ts`,
> `manifest.config.ts`, and `data/sites.json` are owned elsewhere. This wrapper
> consumes the built `dist/` as-is. Any Safari-only manifest differences are
> described in [Safari-specific manifest deltas](#safari-specific-manifest-deltas)
> as documentation, not as edits to those files.

---

## What's in this directory

| Path | Committed? | Purpose |
| --- | --- | --- |
| `apple/README.md` | yes | This document. |
| `apple/GeneratedProject/` | **no — git-ignored** | The Xcode project the converter generates from `dist/`. A build artifact; regenerate it, never hand-edit it in a way you expect to survive a rebuild. |

The generator is [`scripts/build-safari.sh`](../scripts/build-safari.sh).

---

## Prerequisites

- **A Mac running macOS** with the **full Xcode** (12 or later) installed from
  the App Store — not just the Command Line Tools. The converter,
  `safari-web-extension-converter`, ships *inside* Xcode.
  Select it with:
  ```bash
  sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
  ```
- **Apple Developer Program membership — US $99 / year.** This is required to
  sign, notarize, and submit to the App Store. You can build and run locally on
  your own devices without it, but you cannot distribute.
- Node + the repo's dev dependencies (`npm ci`) so `npm run build` works.

---

## End-to-end: from source to the App Store

### 1. Generate (or regenerate) the Xcode project

From the repo root:

```bash
./scripts/build-safari.sh
```

This runs `npm run build` (producing `dist/`) and then:

```bash
xcrun safari-web-extension-converter dist/ \
  --project-location apple/GeneratedProject \
  --app-name "Closed on Shabbat" \
  --bundle-identifier io.eon.shabbatclosed \
  --copy-resources --no-prompt --force --no-open
```

The script **guards for macOS + Xcode** and prints clear guidance if either is
missing, and is **re-runnable** (`--force` overwrites the previous generation).
Run it again whenever `dist/` changes.

> **Note on `--macos --ios`:** the converter has no such flags. It generates
> **both** a macOS and an iOS target by default; `--ios-only` / `--macos-only`
> restrict it. We want both, so we pass neither.

### 2. Open the project

```bash
open "apple/GeneratedProject/Closed on Shabbat/Closed on Shabbat.xcodeproj"
```

The generated project contains, per platform:
- an **App** target — a minimal host app whose window just points the user at
  Safari's extension settings, and
- an **Extension** target — a `.appex` that bundles the contents of `dist/`.

### 3. Set signing

Select each target → **Signing & Capabilities** → your **Team**. Let Xcode
manage signing automatically for a first run. The bundle identifiers are derived
from `io.eon.shabbatclosed` (e.g. the iOS extension becomes
`io.eon.shabbatclosed.Extension`) — keep them stable across releases so updates
attach to the same App Store record.

### 4. Build, run, and enable the extension

**macOS**
1. Select the macOS app scheme, **Run**.
2. The host app opens. Open **Safari → Settings → Extensions**, tick **Closed on
   Shabbat**.
3. To load an unsigned local build during development, enable Safari's
   **Develop** menu (Safari → Settings → Advanced → "Show features for web
   developers"), then **Develop → Allow Unsigned Extensions**.

**iOS / iPadOS** (Simulator or a device)
1. Select the iOS app scheme and a Simulator/device, **Run**.
2. On the device: **Settings → Apps → Safari → Extensions → Closed on Shabbat**,
   toggle it **on**.
3. Grant site access (see the permission model below).

### 5. Verify the core behavior

The **banner** (content script rendering into a Shadow DOM) is the core signal
and works on **every** Safari platform. On a listed site (e.g. one from
`data/sites.json`), you should see the top banner. Confirm the popup and options
pages open from Safari's extension UI.

### 6. Archive and submit to App Store Connect

1. Create the app records in **App Store Connect** (one per platform is handled
   under a single app that has both a macOS and an iOS version, sharing the
   `io.eon.shabbatclosed` identifier family).
2. In Xcode: select the app scheme → **Product → Archive** (do this for the
   macOS app and the iOS app).
3. In the **Organizer**, **Distribute App → App Store Connect → Upload**. Xcode
   handles **code signing** with your Distribution certificate and, for macOS,
   **notarization** happens as part of the App Store upload pipeline.
4. In App Store Connect, attach the build, fill in metadata, and submit for
   review. See [Apple binary review notes](#apple-binary-review-notes).

---

## The per-site permission model

Safari extensions request host access **per site**, and the user grants it
through Safari — this is stricter and more visible than Chrome's install-time
grant.

- This extension already scopes host access to the **listed domains only** (the
  content-script `matches` are generated from `data/sites.json` — there is no
  `<all_urls>`). Safari surfaces those domains as the sites the extension wants
  to run on.
- On **first use per site**, Safari asks the user to **Allow** the extension on
  that domain ("Always Allow on This Website" / "Allow for One Day"). The banner
  only appears after the user allows it there.
- On **iOS**, the grant is managed under **Settings → Apps → Safari →
  Extensions → Closed on Shabbat**, and also inline via the **puzzle-piece /
  "Aa"** menu in the Safari toolbar per site.
- Because access is limited to the dataset's domains, the user never faces an
  "allow on all websites" prompt — which matches the extension's privacy posture
  and reads well in review.

---

## Feature deltas vs. the Chrome build

The extension has two user-facing signals. They fare differently across
platforms:

| Signal | Mechanism | Chrome | macOS Safari | iOS Safari |
| --- | --- | --- | --- | --- |
| **Banner** | content script + Shadow DOM | ✅ | ✅ | ✅ **core signal** |
| **Toolbar badge** | `chrome.action.setBadgeText` + `tabs` | ✅ | ⚠️ limited | ❌ not meaningful |

### The banner is the cross-platform core

The **banner** — the content script that renders the "האתר סגור בשבת" bar into a
Shadow DOM — is the whole point of the extension and works identically on macOS
and iOS Safari. Everything about the wrapper should be validated against the
banner first.

### Drop `tabs` for the iOS build

The **toolbar badge** relies on the `tabs` permission and the toolbar action's
badge text. On **iOS Safari there is no per-tab toolbar badge** — the action
badge API is not a meaningful surface — so the `tabs` permission buys nothing
there. Recommendation:

- **Build the iOS wrapper without the `tabs` permission.** Removing it:
  - drops a permission that does nothing on iOS,
  - **strengthens the privacy story** — `tabs` is exactly the kind of
    broad-sounding permission Apple's reviewers scrutinize, and the extension
    genuinely doesn't need it to show the banner, and
  - removes a source of "why does this need my tabs?" review questions.
- On **macOS**, the badge is partially meaningful (Safari shows the toolbar
  item), so `tabs` may be retained there if the badge is wanted — but even on
  macOS the badge is a secondary cue and dropping `tabs` is a defensible,
  privacy-forward choice. The badge's information (current-site status, whether
  it is currently Shabbat) is already fully available in the **popup**.

Because the Chrome `manifest.config.ts` is owned elsewhere and must not change,
apply this as a **Safari-only manifest delta** at package time — see below.

---

## Safari-specific manifest deltas

These are documented here rather than applied to `manifest.config.ts` /
`vite.config.ts` (which this task must not touch). Apply them to the **copy of
`manifest.json` inside the generated Xcode project** (or via a post-convert
patch step), never to the Chrome source.

1. **Remove `tabs` from `permissions` for the iOS target.**
   Chrome ships `"permissions": ["tabs", "storage"]`. For iOS, ship
   `"permissions": ["storage"]`. The banner needs neither `tabs` nor any host
   permission beyond the generated `content_scripts.matches` / `host_permissions`
   the converter derives.

2. **Badge / `action` on iOS.** The `action` popup is still valid (Safari shows
   the popup), but badge text set via `chrome.action.setBadgeText` is a no-op on
   iOS. No manifest change is required — the background service worker's badge
   calls simply have no visible effect — but pairing this with delta #1 (no
   `tabs`) means the background worker does less and asks for less.

3. **`browser.*` API.** Safari implements the `browser.*` promise-based
   WebExtension API. A `webextension-polyfill` shim (being added separately by
   another agent) lets the same `chrome.*` call sites run on Safari. This
   wrapper assumes that shim is present in `dist/`; no manifest change is needed
   for it.

4. **`web_accessible_resources` / `content_scripts` / icons** convert as-is.
   The converter rewrites match patterns and resource paths into the forms
   Safari expects; no manual change needed.

> **Do not** edit `manifest.config.ts`, `vite.config.ts`, or `data/sites.json`
> to achieve any of the above. If the project decides to bake these deltas in,
> the right place is a small post-conversion patch script under `scripts/` or a
> committed override applied to `apple/GeneratedProject/`, kept separate from the
> Chrome build.

---

## Apple binary review notes

The extension's **privacy posture is its strongest review asset**, and it is
exactly the profile Apple's binary review rewards. From
[`PRIVACY.md`](../PRIVACY.md):

- **No network request of its own** — the site list ships inside the extension
  and every check runs locally.
- **No analytics, no telemetry, no identifiers, no cookies, no accounts.**
- **Host access limited to the listed domains** — no `<all_urls>`; access is
  granted per site by the user through Safari.
- The single outbound action (opening a Google Form for a report/appeal) happens
  **only on an explicit user click**, in a new tab.

For the App Store submission this means:
- **App Privacy → "Data Not Collected."** The extension collects no data; declare
  exactly that.
- Justify each permission narrowly: `storage` holds only local user preferences;
  host access is scoped to the dataset's domains for the banner. Dropping `tabs`
  on iOS (delta #1) removes the permission most likely to draw a reviewer
  question.
- Point the review notes at `PRIVACY.md` (Privacy Policy & Terms) as the
  no-network / no-telemetry statement backing the App Privacy answers.

---

## Keeping the wrapper in sync

The wrapper carries **no logic of its own** — it just hosts `dist/`. When the
extension changes:

1. Rebuild and regenerate: `./scripts/build-safari.sh`.
2. Reapply any Safari manifest deltas (see above) if you bake them in.
3. Bump the app/extension version (mirrors `package.json` `version`).
4. Archive and submit the new build.
