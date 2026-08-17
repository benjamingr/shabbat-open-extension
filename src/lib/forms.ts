import { APPEAL_FORM_ID, FORM_FIELDS, REPORT_FORM_ID } from '../config.ts'

/**
 * A field contributes to the URL only when both its ID and its value are present. With
 * nothing configured this yields the plain form URL, which is the safe default.
 */
function formUrl(formId: string, prefill: [string | null, string | null][]): string {
  const url = new URL(`https://docs.google.com/forms/d/e/${formId}/viewform`)
  let prefilled = false
  for (const [field, value] of prefill) {
    if (!field || !value) continue
    url.searchParams.set(field, value)
    prefilled = true
  }
  if (prefilled) url.searchParams.set('usp', 'pp_url')
  return url.toString()
}

/**
 * Opening either form transmits the domain to Google. Both builders are only ever called
 * to fill in an href the user then chooses to click — nothing is requested automatically,
 * and the extension itself still makes no network request of its own.
 */
export function reportFormUrl(domain: string | null): string {
  return formUrl(REPORT_FORM_ID, [[FORM_FIELDS.report.domain, domain]])
}

export function appealFormUrl(domain: string, verified: string | null): string {
  return formUrl(APPEAL_FORM_ID, [
    [FORM_FIELDS.appeal.domain, domain],
    [FORM_FIELDS.appeal.verified, verified],
  ])
}
