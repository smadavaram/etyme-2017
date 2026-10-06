import { termsShown, type TermsShown } from '@/lib/bench-filter'

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
  seen: { engagementType: string; payRateCents: number } | null
}

export function inviteTerms(
  l: { termsEngagementType: string | null; termsPayRateCents: number | null; termsAgreedAt: Date | null },
  vendor: string
): InviteTerms {
  const shown = termsShown(l, vendor)
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
    seen: { engagementType: shown.engagementType, payRateCents: shown.payRateCents },
  }
}
