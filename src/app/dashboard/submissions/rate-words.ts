/**
 * The words around the rate on the submit form.
 *
 * Pure, so the sentences can be tested without a page.
 */

/** Dollars from minor units, without cents where there are none. */
function dollars(cents: number): string {
  const d = cents / 100
  return Number.isInteger(d) ? `$${d}` : `$${d.toFixed(2)}`
}

/**
 * The band the client gave this firm for this job, as a hint under the
 * rate field. Null where no band was given, so nothing reads as a
 * default the submitter did not choose.
 *
 * The band is this firm's own (`RequirementInvitation`), read from its
 * own invitation, never another firm's.
 */
export function bandHint(band: { payMin: number | null; payMax: number | null } | null | undefined): string | null {
  if (!band) return null
  const { payMin, payMax } = band
  if (payMin != null && payMax != null) return `Your band on this job: ${dollars(payMin)} to ${dollars(payMax)} per hour.`
  if (payMax != null) return `Your band on this job: up to ${dollars(payMax)} per hour.`
  if (payMin != null) return `Your band on this job: from ${dollars(payMin)} per hour.`
  return null
}

/** Said under the rate where there is no band to point at. */
export const RATE_HELP = 'What you will bill the client for each hour. There is no default: type the rate you agreed.'

/**
 * Said beside the currency, because the record keeps one today.
 *
 * The form offered CAD, GBP and EUR and the route dropped the choice: a
 * submission stores a rate in minor units and no currency. A picker whose
 * answer is thrown away is worse than none, so the form says what is
 * recorded until a submission can carry its own currency.
 */
export const CURRENCY_SAYS = 'US dollars. A submission records its rate in US dollars today.'
