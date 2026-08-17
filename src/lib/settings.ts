import { DEFAULTS, type Settings } from '../types.ts'

/**
 * Settings live as flat keys in `chrome.storage.sync`, one key per field — not nested
 * under a single object. Flat means a new field is simply a key nobody has written yet,
 * so `DEFAULTS` fills it in and no install ever needs a migration.
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

/** Write only the given fields. Everything else in storage is left alone. */
export async function setSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(patch)
}

/**
 * Fires whenever any settings key changes, including from another window or another
 * synced machine. The handler receives the full merged settings, not the diff, so
 * callers never have to reason about which keys were in the change set.
 */
export function onSettingsChanged(handler: (settings: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return
    if (!Object.keys(changes).some((key) => key in DEFAULTS)) return
    void getSettings().then(handler)
  })
}
