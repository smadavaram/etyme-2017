/**
 * The header a placement's line hangs on — found, or raised with it.
 *
 * A purchase order is one document: a header and its lines (CLAUDE.md,
 * 2026-09-18). The header is the commitment to a counterparty — who, how
 * much, over what dates, on what terms. A line is one person at one rate
 * at one site, which is what `SellContract` and `BuyContract` are.
 *
 * Two routes on the demand side create a contract pair — the award and
 * the older convert path — and a third writer, `lib/replacement`, puts a
 * new person on a line that already has a header. All three have to
 * agree, or a placement quietly starts a second document against one
 * authorization and the client is billed twice against one ceiling. So
 * the rule lives here, once, and the arithmetic under it lives in
 * `lib/award` where it can be read without a database.
 *
 * The rule: **one open order per buyer-and-seller pair.** The same one
 * `POST /api/purchase-orders` applies from the other end when it
 * attaches running contracts to a newly raised order, and the same one
 * `lib/seed-order-to-cash` uses so a re-seed finds its own orders rather
 * than colliding on `@@unique([issuedById, number])`.
 */

import type { Prisma } from '@prisma/client'
import { chooseHeader, headerWindow, orderNumbers, orderNumberAttempt, ORDER_RHYTHM } from '@/lib/award'
import { termsFor } from '@/lib/money/order-terms'

/** A transaction client or the plain one; only the order table is touched. */
type OrderWriter = Pick<Prisma.TransactionClient, 'workOrder'>

/**
 * Exactly the columns a caller needs back. Selected in one place so two
 * callers cannot load half a header and get quietly different answers.
 */
export const HEADER_SELECT = {
  id: true, number: true, sellerNumber: true,
  issuedById: true, issuedToId: true, status: true,
  startDate: true, endDate: true,
  billFrequency: true, billAnchor: true, billStraddle: true, paymentTerms: true,
} as const

export interface HeaderInput {
  /** Who pays. The buyer reads this row as its purchase order. */
  buyerId: string
  /** Who bills. The seller reads the same row as its sales order. */
  sellerId: string
  /** Which of them actually typed it in. */
  recordedById: string
  title: string
  /** The ceiling, in whole currency units — `WorkOrder.amount` is not cents. */
  amountDollars: number
  currency: string
  paymentTerms: number
  msaId: string | null
  engagementId: string | null
  /** Where the work happens, where anybody knows. */
  shipToId: string | null
  /** The line about to go on it. */
  start: Date
  end: Date | null
}

export interface FoundHeader {
  id: string
  number: string
  sellerNumber: string | null
  issuedById: string
  issuedToId: string
  status: string
  startDate: Date
  endDate: Date | null
  billFrequency: string
  billAnchor: string
  billStraddle: string
  paymentTerms: number
  /** True where this call raised it, false where the line joined one. */
  raised: boolean
  /** Why, in a sentence, for the log and the screen. */
  says: string
}

export async function headerFor(db: OrderWriter, input: HeaderInput): Promise<FoundHeader> {
  const candidates = await db.workOrder.findMany({
    where: { issuedById: input.buyerId, issuedToId: input.sellerId },
    select: HEADER_SELECT,
  })

  const choice = chooseHeader(candidates, {
    issuedById: input.buyerId,
    issuedToId: input.sellerId,
    start: input.start,
    end: input.end,
  })

  if (choice.id) {
    const found = candidates.find((c) => c.id === choice.id)!
    return { ...found, raised: false, says: choice.says }
  }

  // Both numbers, derived from the two ids so the same pair lands on the
  // same paper every time. A number an earlier, now-closed order already
  // took is stepped past rather than colliding on the unique the
  // database holds per issuer.
  const base = orderNumbers({ buyerId: input.buyerId, sellerId: input.sellerId, on: input.start })
  const wanted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => orderNumberAttempt(base.number, n))
  const taken = new Set(candidates.map((c) => c.number))
  for (const other of await db.workOrder.findMany({
    where: { issuedById: input.buyerId, number: { in: wanted } },
    select: { number: true },
  })) {
    taken.add(other.number)
  }
  const number = wanted.find((n) => !taken.has(n)) ?? `${base.number}-${Date.now()}`

  const window = headerWindow({ start: input.start, end: input.end })

  const raised = await db.workOrder.create({
    data: {
      number,
      sellerNumber: base.sellerNumber,
      title: input.title,
      issuedById: input.buyerId,
      issuedToId: input.sellerId,
      recordedById: input.recordedById,
      amount: input.amountDollars,
      currency: input.currency,
      billingBasis: 'TIME',
      // The shipped rhythm, written on the header and copied down onto
      // the line, so the two rows cannot disagree on the day they are
      // made. A client billed on another rhythm changes it on the
      // order, which is the document that says so.
      ...ORDER_RHYTHM,
      paymentTerms: input.paymentTerms,
      // Never ours to set and never the supplier's. Whether a client's
      // silence approves a timesheet is the client's own term on the
      // client's own order.
      autoApproveTimesheets: false,
      shipToId: input.shipToId,
      msaId: input.msaId,
      engagementId: input.engagementId,
      status: 'OPEN',
      startDate: window.startDate,
      endDate: window.endDate,
    },
    select: HEADER_SELECT,
  })

  return { ...raised, raised: true, says: choice.says }
}

/**
 * The four fields a line copies from the header it is on.
 *
 * Only where this award or this conversion raised that header. Joining
 * an order somebody else raised is not license to rewrite a term they
 * agreed: the line keeps what the agreement cascade gave it, the
 * difference is reported in words, and money's readers prefer the
 * header anyway (`lib/money/order-terms`), so nothing is billed on the
 * losing copy.
 *
 * The values are taken through money's door rather than copied across,
 * because the two rows do not share a vocabulary — a header says
 * `CONTRACT_START` and `TO_EARLIER` where a line says `CONTRACT` and
 * `START` — and writing the header's spelling onto a line would store a
 * word the period engine cannot read.
 */
export function lineTermsFrom(
  header: FoundHeader | null,
  cascadePaymentTerms: number
): { billFrequency: string; billAnchor: string; billStraddle: string; paymentTerms: number } {
  if (!header?.raised) return { ...ORDER_RHYTHM, paymentTerms: cascadePaymentTerms }
  const terms = termsFor('SELL', { workOrder: header })
  return {
    billFrequency: terms.frequency,
    billAnchor: terms.anchor,
    billStraddle: terms.straddle,
    paymentTerms: terms.paymentTermsDays ?? cascadePaymentTerms,
  }
}
