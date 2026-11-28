/**
 * The Offer record's rules (record 112, chain 2, "Fill it"): the offer
 * (rate, start date, terms) is a person's. Nothing here is decided by an
 * agent, and nothing here reads a database. Pure.
 *
 * An offer moves Draft, then Proposed by a person, then Accepted or
 * Declined as a person records it. One live offer per submission: the
 * database holds it in `Offer.liveFor`, set to the submission id while the
 * offer is Draft, Proposed or Accepted and cleared once it is Declined or
 * Withdrawn (`liveForOf`).
 */

export type OfferState = 'DRAFT' | 'PROPOSED' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN'
export type OfferAction = 'PROPOSE' | 'ACCEPT' | 'DECLINE' | 'WITHDRAW'

/** Why an offer was declined: a closed list, never free text. The same codes as a submission's reasons where they overlap. */
export const OFFER_DECLINE_REASONS = {
  RATE: 'The rate is too low',
  START_DATE: 'The start date does not work',
  TERMS: 'The terms do not work',
  ACCEPTED_ELSEWHERE: 'Took another job',
  CANDIDATE_WITHDREW: 'Withdrew from the job',
  NO_REPLY: 'No answer',
} as const
export type OfferDeclineReason = keyof typeof OFFER_DECLINE_REASONS

export const isDeclineReason = (v: unknown): v is OfferDeclineReason =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(OFFER_DECLINE_REASONS, v)

const LIVE: readonly OfferState[] = ['DRAFT', 'PROPOSED', 'ACCEPTED']

/** The value of `Offer.liveFor` for a state: the submission id while live, else null. Pure. */
export const liveForOf = (state: OfferState, submissionId: string): string | null => (LIVE.includes(state) ? submissionId : null)

export const OFFER_WORDS: Record<OfferState, string> = {
  DRAFT: 'Draft, not offered yet',
  PROPOSED: 'Offered, waiting for an answer',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  WITHDRAWN: 'Withdrawn',
}

const FROM: Record<OfferAction, { from: readonly OfferState[]; to: OfferState }> = {
  PROPOSE: { from: ['DRAFT'], to: 'PROPOSED' },
  ACCEPT: { from: ['PROPOSED'], to: 'ACCEPTED' },
  DECLINE: { from: ['PROPOSED'], to: 'DECLINED' },
  WITHDRAW: { from: ['DRAFT', 'PROPOSED', 'ACCEPTED'], to: 'WITHDRAWN' },
}

/** The state an act leads to, or the sentence saying why it cannot be taken from this state. Pure. */
export function moveOffer(state: OfferState, action: OfferAction): { ok: true; to: OfferState } | { ok: false; says: string } {
  const rule = FROM[action]
  if (!rule) return { ok: false, says: 'That is not something an offer can do.' }
  if (!rule.from.includes(state)) {
    return { ok: false, says: `This offer is “${OFFER_WORDS[state].toLowerCase()}”, so it cannot be ${PAST[action]} now.` }
  }
  return { ok: true, to: rule.to }
}
const PAST: Record<OfferAction, string> = { PROPOSE: 'offered', ACCEPT: 'recorded as accepted', DECLINE: 'recorded as declined', WITHDRAW: 'withdrawn' }

export interface OfferTyped { rate?: unknown; currency?: unknown; startDate?: unknown; terms?: unknown }
export interface OfferRead { rate: number; currency: string; startDate: string | null; terms: string | null }

/** What was typed, read to what is stored, or the one sentence that says what to fix. Pure. */
export function readOffer(t: OfferTyped): { ok: true; offer: OfferRead } | { ok: false; says: string; field: string } {
  const rate = typeof t.rate === 'string' && t.rate.trim() !== '' ? Number(t.rate) : t.rate
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    return { ok: false, field: 'rate', says: 'Type the hourly rate of the offer, more than zero.' }
  }
  if (Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-6) {
    return { ok: false, field: 'rate', says: 'An hourly rate has at most two decimals.' }
  }
  if (rate >= 10_000_000_000) return { ok: false, field: 'rate', says: 'That rate is too large to be an hourly rate.' }
  const currency = t.currency === undefined || t.currency === null || t.currency === '' ? 'USD' : t.currency
  if (typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency)) {
    return { ok: false, field: 'currency', says: 'Name the currency in three letters, such as USD.' }
  }
  let startDate: string | null = null
  if (t.startDate !== undefined && t.startDate !== null && t.startDate !== '') {
    if (typeof t.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.startDate) || Number.isNaN(new Date(`${t.startDate}T00:00:00Z`).getTime())) {
      return { ok: false, field: 'startDate', says: 'Give the start date as a day, such as 2027-01-11.' }
    }
    startDate = t.startDate
  }
  let terms: string | null = null
  if (t.terms !== undefined && t.terms !== null && t.terms !== '') {
    if (typeof t.terms !== 'string') return { ok: false, field: 'terms', says: 'Write the terms as text.' }
    terms = t.terms.trim().slice(0, 4000) || null
    if (t.terms.trim().length > 4000) return { ok: false, field: 'terms', says: 'The terms are longer than 4,000 characters. Shorten them.' }
  }
  return { ok: true, offer: { rate: Math.round(rate * 100) / 100, currency: currency.toUpperCase(), startDate, terms } }
}

/** Which side of the submission a reader stands on, and what she may do there. */
export type Side = 'BUYER' | 'SUPPLIER' | null

export interface Mays { mayHire: boolean; maySubmit: boolean }

/**
 * Whether this side, with these permissions, may take this act. The buyer
 * (a seat that holds `requirements.write`, the seat that awards) makes,
 * offers and withdraws an offer; either side's person may record what the
 * candidate answered, the supplier through the seat that submits people.
 * Null when she may; the sentence when she may not. Pure.
 */
export function mayTake(action: OfferAction | 'DRAFT', side: Side, m: Mays): string | null {
  if (!side) return 'This offer is between the firm that hired and the firm that put the person forward. It is not on your side of the deal.'
  if (action === 'ACCEPT' || action === 'DECLINE') {
    if (side === 'BUYER' && m.mayHire) return null
    if (side === 'SUPPLIER' && m.maySubmit) return null
    return side === 'BUYER' ? 'Recording an answer is for the hiring manager or whoever places people at your firm.' : 'Recording an answer is for the recruiter who put the person forward.'
  }
  if (side !== 'BUYER') return 'An offer is made by the firm that hires. You can record the answer when it comes.'
  return m.mayHire ? null : 'Making an offer is for the hiring manager or whoever places people at your firm.'
}

/**
 * What the award opens on, from the accepted offer: the hourly rate in
 * cents, only where it is in the buying firm's own currency, and the start
 * day. Nothing where no offer was accepted. Pure.
 */
export function awardFromOffer(
  offer: { state: string; rate: { toString(): string } | number; currency: string; startDate: Date | string | null } | null,
  buyerCurrency: string | null,
): { cents: number | null; startDate: string | null; note: string | null } | null {
  if (!offer || offer.state !== 'ACCEPTED') return null
  const dollars = Number(offer.rate.toString())
  const sameMoney = !buyerCurrency || buyerCurrency.toUpperCase() === offer.currency.toUpperCase()
  const start = offer.startDate ? (offer.startDate instanceof Date ? offer.startDate.toISOString() : offer.startDate).slice(0, 10) : null
  return {
    cents: sameMoney && Number.isFinite(dollars) ? Math.round(dollars * 100) : null,
    startDate: start,
    note: sameMoney ? null : `The offer is in ${offer.currency.toUpperCase()}, not ${buyerCurrency!.toUpperCase()}, so the rate is not carried to the award. Type it.`,
  }
}
