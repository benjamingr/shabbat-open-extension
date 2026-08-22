import { browser } from './browser.ts'
import { DEFAULTS, type Settings } from '../types.ts'

/**
 * Settings live as flat keys in `browser.storage.sync`, one key per field — not nested
 * under a single object. Flat means a new field is simply a key nobody has written yet,
 * so `DEFAULTS` fills it in and no install ever needs a migration.
 */
/**
 * Spreading DEFAULTS is not enough: that copies the reference to `dismissedDomains`, so
 * every caller would share one array with the module-level constant and a single push
 * would corrupt the defaults for the lifetime of the worker.
 */
function detach(settings: Settings): Settings {
  return { ...settings, dismissedDomains: [...settings.dismissedDomains] }
}

export async function getSettings(): Promise<Settings> {
  try {
    // Passing the defaults as the query fills in every key that has never been written.
    const stored = await browser.storage.sync.get(detach(DEFAULTS) as unknown as Record<string, unknown>)
    return detach({ ...DEFAULTS, ...(stored as Partial<Settings>) })
  } catch {
    // Storage can be unavailable in a torn-down context; defaults keep the UI working.
    return detach(DEFAULTS)
  }
}

/** Write only the given fields. Everything else in storage is left alone. */
export async function setSettings(patch: Partial<Settings>): Promise<void> {
  await browser.storage.sync.set(patch)
}

/**
 * Stop showing the banner on a listed domain, permanently and across machines.
 *
 * Keyed by the *listed* domain rather than the current hostname, so dismissing from
 * `shop.example.co.il` also covers `example.co.il` — it is one listing either way.
 */
export async function dismissDomain(domain: string): Promise<void> {
  const { dismissedDomains } = await getSettings()
  if (dismissedDomains.includes(domain)) return
  await setSettings({ dismissedDomains: [...dismissedDomains, domain] })
}

export async function undismissDomain(domain: string): Promise<void> {
  const { dismissedDomains } = await getSettings()
  await setSettings({ dismissedDomains: dismissedDomains.filter((d) => d !== domain) })
}

/**
 * Fires whenever any settings key changes, including from another window or another
 * synced machine. The handler receives the full merged settings, not the diff, so
 * callers never have to reason about which keys were in the change set.
 */
export function onSettingsChanged(handler: (settings: Settings) => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return
    if (!Object.keys(changes).some((key) => key in DEFAULTS)) return
    void getSettings().then(handler)
  })
}
