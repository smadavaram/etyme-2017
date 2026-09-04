/**
 * People about to come free.
 *
 * The gap this fills is a fortnight wide and expensive. A consultant rolls
 * off on the 28th. Nobody outside their own vendor knows until the 29th,
 * when they appear on the bench — and bench time is the cost that decides
 * whether a staffing firm makes money.
 *
 * Client-side "ending soon" already exists: a programme manager sees which
 * of their own contracts are running out. This is the other side of the
 * same fact, and it is worth much more: the person is still working, still
 * paid, and can be sold into their next engagement before there is a gap.
 *
 * Two things make this different from a bench listing, and both are the
 * point.
 *
 * **They are not available yet.** A listing that says "available" for
 * somebody working until the 28th wastes everybody's time. The date is the
 * headline, not a footnote.
 *
 * **The consultant has to have agreed.** CLAUDE.md is explicit that a
 * submission requires a live listing the consultant granted. Putting
 * somebody in a shop window because their contract has an end date would
 * be the same violation one step earlier.
 */

export interface RollingOff {
  contractId: string
  personId: string
  personName: string
  /** The vendor who employs them and would be selling them on. */
  vendorCompanyId: string
  vendorName: string
  /**
   * Where they are working now — for "done this before" credibility.
   *
   * Null to everybody but the firm that placed them. The consultant agreed
   * to be listed as coming free; they did not agree on behalf of the
   * client, whose competitors read this same list.
   */
  endClientName: string | null
  /**
   * The kind of place, when the name may not be said.
   *
   * "Finishing at an enterprise" carries most of the credibility and none
   * of the relationship. Better than a blank, which reads as somebody with
   * nothing to show.
   */
  endClientSector?: string | null
  endDate: Date
  /** Whether they have agreed to be shown before they are free. */
  consented: boolean
  /** What they do, as it would be searched for. */
  headline: string | null
  skills: string[]
  location: string | null
  /** Their own floor, in cents. Never shown below this. */
  rateFloorCents: number | null
  /** Whether an extension is already being discussed. */
  extensionLikely: boolean
}

export type Window = 'THIS_WEEK' | 'THIS_MONTH' | 'NEXT_QUARTER'

export interface Release {
  contractId: string
  personId: string
  personName: string
  vendorName: string
  vendorCompanyId: string
  headline: string | null
  skills: string[]
  location: string | null
  /** Days until they are free. Negative means they already are. */
  daysUntilFree: number
  freeOn: string
  window: Window
  /** The thing a buyer actually wants to know. */
  proven: string | null
  rateFloorCents: number | null
  /** Said plainly where it changes what a buyer should do. */
  caveat: string | null
}

const DAY = 86_400_000

/**
 * Who to show, and in what order.
 *
 * Ordered by when they come free rather than by fit, because this list is
 * answering "who can start when I need somebody" — and a perfect match
 * available in ninety days is not an answer to a gap starting Monday.
 */
export function releasing(rows: RollingOff[], now: Date, horizonDays = 90): Release[] {
  const out: Release[] = []

  for (const r of rows) {
    // Nobody appears without having agreed to. A contract end date is not
    // consent to be sold.
    if (!r.consented) continue

    const days = Math.ceil((r.endDate.getTime() - now.getTime()) / DAY)

    // Already free is the bench's job, not this list's. Showing them here
    // too would make both lists untrustworthy.
    if (days < 0) continue
    if (days > horizonDays) continue

    out.push({
      contractId: r.contractId,
      personId: r.personId,
      personName: r.personName,
      vendorName: r.vendorName,
      vendorCompanyId: r.vendorCompanyId,
      headline: r.headline,
      skills: r.skills,
      location: r.location,
      daysUntilFree: days,
      freeOn: r.endDate.toISOString().slice(0, 10),
      window: days <= 7 ? 'THIS_WEEK' : days <= 31 ? 'THIS_MONTH' : 'NEXT_QUARTER',
      // What they have actually been doing beats any claim on a profile.
      proven: r.endClientName
        ? `Finishing at ${r.endClientName}`
        : r.endClientSector
          ? `Finishing at ${r.endClientSector}`
          : null,
      rateFloorCents: r.rateFloorCents,
      // The one thing that would waste a buyer's time if it were hidden.
      caveat: r.extensionLikely
        ? 'Their current client is discussing an extension, so they may not come free.'
        : null,
    })
  }

  return out.sort((a, b) => a.daysUntilFree - b.daysUntilFree)
}

export interface PoolSummary {
  total: number
  thisWeek: number
  thisMonth: number
  nextQuarter: number
  /** How many carry a caveat, so the headline number is not oversold. */
  uncertain: number
  summary: string
}

/**
 * The number, said honestly.
 *
 * "Twelve releasing" where four are probably extending is a number that
 * gets somebody's hopes up and then costs them a phone call. The caveats
 * are counted into the sentence rather than hidden in the rows.
 */
export function summarise(releases: Release[]): PoolSummary {
  const thisWeek = releases.filter((r) => r.window === 'THIS_WEEK').length
  const thisMonth = releases.filter((r) => r.window === 'THIS_MONTH').length
  const nextQuarter = releases.filter((r) => r.window === 'NEXT_QUARTER').length
  const uncertain = releases.filter((r) => r.caveat !== null).length

  let summary: string
  if (releases.length === 0) {
    summary = 'Nobody is coming free in the next three months.'
  } else if (thisWeek > 0) {
    summary = `${thisWeek} free within the week, ${releases.length} within three months.`
  } else {
    summary = `${releases.length} coming free within three months, the first in ${releases[0].daysUntilFree} days.`
  }

  if (uncertain > 0) {
    summary += ` ${uncertain} may extend instead.`
  }

  return { total: releases.length, thisWeek, thisMonth, nextQuarter, uncertain, summary }
}

/**
 * Whether a person may be shown at all.
 *
 * The consent question, kept separate because it is the one that must
 * never be got wrong. A vendor cannot put somebody in a shop window
 * because their contract is ending; the consultant decides, the same way
 * they decide about a bench listing.
 */
export interface ConsentCheck {
  mayShow: boolean
  reason: string
}

export function mayShow(input: {
  hasLiveListing: boolean
  listingRevoked: boolean
  consultantOptedOut: boolean
}): ConsentCheck {
  if (input.consultantOptedOut) {
    return { mayShow: false, reason: 'They have asked not to be shown before their contract ends.' }
  }
  if (input.listingRevoked) {
    return { mayShow: false, reason: 'They withdrew their listing.' }
  }
  if (!input.hasLiveListing) {
    return {
      mayShow: false,
      // Named as an ask rather than a fault, because it is a conversation
      // the vendor has to have with the person, not a setting to flip.
      reason: 'They have not agreed to be listed. Ask them before their contract ends, not after.',
    }
  }
  return { mayShow: true, reason: 'They agreed to be listed.' }
}
