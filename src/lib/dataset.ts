import raw from '../../data/sites.json'
import type { Dataset, Site } from '../types.ts'

/**
 * The list is compiled into the bundle, not fetched. It is the repo's source of truth
 * (`data/sites.json`), validated at build time by `scripts/build-data.mjs`, so nothing
 * at runtime has to defend against a malformed or truncated list.
 */
export const dataset = raw as Dataset

export const sites: Site[] = dataset.sites
