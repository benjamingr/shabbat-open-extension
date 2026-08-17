import { DEFAULTS, type Settings } from '../types.ts'

/**
 * Settings live as flat keys in `chrome.storage.sync`, one key per field. Flat rather
 * than nested under a single object so that adding a field never has to migrate what
 * existing installs already have stored.
 */
export async function getSettings(): Promise<Settings> {
  try {
    // Passing the defaults as the query fills in every key that has never been written.
    const stored = await chrome.storage.sync.get({ ...DEFAULTS } as Record<string, unknown>)
    return { ...DEFAULTS, ...(stored as Partial<Settings>) }
  } catch {
    // Storage can be unavailable in a torn-down context; defaults keep the UI working.
    return { ...DEFAULTS }
  }
}
