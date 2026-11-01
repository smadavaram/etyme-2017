/**
 * Whether a bill has been sent, and what its status is called, in one
 * place.
 *
 * ── Why ──────────────────────────────────────────────────────────────
 *
 * The second Tapin walk (2026-10-31): Tapin's bill to Brightmoor was
 * raised and never sent — the three-way check refused it — and Today
 * listed it under "Sent, not yet paid" while Brightmoor's order showed
 * $4,000 drawn for it. Each reader had its own list of which statuses
 * count: the order's page counted every bill but a cancelled one, the
 * check counted everything but a draft, Today's figure took a raised bill
 * as billed. Three lists, three answers about one bill.
 *
 * ── The states ───────────────────────────────────────────────────────
 *
 *   DRAFT           drafted by the supplier's twin; the firm's working paper
 *   ISSUED          raised on the Bills page, not yet sent
 *   SUBMITTED       sent to the firm that pays it
 *   PARTIALLY_PAID  sent, and part of it paid
 *   PAID            paid in full
 *   HELD            sent, and put on hold by the firm that pays it
 *   DISPUTED        sent, and disputed by the firm that pays it
 *   CANCELLED, VOID never counts for anything
 *
 * A bill is sent from SUBMITTED on. Before that nobody has been asked for
 * the money: the payer cannot pay it (`receiptStateRefusal` in
 * lib/invoice-match), the letter refuses to go (lib/notify/bill-delivery),
 * and it draws nothing on its order.
 *
 * Pure: no database, no React.
 */

/** Statuses of a bill nobody has been sent yet. */
export const BILL_NOT_SENT: readonly string[] = ['DRAFT', 'ISSUED']

/** Statuses of a bill that never counts for anything. */
export const BILL_NEVER_COUNTED: readonly string[] = ['CANCELLED', 'VOID']

/**
 * Statuses of a bill that draws nothing on its order: not sent, or never
 * counted. For a `status: { notIn: ... }` filter.
 */
export const DRAWS_NOTHING: readonly string[] = [...BILL_NOT_SENT, ...BILL_NEVER_COUNTED]

export type BillStage = 'DRAFTED' | 'RAISED' | 'SENT' | 'PART_PAID' | 'PAID' | 'ON_HOLD' | 'DISPUTED' | 'CANCELLED'

/** The stage a status is in. An unknown status reads as sent: it is past the two states that are not. */
export function billStage(status: string): BillStage {
  switch (status.toUpperCase()) {
    case 'DRAFT': return 'DRAFTED'
    case 'ISSUED': return 'RAISED'
    case 'PARTIALLY_PAID': return 'PART_PAID'
    case 'PAID': return 'PAID'
    case 'HELD': return 'ON_HOLD'
    case 'DISPUTED': return 'DISPUTED'
    case 'CANCELLED':
    case 'VOID': return 'CANCELLED'
    default: return 'SENT'
  }
}

/** Has the firm that pays it been sent this bill? */
export function isSent(status: string): boolean {
  const s = status.toUpperCase()
  return !BILL_NOT_SENT.includes(s) && !BILL_NEVER_COUNTED.includes(s)
}

/** Does this bill draw on its order's ceiling? Only once it is sent, and never once cancelled. */
export function drawsOnOrder(status: string): boolean {
  return isSent(status)
}

/** Who is reading: the firm that sends the bill, or the firm asked to pay it. */
export type BillReader = 'SENDER' | 'PAYER'

const SENDER_WORD: Record<BillStage, string> = {
  DRAFTED: 'Drafted, not sent',
  RAISED: 'Raised, not sent',
  SENT: 'Sent, not yet paid',
  PART_PAID: 'Part paid',
  PAID: 'Paid',
  ON_HOLD: 'On hold at the payer',
  DISPUTED: 'Disputed by the payer',
  CANCELLED: 'Cancelled',
}

const PAYER_WORD: Record<BillStage, string> = {
  DRAFTED: 'Not submitted yet',
  RAISED: 'Not submitted yet',
  SENT: 'Submitted',
  PART_PAID: 'Part paid',
  PAID: 'Paid',
  ON_HOLD: 'On hold',
  DISPUTED: 'Disputed',
  CANCELLED: 'Cancelled',
}

/**
 * The status as the reader says it. A drafted or raised bill is never
 * "sent"; a sent bill is never "drafted".
 */
export function billStateWord(status: string, reader: BillReader = 'SENDER'): string {
  const stage = billStage(status)
  return reader === 'PAYER' ? PAYER_WORD[stage] : SENDER_WORD[stage]
}

/** "Bill IN-0042 is drafted, not sent." · "Bill IN-0042 is raised, not sent." — one sentence for a bill nobody has been sent. */
export function notSentSays(bill: { number: string; status: string }): string {
  const word = billStateWord(bill.status, 'SENDER')
  return `Bill ${bill.number} is ${word.charAt(0).toLowerCase()}${word.slice(1)}.`
}
