import { DEFAULTS, type Settings, type Site } from '../src/types.ts'

export function makeSite(overrides: Partial<Site> = {}): Site {
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

export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULTS, ...overrides }
}

/**
 * Minimal in-memory stand-in for the slice of `chrome` the extension uses.
 *
 * Hand-written rather than mocked per-test: `chrome.storage.sync.get(defaults)` has
 * behaviour worth reproducing faithfully — it merges over the defaults object it is
 * handed — and a stub that just returned the store would hide bugs instead of finding
 * them.
 */
export function installChromeMock(): {
  store: Record<string, unknown>
  fireChange: (changes: Record<string, unknown>, area?: string) => void
  listeners: ((changes: unknown, area: string) => void)[]
} {
  const store: Record<string, unknown> = {}
  const listeners: ((changes: unknown, area: string) => void)[] = []

  const chromeMock = {
    storage: {
      sync: {
        async get(defaults?: Record<string, unknown>) {
          if (!defaults) return { ...store }
          const out: Record<string, unknown> = {}
          for (const [key, fallback] of Object.entries(defaults)) {
            out[key] = key in store ? store[key] : fallback
          }
          return out
        },
        async set(patch: Record<string, unknown>) {
          Object.assign(store, patch)
        },
      },
      onChanged: {
        addListener(fn: (changes: unknown, area: string) => void) {
          listeners.push(fn)
        },
      },
    },
    runtime: {
      getURL: (path: string) => `chrome-extension://abcdefghijklmnop/${path}`,
    },
  }

  ;(globalThis as { chrome?: unknown }).chrome = chromeMock

  return {
    store,
    listeners,
    fireChange(changes, area = 'sync') {
      for (const fn of listeners) fn(changes, area)
    },
  }
}

export function uninstallChromeMock(): void {
  delete (globalThis as { chrome?: unknown }).chrome
}
