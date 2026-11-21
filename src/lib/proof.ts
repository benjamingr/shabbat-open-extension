import { browser } from './browser.ts'
import { PROOF_IMAGE_BASE } from './remote.ts'
import type { Site } from '../types.ts'

/** URL of the packaged evidence page for one listing. */
export function proofPageUrl(site: Site): string {
  const url = new URL(browser.runtime.getURL('src/proof/index.html'))
  url.searchParams.set('domain', site.domain)
  return url.toString()
}

/** The screenshot as shipped: no network request, no host-page CSP to satisfy. */
export function packagedProofImageUrl(site: Site): string | null {
  return site.proof_image ? browser.runtime.getURL(`proof/${site.proof_image}`) : null
}

/**
 * The screenshot as hosted in the repository.
 *
 * Only reached for a listing that arrived by update: its screenshot is in the repo but not
 * in this build's `dist/proof/`, so the packaged URL 404s. `validate.ts` has already
 * rejected any `proof_image` that is not a bare filename, which is what makes this safe to
 * interpolate.
 */
export function remoteProofImageUrl(site: Site): string | null {
  return site.proof_image ? `${PROOF_IMAGE_BASE}/${encodeURIComponent(site.proof_image)}` : null
}
