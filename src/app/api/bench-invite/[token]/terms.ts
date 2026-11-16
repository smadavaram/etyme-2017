import { termsShown, firmFacts, type TermsShown, type TermsFirm, type TermsRow } from '@/lib/bench-filter'
import { compact } from '@/lib/money-display'

/**
 * The pay terms on a bench invitation, as the person reads them on the
 * page the emailed link opens.
 *
 * A firm may state how it would engage somebody and what it would pay
 * when it lists them (`termsShown` in lib/bench-filter). Their own
 * "Who has you" page already printed those terms beside the yes; the
 * link page did not, so a yes through the link let a firm market
 * somebody on terms the person never read and never agreed. This is the
 * link's half of the same rule, in the same words, so the sentence above
 * the button and the sentence after it agree.
 *
 * `seen` is what the page sends back with the yes. The route hands it to
 * `agreeingTerms`, which agrees the terms only when they are still the
 * ones on the listing.
 */
export interface InviteTerms {
  /** The stated terms, or null where the firm stated none. */
  shown: TermsShown | null
  /** One plain sentence for the page, whichever way it is. */
  says: string
  /** What a yes from this page sends back, or null where nothing was stated. */
  seen: { engagementType: string; payRateCents: number; payCurrency: string } | null
}

export function inviteTerms(
  l: TermsRow,
  firm: TermsFirm
): InviteTerms {
  const vendor = firmFacts(firm).name
  const shown = termsShown(l, firm)
  if (!shown) {
    return {
      shown: null,
      says: `${vendor} has not stated any pay terms yet. Saying yes agrees only that they may put you forward. It agrees no pay.`,
      seen: null,
    }
  }
  return {
    shown,
    says: shown.agreed ? shown.says : `${shown.says} Saying yes agrees these terms.`,
    seen: { engagementType: shown.engagementType, payRateCents: shown.payRateCents, payCurrency: shown.payCurrency },
  }
}

/**
 * The rate range a firm saved on its ask, as the person reads it above
 * the yes (founder, 2026-11-16: "go ahead with your recommendations").
 *
 * Before her yes a firm may save any range on its ask: her lowest rate
 * is never checked then, so the firm cannot learn it by trying rates
 * (`floorRefuses` in lib/consultant-portfolio/before-her-yes). So the
 * check moves to her: she reads the range before she says yes, in the
 * firm's own currency through the one money formatter, and where the top
 * of the range is under the lowest rate on her own record she is told so
 * in one sentence. Only she: `ownFloor` is passed only where the person
 * signed in is the person asked, since the firm holds this link too
 * (Copy link on Bench). Nothing is told to the firm.
 *
 * The range is minor units an hour, typed in the firm's currency
 * (`listingRates` in lib/bench-filter). Her lowest rate carries no
 * currency of its own and is read in the same one, as every check of it
 * does. Null where the firm saved no range: nothing is said about one.
 */
export interface InviteRange {
  /** "Northwind Staffing will put you forward at $80–$90 an hour." */
  says: string
  /** Her own lowest rate, where the range's top is under it and she is the one reading. Else null. */
  belowFloor: string | null
}

export function inviteRange(
  l: { rateMin: number | null; rateMax: number | null },
  firm: TermsFirm,
  /** The lowest rate on her own record, only where she is the one reading. */
  ownFloor: number | null
): InviteRange | null {
  const { name: vendor, currency } = firmFacts(firm)
  const min = l.rateMin != null && l.rateMin > 0 ? l.rateMin : null
  const max = l.rateMax != null && l.rateMax > 0 ? l.rateMax : null
  if (min == null && max == null) return null
  const band =
    min != null && max != null
      ? min === max ? `${compact(min, currency)} an hour` : `${compact(min, currency)}–${compact(max, currency)} an hour`
      : min != null ? `${compact(min, currency)} an hour or more` : `up to ${compact(max, currency)} an hour`
  const below = ownFloor != null && ownFloor > 0 && max != null && max < ownFloor
  return {
    says: `${vendor} will put you forward at ${band}.`,
    belowFloor: below ? `This is below the lowest rate on your record, ${compact(ownFloor, currency)} an hour.` : null,
  }
}
