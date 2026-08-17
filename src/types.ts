/** Strongest → weakest. The first three justify a firm "closed on Shabbat" headline. */
export type SiteStatus =
  | 'site_blocked'
  | 'purchase_blocked'
  | 'operations_paused'
  | 'declared_shabbat_observant'

export type Confidence = 'verified' | 'high' | 'medium'

/** One entry from `data/sites.json`. Hand-edited, so nothing here is generated. */
export interface Site {
  domain: string
  name: string
  category: string
  status: SiteStatus
  confidence: Confidence
  /** True when the site also closes on Yom Tov; null when the audit could not tell. */
  holidays: boolean | null
  /** How a `site_blocked` site enforces closure. Absent for weaker statuses. */
  mechanism?: string
  /** First-party text the audit found, quoted verbatim. */
  evidence_text: string
  evidence_url: string
  /** ISO date, `YYYY-MM-DD`. */
  verified: string
}

/** Audited and rejected — kept so a domain is not re-proposed and re-checked forever. */
export interface RemovedSite {
  domain: string
  reason: string
}

export interface Dataset {
  schema_version: string
  generated_at: string
  audited_at: string
  country: string
  purpose: string
  audit_note: string
  status_definitions: Record<SiteStatus, string>
  confidence_definitions: Record<Confidence, string>
  sites: Site[]
  removed: RemovedSite[]
  notes: string[]
}

export interface Settings {
  enabled: boolean
  /** Shown on both sides of the banner headline: `⚠️` or `🕯️`. */
  alertSymbol: string
  /** Shabbat starts this many minutes before Friday sunset. */
  candleOffsetMin: number
  /** Shabbat ends this many minutes after Saturday sunset. */
  havdalahOffsetMin: number
  /** Sites below this confidence are not flagged at all. */
  minConfidence: Confidence
  /** Listed domains the user has chosen to stop seeing the banner on. */
  dismissedDomains: string[]
}

export const DEFAULTS: Settings = {
  enabled: true,
  alertSymbol: '⚠️',
  candleOffsetMin: 30,
  havdalahOffsetMin: 40,
  minConfidence: 'medium',
  dismissedDomains: [],
}
