/**
 * One order, three names.
 *
 * ── Why this file exists ─────────────────────────────────────────────
 *
 * The client raises a **purchase order**. The supplier receives the same
 * piece of paper and files it as its **sales order**. The trade calls the
 * whole thing a **work order**. Settled by the founder, 2026-09-17:
 * *"work order is not separate from PO"*, then *"the PO on the client
 * side is the sales order on the vendor side."*
 *
 * The product used to model that as two rows, `PurchaseOrder` and
 * `SalesOrder`, and only ever wrote the thin one. One row now — and the
 * naming that made two rows look necessary lives here, where it is a
 * display concern and cannot drift into the data.
 *
 * ── Zero training ────────────────────────────────────────────────────
 *
 * CLAUDE.md: *their words, not the system's.* An AP clerk at a client has
 * never in their life filed a "work order" against an invoice — they
 * quote a PO number. A staffing firm's account manager has never raised
 * a purchase order to their own client. Showing either of them the
 * schema's neutral word would be exposing how it is built instead of
 * what it is for. So nothing user-facing says "work order" except where
 * the reader is neither party, which is where the trade's own neutral
 * word is the honest one.
 *
 * No database in here, on purpose.
 */

/** Which end of the order the reader is standing at. */
export type OrderSide = 'BUYER' | 'SELLER' | 'BYSTANDER'

export interface OrderParties {
  /** The buyer — raises it, owns the ceiling. */
  issuedById: string
  /** The seller — bills against it. */
  issuedToId: string
  /** Where invoices go, where that is not the buyer. */
  billToId?: string | null
  /** Who settles, where that is not the bill-to. */
  payerId?: string | null
}

/**
 * Which side of an order a company is on.
 *
 * The bill-to and the payer read it as buyers: a shared service center
 * that never signed the order still pays against its ceiling, and
 * showing them "sales order" would be telling the party writing the
 * check that they are selling.
 *
 * A firm that is neither is a bystander and gets the trade's word. It is
 * not an authorization decision — that is `mayReadOrder` below and the
 * route's own scoping. A bystander who is allowed to see an order at all
 * is usually a rung in the middle of a chain.
 */
export function sideOf(order: OrderParties, companyId: string | null | undefined): OrderSide {
  if (!companyId) return 'BYSTANDER'
  if (companyId === order.issuedToId) return 'SELLER'
  if (companyId === order.issuedById) return 'BUYER'
  if (companyId === order.billToId || companyId === order.payerId) return 'BUYER'
  return 'BYSTANDER'
}

export interface OrderNoun {
  /** "purchase order" · "sales order" · "work order" */
  noun: string
  /** Sentence case, for a heading: "Purchase order". */
  Noun: string
  /** What the trade abbreviates it to on a row: "PO" · "SO" · "WO". */
  short: string
}

const NOUNS: Record<OrderSide, OrderNoun> = {
  BUYER: { noun: 'purchase order', Noun: 'Purchase order', short: 'PO' },
  SELLER: { noun: 'sales order', Noun: 'Sales order', short: 'SO' },
  BYSTANDER: { noun: 'work order', Noun: 'Work order', short: 'WO' },
}

/** What this reader calls it. */
export function orderNoun(side: OrderSide): OrderNoun {
  return NOUNS[side]
}

/** What this reader calls the order they are looking at. */
export function nounFor(order: OrderParties, companyId: string | null | undefined): OrderNoun {
  return orderNoun(sideOf(order, companyId))
}

/**
 * The reference this reader will quote, and whose it is.
 *
 * Two numbers for one document is how the trade actually works: the
 * buyer's PO number is what their AP team matches an invoice against,
 * and the seller keeps its own order reference for its own books. A
 * seller that has not recorded one reads the buyer's, because quoting a
 * number nobody has is worse than quoting theirs.
 */
export function referenceFor(
  order: OrderParties & { number: string; sellerNumber?: string | null },
  companyId: string | null | undefined
): { reference: string; theirs: boolean; says: string } {
  const side = sideOf(order, companyId)
  if (side === 'SELLER' && order.sellerNumber) {
    return {
      reference: order.sellerNumber,
      theirs: true,
      says: `Your order ${order.sellerNumber}, against their ${order.number}.`,
    }
  }
  return {
    reference: order.number,
    theirs: side === 'BUYER',
    says:
      side === 'SELLER'
        ? `Their purchase order ${order.number}. You have not recorded an order number of your own.`
        : `Purchase order ${order.number}.`,
  }
}

/**
 * The whole row in one sentence, in the reader's own words.
 *
 * Used on refusals and confirmations, which is why it takes the ceiling
 * in minor units: a screen that says "authorizes $1,200,000" when the
 * figure was ever divided by a hundred twice is the bug CLAUDE.md
 * records under "every figure on a screen has a sentence".
 */
export function orderSentence(
  order: OrderParties & {
    number: string
    sellerNumber?: string | null
    amountCents: number
    currency?: string | null
  },
  companyId: string | null | undefined,
  counterpartyName: string
): string {
  const side = sideOf(order, companyId)
  const { Noun } = orderNoun(side)
  const ref = referenceFor(order, companyId).reference
  const money = formatMinor(order.amountCents, order.currency ?? 'USD')
  if (side === 'SELLER') {
    return `${Noun} ${ref} — ${counterpartyName} has authorized ${money} of work.`
  }
  if (side === 'BUYER') {
    return `${Noun} ${ref} — authorizes ${money} with ${counterpartyName}.`
  }
  return `${Noun} ${ref} — ${money}.`
}

function formatMinor(cents: number, currency: string): string {
  const symbol = currency.toUpperCase() === 'USD' ? '$' : `${currency.toUpperCase()} `
  return `${symbol}${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}
