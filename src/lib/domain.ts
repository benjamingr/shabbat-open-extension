import type { Site } from '../types.ts'

/**
 * Bare lowercase host, without a leading `www.` or a trailing dot.
 *
 * Inputs are always already-parsed hostnames (`location.hostname`, or `URL.hostname` of a
 * tab URL), which Chrome hands over lowercased and punycode-encoded — so no URL parsing
 * or IDN conversion is needed here.
 */
export function normalizeHost(host: string | null | undefined): string {
  if (!host) return ''
  return host.toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
}

/** Hostname of a URL string, or "" when it is not a parseable URL. */
export function hostFromUrl(url: string | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/**
 * Find the dataset entry for a hostname: an exact match, or any subdomain of a listed
 * domain.
 *
 * Deliberately *not* a registrable-domain comparison. The dataset lists
 * `yudaica.starmap.co.il`, a subdomain — collapsing both sides to their registrable
 * domain would resolve it to `starmap.co.il` and flag the unrelated parent site.
 */
export function matchSite(host: string, list: readonly Site[]): Site | null {
  const h = normalizeHost(host)
  if (!h) return null
  for (const site of list) {
    const domain = normalizeHost(site.domain)
    if (h === domain || h.endsWith('.' + domain)) return site
  }
  return null
}
