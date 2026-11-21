/*
 * Runtime validation of a dataset that did not come out of the bundle.
 *
 * `scripts/build-data.mjs` gates the bundled copy at build time, which is why the rest of
 * the code can read `data/sites.json` without defending itself. A dataset fetched from the
 * network has no such gate behind it, so it gets one here before anything is stored or
 * rendered — same shape rules, minus the checks that need a filesystem.
 *
 * Two rules exist only in this file, because only remote data can violate them:
 *
 *   - `evidence_url` must be https. It is assigned to `link.href` in the banner and on the
 *     proof page; a `javascript:` value would be script execution, in the content script's
 *     case on the host page.
 *   - `proof_image` must be a bare filename. It is interpolated into a URL, so a value
 *     containing a slash or `..` would address something other than the proof folder.
 *
 * Everything is rejected as a whole: a dataset with one bad row is a dataset that was not
 * produced by the pipeline that is supposed to produce it, and partial acceptance would
 * mean shipping a list nobody validated.
 */
import { normalizeHost } from './domain.ts'
import type { Confidence, Dataset, RemovedSite, Site, SiteStatus } from '../types.ts'

const STATUSES: SiteStatus[] = [
  'site_blocked',
  'purchase_blocked',
  'operations_paused',
  'declared_shabbat_observant',
]
const CONFIDENCES: Confidence[] = ['verified', 'high', 'medium']

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const SCHEMA_VERSION = /^\d+\.\d+$/
/** A bare filename: no directory separators, no `..`, no scheme. */
const PROOF_IMAGE = /^[a-z0-9][a-z0-9._-]*\.(webp|png|jpe?g)$/i

/**
 * An upper bound on what is worth putting in `storage.local`, not a statement about how
 * large the list may grow. 78 entries today; a payload orders of magnitude past that is a
 * mistake or an attack, either way not something to write to disk.
 */
export const MAX_SITES = 5000

export type ValidationResult =
  | { ok: true; dataset: Dataset }
  | { ok: false; error: string }

function fail(error: string): ValidationResult {
  return { ok: false, error }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** https only — see the note at the top of the file. */
function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function validateSite(value: unknown, where: string, seen: Set<string>): string | null {
  if (!isRecord(value)) return `${where}: not an object`

  const domain = value['domain']
  if (!isNonEmptyString(domain)) return `${where}: missing domain`
  if (!domain.includes('.')) return `${where} (${domain}): not a domain`

  // The stored form has to be the normalized one. Matching normalizes both sides so a
  // stray "www." would still match, but the raw value is what the popup, the proof page
  // and the dismissed-domains list display and key on.
  if (normalizeHost(domain) !== domain) return `${where} (${domain}): domain is not normalized`
  if (seen.has(domain)) return `${where} (${domain}): duplicate`
  seen.add(domain)

  if (!isNonEmptyString(value['name'])) return `${where} (${domain}): missing name`
  if (!isNonEmptyString(value['category'])) return `${where} (${domain}): missing category`
  if (!STATUSES.includes(value['status'] as SiteStatus)) {
    return `${where} (${domain}): bad status ${JSON.stringify(value['status'])}`
  }
  if (!CONFIDENCES.includes(value['confidence'] as Confidence)) {
    return `${where} (${domain}): bad confidence ${JSON.stringify(value['confidence'])}`
  }
  if (!isNonEmptyString(value['evidence_text'])) {
    return `${where} (${domain}): missing evidence_text`
  }
  if (!isHttpsUrl(value['evidence_url'])) {
    return `${where} (${domain}): evidence_url must be an https URL`
  }
  if (!ISO_DATE.test(String(value['verified']))) {
    return `${where} (${domain}): verified must be YYYY-MM-DD`
  }
  if (value['holidays'] !== null && typeof value['holidays'] !== 'boolean') {
    return `${where} (${domain}): holidays must be true, false, or null`
  }
  if (value['mechanism'] !== undefined && !isNonEmptyString(value['mechanism'])) {
    return `${where} (${domain}): mechanism must be a non-empty string when present`
  }
  if (value['proof_image'] !== undefined) {
    const image = value['proof_image']
    if (typeof image !== 'string' || !PROOF_IMAGE.test(image)) {
      return `${where} (${domain}): proof_image must be a bare image filename`
    }
  }
  return null
}

export function validateDataset(input: unknown): ValidationResult {
  if (!isRecord(input)) return fail('dataset is not an object')

  if (typeof input['schema_version'] !== 'string' || !SCHEMA_VERSION.test(input['schema_version'])) {
    return fail(`bad schema_version ${JSON.stringify(input['schema_version'])}`)
  }
  if (!Number.isInteger(input['revision']) || (input['revision'] as number) < 0) {
    return fail(`revision must be a non-negative integer, got ${JSON.stringify(input['revision'])}`)
  }

  for (const key of ['generated_at', 'audited_at'] as const) {
    if (!ISO_DATE.test(String(input[key]))) return fail(`${key} must be YYYY-MM-DD`)
  }

  const sites = input['sites']
  if (!Array.isArray(sites) || sites.length === 0) return fail('sites[] is missing or empty')
  if (sites.length > MAX_SITES) return fail(`sites[] has ${sites.length} entries, over ${MAX_SITES}`)

  const seen = new Set<string>()
  for (const [i, site] of sites.entries()) {
    const error = validateSite(site, `sites[${i}]`, seen)
    if (error) return fail(error)
  }

  const removed = input['removed']
  if (!Array.isArray(removed)) return fail('removed[] is missing')
  for (const [i, entry] of removed.entries()) {
    if (!isRecord(entry)) return fail(`removed[${i}]: not an object`)
    if (!isNonEmptyString(entry['domain'])) return fail(`removed[${i}]: missing domain`)
    if (!isNonEmptyString(entry['reason'])) return fail(`removed[${i}] (${entry['domain']}): missing reason`)
    // Listed and rejected at once is a contradiction, not a merge artifact to tolerate.
    if (seen.has(normalizeHost(entry['domain']))) {
      return fail(`${entry['domain']}: present in both sites[] and removed[]`)
    }
  }

  /*
   * The proof page reads these straight out of the dataset and puts them on screen, so a
   * definition missing for a status actually in use renders an empty element. Only the
   * values in use are required — a dataset that has stopped using a status need not keep
   * explaining it.
   */
  const statusDefinitions = input['status_definitions']
  const confidenceDefinitions = input['confidence_definitions']
  if (!isRecord(statusDefinitions)) return fail('status_definitions is missing')
  if (!isRecord(confidenceDefinitions)) return fail('confidence_definitions is missing')

  for (const site of sites as Site[]) {
    if (!isNonEmptyString(statusDefinitions[site.status])) {
      return fail(`status_definitions has no entry for "${site.status}"`)
    }
    if (!isNonEmptyString(confidenceDefinitions[site.confidence])) {
      return fail(`confidence_definitions has no entry for "${site.confidence}"`)
    }
  }

  return {
    ok: true,
    // Every field above has been checked; the rest (country, purpose, notes) is text the
    // UI never reads, so it is carried through as-is rather than policed.
    dataset: {
      ...(input as unknown as Dataset),
      sites: sites as Site[],
      removed: removed as RemovedSite[],
    },
  }
}

/**
 * Whether a dataset can be read by this build at all.
 *
 * Major version is the compatibility boundary: a minor bump adds fields, which older code
 * ignores, so `1.3` stays readable by a build that shipped with `1.2`. A major bump means
 * a field this build depends on changed meaning, and the honest response is to keep using
 * the bundled list and wait for a release.
 */
export function isSchemaCompatible(candidate: string, supported: string): boolean {
  const major = (version: string): string => version.split('.')[0] ?? ''
  return major(candidate) !== '' && major(candidate) === major(supported)
}
