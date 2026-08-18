/**
 * External identifiers.
 *
 * These are the project's two Google Forms. They belong to the project's *alias* Google
 * account, never a personal one — the response sheet shows the owner to anyone who is
 * given access. See the README's moderation section before replacing them.
 */

/** "This site closes on Shabbat" — https://forms.gle/1tQJ3QbNWEB4SrK67 */
export const REPORT_FORM_ID = '1FAIpQLSe3-RYKDPhVZqkcAfwGk1IMWuau06B_xWS3diHGSez7VOQlfA'

/** "This site is NOT closed on Shabbat" — https://forms.gle/4TzX8rJbgwq7t96t5 */
export const APPEAL_FORM_ID = '1FAIpQLSejqAFRfjL21YEU0RFTWpADD111mY5L-gSagCFvS64BEaEBIQ'

/**
 * Prefill field IDs, opt-in per question.
 *
 * `null` means the form opens with that question blank and the reporter fills it in.
 * To prefill one instead, take its `entry.NNNNNNN` name from the form's "Get pre-filled
 * link" and put it here — `lib/forms.ts` picks it up with no other change. Google ignores
 * unknown names, so a stale ID degrades to a blank field rather than a broken form.
 */
export const FORM_FIELDS: {
  report: { domain: string | null }
  appeal: { domain: string | null; verified: string | null }
} = {
  report: {
    // Left blank deliberately: a report starts from the reporter, not from a listing.
    domain: null,
  },
  appeal: {
    // "כתובת האתר" — prefilled so an appeal always says which listing it disputes.
    domain: 'entry.630541094',
    // The appeal form has no "verified at" question. Add one and set its ID here to
    // record which snapshot of the listing is being challenged.
    verified: null,
  },
}
