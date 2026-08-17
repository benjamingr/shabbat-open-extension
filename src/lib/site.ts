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

export const STATUS_LABEL_HE: Record<SiteStatus, string> = {
  site_blocked: 'האתר נחסם לגלישה בשבת',
  purchase_blocked: 'לא ניתן לרכוש בשבת',
  operations_paused: 'פעולות ומשלוחים מושהים בשבת',
  declared_shabbat_observant: 'האתר מצהיר ששומר שבת',
}

export const CONFIDENCE_LABEL_HE: Record<Confidence, string> = {
  verified: 'מאומת',
  high: 'רמת ודאות גבוהה',
  medium: 'רמת ודאות בינונית',
}

export function isStrong(site: Site): boolean {
  return STRONG_STATUSES.has(site.status)
}

export function meetsConfidence(site: Site, minConfidence: Confidence): boolean {
  return (CONFIDENCE_RANK[site.confidence] ?? 0) >= (CONFIDENCE_RANK[minConfidence] ?? 0)
}
