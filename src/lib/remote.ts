/*
 * Fetching a newer site list, so a dataset correction does not need a store release.
 *
 * The bundled list is fixed at install, but `data/sites.json` changes far more often than
 * the code does — a new site, a corrected status, an upheld appeal. This module fetches
 * that file from the project's repository, validates it, and caches it in
 * `storage.local`, where `dataset.ts` picks it up.
 *
 * **Data only.** The response is parsed as JSON and nothing else — no `eval`, no
 * `Function`, no dynamic `import`. Executing remotely-hosted code is against both stores'
 * policies, and a JSON list is the whole point here anyway.
 *
 * **No host permission is requested.** raw.githubusercontent.com answers with
 * `access-control-allow-origin: *`, so a cross-origin fetch from the worker succeeds
 * without one. Adding `host_permissions` would raise a new install warning and disable the
 * extension on update until the user re-accepted it — which is precisely the cost this
 * feature exists to avoid.
 *
 * **No `alarms` permission either.** `refreshIfStale()` is a no-op until the TTL has
 * passed, so it can be called freely from the events the worker already handles. MV3
 * workers are torn down constantly; startup plus ordinary tab activity gives more than
 * enough opportunities, with no timer to keep alive.
 *
 * What the user's browser reveals by doing this is an HTTPS GET carrying no extension
 * data — GitHub sees an IP and a timestamp, as it would for any web request. Nothing about
 * which sites were visited is transmitted. `PRIVACY.md` says so in as many words, and the
 * `autoUpdate` setting turns it off.
 */
import { bundled, isUsable, patchRecord, readRecord, writeRecord, type UpdateRecord } from './dataset.ts'
import { getSettings } from './settings.ts'
import { isSchemaCompatible, validateDataset } from './validate.ts'

const REPO_RAW = 'https://raw.githubusercontent.com/benjamingr/shabbat-open-extension/main'

export const DATASET_URL = `${REPO_RAW}/data/sites.json`

/** Where a screenshot lives when it was added to the list after this build shipped. */
export const PROOF_IMAGE_BASE = `${REPO_RAW}/public/proof`

/** Twice a day. The list changes a few times a month; anything tighter is noise. */
export const TTL_MS = 12 * 60 * 60 * 1000

/** A stalled connection must not hold the worker open. */
const TIMEOUT_MS = 10_000

/** Refuses to buffer a body far larger than any plausible list. */
const MAX_BYTES = 2 * 1024 * 1024

export interface UpdateState {
  /** Whether the list currently in use came off the network or out of the bundle. */
  source: 'remote' | 'bundled'
  /** Revision of the list currently in use. */
  revision: number
  fetchedAt: number | null
  checkedAt: number | null
  lastError: string | null
}

export async function getUpdateState(): Promise<UpdateState> {
  const record = await readRecord()
  const remote = isUsable(record.dataset)
  return {
    source: remote ? 'remote' : 'bundled',
    revision: remote ? record.dataset!.revision : bundled.revision,
    fetchedAt: record.fetchedAt,
    checkedAt: record.checkedAt,
    lastError: record.lastError,
  }
}

/**
 * Fetch, validate, and store — unconditionally.
 *
 * Never rejects. Every failure path leaves the last good list exactly where it was and
 * records why, because a list that is a week old is worth incomparably more than no list.
 */
export async function refreshNow(): Promise<UpdateState> {
  const record = await readRecord()
  const now = Date.now()

  try {
    const fetched = await fetchDataset(record.etag)

    if (fetched.notModified) {
      await patchRecord({ checkedAt: now, lastError: null })
      return getUpdateState()
    }

    const result = validateDataset(fetched.body)
    if (!result.ok) throw new Error(`rejected: ${result.error}`)

    const candidate = result.dataset

    if (!isSchemaCompatible(candidate.schema_version, bundled.schema_version)) {
      // Not an error in the dataset — an extension too old to read it. Say that, rather
      // than reporting a fault the user cannot act on except by updating.
      throw new Error(
        `schema ${candidate.schema_version} needs a newer extension ` +
          `(this build reads ${bundled.schema_version})`,
      )
    }

    /*
     * Compared against whichever list is actually in use, not just the cached one: after
     * an extension update the bundled copy can be the newer of the two, and re-storing an
     * older remote list would walk the install backwards.
     */
    // Re-read: the request took a round-trip, during which another context may have
    // stored something. `record` above is only good for the ETag it supplied.
    const latest = await readRecord()
    const current = isUsable(latest.dataset) ? latest.dataset.revision : bundled.revision

    if (candidate.revision <= current) {
      await patchRecord({ checkedAt: now, etag: fetched.etag, lastError: null })
      return getUpdateState()
    }

    const next: UpdateRecord = {
      dataset: candidate,
      fetchedAt: now,
      checkedAt: now,
      etag: fetched.etag,
      lastError: null,
    }
    await writeRecord(next)
  } catch (error) {
    await patchRecord({ checkedAt: now, lastError: messageOf(error) })
  }

  return getUpdateState()
}

/**
 * The scheduled path: does nothing unless the user has updates on and the TTL has passed.
 *
 * Cheap enough to call from a hot path — it is one `storage.local` read before it decides
 * to do nothing.
 */
export async function refreshIfStale(): Promise<void> {
  const { autoUpdate } = await getSettings()
  if (!autoUpdate) return

  const { checkedAt } = await readRecord()
  if (checkedAt !== null && Date.now() - checkedAt < TTL_MS) return

  await refreshNow()
}

interface FetchResult {
  notModified: boolean
  body: unknown
  etag: string | null
}

async function fetchDataset(etag: string | null): Promise<FetchResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(DATASET_URL, {
      // `no-cache` revalidates rather than serving the HTTP cache's copy; the ETag below
      // is what makes that cheap, and it keeps the 5-minute edge cache from deciding how
      // fresh the list is.
      cache: 'no-cache',
      redirect: 'error',
      credentials: 'omit',
      headers: etag ? { 'If-None-Match': etag } : {},
      signal: controller.signal,
    })

    if (response.status === 304) {
      return { notModified: true, body: null, etag }
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const length = Number(response.headers.get('content-length'))
    if (Number.isFinite(length) && length > MAX_BYTES) {
      throw new Error(`body is ${length} bytes, over ${MAX_BYTES}`)
    }

    const text = await response.text()
    if (text.length > MAX_BYTES) throw new Error(`body is ${text.length} bytes, over ${MAX_BYTES}`)

    return {
      notModified: false,
      body: JSON.parse(text) as unknown,
      etag: response.headers.get('etag'),
    }
  } finally {
    clearTimeout(timer)
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    // An aborted fetch reports as "The user aborted a request", which is both wrong and
    // unhelpful — the timeout above is what aborted it.
    return error.name === 'AbortError' ? `timed out after ${TIMEOUT_MS} ms` : error.message
  }
  return String(error)
}
