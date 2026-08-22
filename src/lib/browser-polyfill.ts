/**
 * Side-effect module: makes the promise-based `browser` API available on Chrome.
 *
 * Every extension entry point (background, content script, popup, options, proof) imports
 * this first. On Chrome — which has no native `browser` — it installs the
 * webextension-polyfill wrapper over `chrome` onto `globalThis.browser`, so the lazy shim
 * in `browser.ts` resolves to a uniform promise-based API. On Firefox `browser` already
 * exists, so `??=` leaves the native implementation in place.
 *
 * This lives apart from `browser.ts` on purpose: importing webextension-polyfill throws
 * unless it runs inside a real extension (`chrome.runtime.id` must be set), so only entry
 * points — never the shared library modules that the unit tests import — pull it in.
 */
import polyfill from 'webextension-polyfill'

;(globalThis as { browser?: unknown }).browser ??= polyfill
