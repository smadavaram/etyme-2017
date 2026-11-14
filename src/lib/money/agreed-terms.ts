/**
 * The pay terms a person agreed to when she said yes to this firm's
 * bench, read for the Record a placement form (Tapin walk, 2026-11-14).
 *
 * The form starts from them and the person recording can change both.
 * Nothing here is stored or priced: it fills two boxes and says where
 * they came from. A rate in a currency the form does not take is said,
 * never typed into the box, because the box would send it as dollars.
 *
 * Pure.
 */
import { ENGAGEMENT_TYPES, ENGAGEMENT_WORDS, perHour, type EngagementType } from '@/lib/award/hire-terms'
import { minorPerUnit } from '@/lib/money'

/** One bench listing, as GET /api/consultants returns it. */
export interface ListingTerms {
  termsEngagementType?: string | null
  termsPayRateCents?: number | null
  termsPayCurrency?: string | null
  termsAgreed?: boolean
}

export interface AgreedTerms {
  /** The engagement to start the form on. Null where none was agreed. */
  engagementType: EngagementType | null
  /** The rate as the form's box holds it ("45.00"). Null where not filled. */
  payRate: string | null
  /** The currency to start the pay currency box on. Null where not filled. */
  payCurrency: string | null
  /** The one line under the boxes saying where they came from. */
  says: string
}

/**
 * The terms to start the form from, or null where she agreed none.
 * `homeCurrency` is the firm's own, which a listing with no currency is
 * in. `offered` is the currencies the form's pay box takes.
 */
export function agreedTermsFrom(
  listings: readonly ListingTerms[] | null | undefined,
  personName: string,
  homeCurrency: string | null | undefined,
  offered: readonly string[]
): AgreedTerms | null {
  const agreed = (listings ?? []).find((l) => l?.termsAgreed === true)
  if (!agreed) return null

  const t = String(agreed.termsEngagementType ?? '').toUpperCase()
  // Only the kinds a listing records; "employed by another firm" never is.
  const engagementType = (ENGAGEMENT_TYPES as readonly string[]).includes(t) && t !== 'OTHER_EMPLOYER'
    ? (t as EngagementType)
    : null

  const currency = (agreed.termsPayCurrency || homeCurrency || '').toUpperCase() || null
  const cents = agreed.termsPayRateCents
  const said = currency ? perHour(cents, currency) : null
  const fits = said != null && currency != null && offered.includes(currency) && minorPerUnit(currency) === 100
  const payRate = fits ? (Number(cents) / 100).toFixed(2) : null

  if (!engagementType && !said) return null

  const parts = [engagementType ? ENGAGEMENT_WORDS[engagementType] : null, said].filter(Boolean).join(', ')
  const says = said && !fits
    ? `${personName} agreed to ${parts} on your bench. This form cannot take ${currency}, so the pay rate is left blank.`
    : `Filled from the terms ${personName} agreed to on your bench: ${parts}. You can change them.`
  return { engagementType, payRate, payCurrency: fits ? currency : null, says }
}

/** The four boxes on the form that agreed terms touch. */
export interface TermsBoxes {
  personId: string
  engagementType: string
  payRate: string
  payCurrency: string
  boughtFromId: string
}

/** True where the boxes still hold exactly what these terms filled. */
export function stillAgreed(form: TermsBoxes, agreed: AgreedTerms | null): boolean {
  if (!agreed) return false
  return (!agreed.engagementType || form.engagementType === agreed.engagementType)
    && (agreed.payRate == null || (form.payRate === agreed.payRate && form.payCurrency === agreed.payCurrency))
}

/**
 * The form after choosing a person: her agreed terms fill "engaged as"
 * and the pay rate, both still editable. Boxes the last person's terms
 * filled, and nobody changed, are emptied first, so one person's rate is
 * never left on another. Where she is bought from a supplier, the terms
 * are between her and that supplier, and nothing is filled.
 */
export function withAgreed<F extends TermsBoxes>(form: F, personId: string, before: AgreedTerms | null, next: AgreedTerms | null): F {
  const out: F = { ...form, personId }
  if (before && stillAgreed(form, before)) {
    if (before.engagementType) out.engagementType = ''
    if (before.payRate != null) out.payRate = ''
  }
  if (!next || form.boughtFromId) return out
  if (next.engagementType) out.engagementType = next.engagementType
  if (next.payRate != null && next.payCurrency) {
    out.payRate = next.payRate
    out.payCurrency = next.payCurrency
  }
  return out
}
