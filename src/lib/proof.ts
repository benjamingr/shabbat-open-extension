import { browser } from './browser.ts'
import type { Site } from '../types.ts'

/** URL of the packaged evidence page for one listing. */
export function proofPageUrl(site: Site): string {
  const url = new URL(browser.runtime.getURL('src/proof/index.html'))
  url.searchParams.set('domain', site.domain)
  return url.toString()
}
