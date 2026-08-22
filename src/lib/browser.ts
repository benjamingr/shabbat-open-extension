import type { Browser } from 'webextension-polyfill'

/**
 * Promise-based WebExtension API, identical on Chrome and Firefox.
 *
 * Firefox exposes a native, promise-based `browser`. Chrome exposes the callback-based
 * `chrome`; there the entry points install the webextension-polyfill wrapper onto
 * `globalThis.browser` (see `browser-polyfill.ts`), so the same `browser.*` calls resolve
 * to a promise-based surface on both engines.
 *
 * Resolution is deliberately lazy, through a Proxy, for two reasons:
 *   1. `getURL` and friends must be available synchronously the moment a module loads,
 *      so we cannot `await import()` the polyfill.
 *   2. The unit tests install a promise-based `chrome` stand-in *after* these modules are
 *      imported, and swap it between cases. A Proxy re-reads the global on every access,
 *      so the tests never see a stale reference and the polyfill — which throws unless it
 *      runs inside a real extension — is never touched in that context.
 */
type ApiGlobal = typeof globalThis & { browser?: Browser; chrome?: Browser }

function resolveApi(): Browser {
  const g = globalThis as ApiGlobal
  const api = g.browser ?? g.chrome
  if (!api) {
    throw new Error('WebExtension API unavailable: neither `browser` nor `chrome` is defined.')
  }
  return api
}

/**
 * Only the top-level namespace access (`browser.tabs`, `browser.storage`, …) goes through
 * the Proxy; it returns the real nested object, so every method call and `this` binding
 * happens on the genuine `chrome`/`browser` object with no further indirection.
 */
export const browser: Browser = new Proxy({} as Browser, {
  get(_target, prop, receiver) {
    const api = resolveApi()
    return Reflect.get(api as object, prop, receiver)
  },
  has(_target, prop) {
    return Reflect.has(resolveApi() as object, prop)
  },
})

export default browser
