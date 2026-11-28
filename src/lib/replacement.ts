/**
 * Replacing the person on a placement.
 *
 * A consultant leaves mid-contract and the supplier puts somebody else
 * in the seat. The 2017 build had contract candidates for exactly this;
 * here BuyContractCandidate carried a REPLACED state nothing wrote, and
 * a sell contract has one person on it.
 *
 * The honest model: a replacement is a new contract on the same seat.
 * The old sell contract ends the day before; a new one starts on the
 * day, with the same client, rate, terms, purchase order and engagement;
 * the buy contract keeps running with the old candidate REPLACED and the
 * new one ACTIVE from the same day. Tenure, invoices and timesheets stay
 * with the person who earned them, which is the whole reason not to
 * overwrite a name.
 */

export type ReplaceVerdict =
  | { ok: true; endsOn: Date; startsOn: Date; says: string }
  | { ok: false; code: 'NOT_RUNNING' | 'SAME_PERSON' | 'NOT_ON_BENCH' | 'OUTSIDE_TERM' | 'TOO_FAR_BACK'; message: string }

const DAY = 86_400_000

export function mayReplace(input: {
  state: string
  startDate: Date
  endDate: Date | null
  from: Date
  now: Date
  outgoingName: string
  incomingName: string
  samePerson: boolean
  incomingOnBench: boolean
}): ReplaceVerdict {
  const { from, now } = input
  if (input.state !== 'IN_PROGRESS') {
    return { ok: false, code: 'NOT_RUNNING', message: `${input.outgoingName}'s contract is not running, so there is nobody to replace.` }
  }
  if (input.samePerson) {
    return { ok: false, code: 'SAME_PERSON', message: `${input.incomingName} is already the person on this contract.` }
  }
  if (!input.incomingOnBench) {
    return { ok: false, code: 'NOT_ON_BENCH', message: `${input.incomingName} is not on your bench. Add them, with their consent, and try again.` }
  }
  if (from.getTime() < now.getTime() - 14 * DAY) {
    return { ok: false, code: 'TOO_FAR_BACK', message: 'A replacement can be dated up to two weeks back, not further. Hours already signed belong to whoever worked them.' }
  }
  if (from.getTime() < input.startDate.getTime() || (input.endDate && from.getTime() > input.endDate.getTime())) {
    return { ok: false, code: 'OUTSIDE_TERM', message: 'The replacement date has to fall inside the contract.' }
  }
  const endsOn = new Date(from.getTime() - DAY)
  return {
    ok: true,
    endsOn,
    startsOn: from,
    says: `${input.incomingName} takes over from ${input.outgoingName} on ${from.toISOString().slice(0, 10)}. ${input.outgoingName}'s contract ends the day before; the client has been told.`,
  }
}

// ── The new line goes on the same document ───────────────────────────
//
// A purchase order is a header and its lines (CLAUDE.md, 2026-09-18).
// Replacing somebody does not raise a second order: the client
// authorized a seat and a ceiling, and who stands in the seat is a line
// on the paper it already signed. So the new line is written onto the
// same header, with the header's own terms, and the only things that
// change are the person and the dates.
//
// Three writers create lines — the award, the convert, and this. The
// other two are `etyme-demand`'s; this one is here, and all three have
// to agree or a replacement quietly starts a second document.

import { termsFor, type OrderHeader } from '@/lib/money/order-terms'

export type { OrderHeader }

/** The line being replaced, as much of it as the new one copies. */
export interface SeatLine {
  /** The document it hangs on. Null on every row written before the award raised one. */
  workOrderId: string | null
  /** The master contract it is tagged to, where the company tags. Carried, never invented. */
  projectOrderId?: string | null
  engagementId?: string | null
  msaId?: string | null
  billFrequency?: string | null
  billAnchor?: string | null
  billStraddle?: string | null
  paymentTerms?: number | null
  paymentTermsFrom?: string | null
}

export interface NextLine {
  workOrderId: string | null
  projectOrderId: string | null
  engagementId: string | null
  msaId: string | null
  billFrequency: string
  billAnchor: string
  billStraddle: string
  paymentTerms: number | null
  startDate: Date
  endDate: Date | null
  /** ORDER where the document answered, LINE where only the old row did. */
  termsFrom: 'ORDER' | 'LINE' | 'DEFAULT'
  /** The new line runs past the last day of the order that authorizes it. */
  outsideOrderWindow: boolean
  says: string
}

/**
 * What the replacement line is created with.
 *
 * The four rhythm-and-terms columns are resolved through money's one
 * door (`lib/money/order-terms`) rather than copied off the old row, so
 * a document that says BIWEEKLY is not quietly overridden by a line
 * carrying the schema's MONTHLY default. The dates stay the line's,
 * because a line is a person and a document is not — the person taking
 * over starts the day they take over.
 *
 * Running past the order's last day is reported, never trimmed. Cutting
 * a placement short because its paper expired is a decision for a
 * person; a silent date change is the kind of wrong nobody audits.
 */
export function nextLineOnSameDocument(input: {
  old: SeatLine
  header: OrderHeader | null
  startsOn: Date
  endsOn: Date | null
  outgoingName: string
  incomingName: string
}): NextLine {
  const { old, header } = input
  const terms = termsFor('SELL', {
    ...old,
    startDate: input.startsOn,
    endDate: input.endsOn,
    workOrder: header,
  })

  const onOrder = old.workOrderId != null
  // Neutral on purpose: what the paper is called depends on which end of
  // it the reader stands at, and that is `lib/order-naming`'s answer, not
  // a writer's. This says which document, never what to call it.
  const says = onOrder
    ? header?.number
      ? `${input.incomingName} goes on ${header.number} — the same document ${input.outgoingName} was a line on. Nothing was renegotiated.`
      : `${input.incomingName} goes on the same document ${input.outgoingName} was a line on.`
    : `${input.outgoingName}'s seat is not on a document, so ${input.incomingName}'s line is not either. The paper, when it arrives, attaches to both.`

  return {
    // The same document, always. A replacement that raised a second
    // order would bill a client twice against one authorization.
    workOrderId: old.workOrderId,
    projectOrderId: old.projectOrderId ?? null,
    engagementId: old.engagementId ?? null,
    msaId: old.msaId ?? null,
    billFrequency: terms.frequency,
    billAnchor: terms.anchor,
    billStraddle: terms.straddle,
    paymentTerms: terms.paymentTermsDays,
    startDate: input.startsOn,
    endDate: input.endsOn,
    termsFrom: terms.from.frequency,
    outsideOrderWindow: terms.outsideOrderWindow,
    says,
  }
}
