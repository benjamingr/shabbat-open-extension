import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dismissDomain,
  getSettings,
  onSettingsChanged,
  setSettings,
  undismissDomain,
} from '../src/lib/settings.ts'
import { DEFAULTS } from '../src/types.ts'
import { installChromeMock, uninstallChromeMock } from './helpers.ts'

let mock: ReturnType<typeof installChromeMock>

beforeEach(() => {
  mock = installChromeMock()
})

afterEach(() => {
  uninstallChromeMock()
  vi.restoreAllMocks()
})

describe('getSettings', () => {
  it('returns the defaults for a fresh install', async () => {
    await expect(getSettings()).resolves.toEqual(DEFAULTS)
  })

  it('overlays stored values on the defaults', async () => {
    mock.store['minConfidence'] = 'verified'
    const settings = await getSettings()
    expect(settings.minConfidence).toBe('verified')
    expect(settings.alertSymbol).toBe(DEFAULTS.alertSymbol)
  })

  /*
   * The reason settings are flat keys rather than one nested object: a field added in a
   * later version is simply a key nobody has written, so an install that predates it
   * keeps working with no migration.
   */
  it('fills in a field an older install never stored', async () => {
    mock.store['enabled'] = false
    const settings = await getSettings()
    expect(settings.enabled).toBe(false)
    expect(settings.dismissedDomains).toEqual([])
  })

  it('falls back to the defaults when storage throws', async () => {
    chrome.storage.sync.get = vi.fn().mockRejectedValue(new Error('context invalidated'))
    await expect(getSettings()).resolves.toEqual(DEFAULTS)
  })

  it('never hands out the shared DEFAULTS object', async () => {
    const settings = await getSettings()
    settings.dismissedDomains.push('mutated.co.il')
    expect(DEFAULTS.dismissedDomains).toEqual([])
  })
})

describe('setSettings', () => {
  it('writes only the given fields', async () => {
    mock.store['enabled'] = false
    await setSettings({ minConfidence: 'high' })
    expect(mock.store).toEqual({ enabled: false, minConfidence: 'high' })
  })
})

describe('dismissDomain', () => {
  it('adds a domain', async () => {
    await dismissDomain('example.co.il')
    expect((await getSettings()).dismissedDomains).toEqual(['example.co.il'])
  })

  it('appends without dropping existing dismissals', async () => {
    await dismissDomain('a.co.il')
    await dismissDomain('b.co.il')
    expect((await getSettings()).dismissedDomains).toEqual(['a.co.il', 'b.co.il'])
  })

  it('is idempotent', async () => {
    await dismissDomain('example.co.il')
    await dismissDomain('example.co.il')
    expect((await getSettings()).dismissedDomains).toEqual(['example.co.il'])
  })

  it('does not write at all when the domain is already dismissed', async () => {
    await dismissDomain('example.co.il')
    const spy = vi.spyOn(chrome.storage.sync, 'set')
    await dismissDomain('example.co.il')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('undismissDomain', () => {
  it('removes one and leaves the rest', async () => {
    await dismissDomain('a.co.il')
    await dismissDomain('b.co.il')
    await undismissDomain('a.co.il')
    expect((await getSettings()).dismissedDomains).toEqual(['b.co.il'])
  })

  it('is a no-op for a domain that was never dismissed', async () => {
    await dismissDomain('a.co.il')
    await undismissDomain('nope.co.il')
    expect((await getSettings()).dismissedDomains).toEqual(['a.co.il'])
  })
})

describe('onSettingsChanged', () => {
  it('fires with the full merged settings, not the diff', async () => {
    const seen: unknown[] = []
    onSettingsChanged((settings) => seen.push(settings))

    mock.store['minConfidence'] = 'high'
    mock.fireChange({ minConfidence: { newValue: 'high' } })
    await vi.waitFor(() => expect(seen).toHaveLength(1))

    expect(seen[0]).toEqual({ ...DEFAULTS, minConfidence: 'high' })
  })

  it('ignores changes in another storage area', async () => {
    const handler = vi.fn()
    onSettingsChanged(handler)
    mock.fireChange({ enabled: { newValue: false } }, 'local')
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(handler).not.toHaveBeenCalled()
  })

  it('ignores keys that are not settings', async () => {
    // The background worker used to re-badge on any storage write at all.
    const handler = vi.fn()
    onSettingsChanged(handler)
    mock.fireChange({ someOtherFeature: { newValue: 1 } })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(handler).not.toHaveBeenCalled()
  })
})
