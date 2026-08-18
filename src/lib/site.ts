import { t } from '../i18n/index.ts'
import type { Confidence, Site, SiteStatus } from '../types.ts'

export const CONFIDENCE_RANK: Record<Confidence, number> = {
  medium: 1,
  high: 2,
  verified: 3,
}

/** Statuses that justify a firm "closed on Shabbat" headline rather than "observes". */
const STRONG_STATUSES = new Set<SiteStatus>([
  'site_blocked',
  'purchase_blocked',
  'operations_paused',
])

export function isStrong(site: Site): boolean {
  return STRONG_STATUSES.has(site.status)
}

export function meetsConfidence(site: Site, minConfidence: Confidence): boolean {
  return (CONFIDENCE_RANK[site.confidence] ?? 0) >= (CONFIDENCE_RANK[minConfidence] ?? 0)
}

export function statusLabel(status: SiteStatus): string {
  return t(`status.${status}`)
}

export function confidenceLabel(confidence: Confidence): string {
  return t(`confidence.${confidence}`)
}
