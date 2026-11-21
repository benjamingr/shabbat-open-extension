import raw from '../../data/sites.json'
import { browser } from './browser.ts'
import { isSchemaCompatible } from './validate.ts'
import type { Dataset, Site } from '../types.ts'

/**
 * The site list, and where the running extension gets it from.
 *
 * A copy is compiled into the bundle. It is the repo's source of truth
 * (`data/sites.json`), validated at build time by `scripts/build-data.mjs`, so it is
 * always present and always well-formed — every failure path here falls back to it.
 *
 * A newer copy may also have been fetched from the project's repository and cached in
 * `storage.local` (see `remote.ts`), which is what lets a dataset correction reach users
 * without a store release. That copy was validated by `validate.ts` before it was stored.
 *
 * The synchronous `dataset` / `sites` exports are the bundled copy and nothing else.
 * `manifest.config.ts`, `manifest.firefox.ts` and the build scripts read them to generate
 * the content-script match patterns, and that has to stay a pure build-time value — the
 * manifest is fixed at install and cannot be influenced by anything fetched later.
 * Anything rendering to a user should call `getSites()` / `getDataset()` instead.
 */
export const bundled = raw as Dataset

/** The bundled copy. Build-time consumers and tests read this directly. */
export const dataset = bundled

export const sites: Site[] = bundled.sites

/** One key in `storage.local` — `storage.sync` caps an item at 8 KB, well under the list. */
export const CACHE_KEY = 'remoteDataset'

export interface UpdateRecord {
  /** The last dataset that passed validation, or null if none ever has. */
  dataset: Dataset | null
  /** When that dataset was stored. */
  fetchedAt: number | null
  /** When a check last completed, successful or not — this is what the TTL measures. */
  checkedAt: number | null
  /** Last `ETag` seen, replayed as `If-None-Match` so an unchanged list costs a 304. */
  etag: string | null
  /** Why the last check did not produce a new list. Surfaced on the options page. */
  lastError: string | null
}

export const EMPTY_RECORD: UpdateRecord = {
  dataset: null,
  fetchedAt: null,
  checkedAt: null,
  etag: null,
  lastError: null,
}

export async function readRecord(): Promise<UpdateRecord> {
  try {
    const stored = await browser.storage.local.get(CACHE_KEY)
    const record = (stored as Record<string, unknown>)[CACHE_KEY]
    if (!record || typeof record !== 'object') return { ...EMPTY_RECORD }
    return { ...EMPTY_RECORD, ...(record as Partial<UpdateRecord>) }
  } catch {
    // Storage can be unavailable in a torn-down context; the bundled list still works.
    return { ...EMPTY_RECORD }
  }
}

export async function writeRecord(record: UpdateRecord): Promise<void> {
  try {
    await browser.storage.local.set({ [CACHE_KEY]: record })
  } catch {
    // A failed write costs a re-fetch next time and nothing else.
  }
}

/**
 * Update some fields of the record, re-reading it first.
 *
 * A check takes a network round-trip, and the record can be written during it — the worker
 * and the options page's "check now" button both run the same code against one storage
 * key. Writing back a whole record captured before the request would silently restore
 * whatever `dataset` was current *then*, throwing away a list stored in the meantime.
 * Metadata-only updates (a 304, a recorded error) therefore go through here.
 */
export async function patchRecord(patch: Partial<UpdateRecord>): Promise<void> {
  const current = await readRecord()
  await writeRecord({ ...current, ...patch })
}

/**
 * Whether a cached dataset should be preferred over the bundled one.
 *
 * Re-checked on every read rather than trusted from write time, because the extension can
 * be *updated* underneath its own cache: a new build ships a higher `revision`, or drops
 * support for the schema major the cached copy was written against. Both make a
 * previously-good cache the wrong answer, and neither involves the cache changing.
 *
 * Full re-validation is not repeated here — it ran before the write, and `storage.local`
 * is not reachable from a web page.
 */
export function isUsable(candidate: Dataset | null | undefined): candidate is Dataset {
  if (!candidate) return false
  if (!isSchemaCompatible(candidate.schema_version, bundled.schema_version)) return false
  return Number.isInteger(candidate.revision) && candidate.revision > bundled.revision
}

/** The newest list this install is entitled to use. Never throws, never blocks on network. */
export async function getDataset(): Promise<Dataset> {
  const { dataset: cached } = await readRecord()
  return isUsable(cached) ? cached : bundled
}

export async function getSites(): Promise<Site[]> {
  return (await getDataset()).sites
}

/**
 * Fires when the cached list is replaced, from any context.
 *
 * The badge and any open page are drawn from whichever list was current at the time; a
 * refresh that lands afterwards has to say so, or a newly listed site stays unbadged until
 * the next navigation.
 */
export function onDatasetChanged(handler: () => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && CACHE_KEY in changes) handler()
  })
}
