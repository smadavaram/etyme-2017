/**
 * After an order's header: its first line, or where its lines come from.
 *
 * ── The fault this closes (release walk, 2026-10-27) ────────────────
 *
 * "Raising a PO: 3 fields, 1 click. It has no lines." An order is a
 * header and its lines (CLAUDE.md, "one document, a header and its
 * lines"), and a header with no line is a ceiling nobody can bill from:
 * the bill is raised against a line, a person at a rate at a site.
 *
 * Which of the two is right depends on which end of the order the person
 * stands at:
 *
 *   - **The seller recording paper it was handed** writes its own line:
 *     it bills from it, it knows the person, the rate and the site. So
 *     the screen asks for the first line straight away.
 *   - **A buyer raising an order** that bills somebody above it writes
 *     its own buy line: it knows the person, the rate and the site. So
 *     it is asked for the first line too. A client bills nobody, so it
 *     is told its supplier adds each line from its side.
 *   - **Either, where running placements joined it**, already has lines,
 *     and is told so rather than asked for another.
 *
 * And `mayPinToOrder` is the rule for a line written by hand onto a named
 * order: it goes only on an open order this firm received from the client
 * it bills. No database in here.
 */

export type ReaderEnd = 'BUYER' | 'SELLER'

/** Which line the person writing it would add: the seller bills from a sell line, a buyer pays from a buy line. */
export type FirstLineSide = 'SELL' | 'BUY'

export type AfterHeader =
  | { kind: 'HAS_LINES'; says: string }
  | { kind: 'ASK_FIRST_LINE'; line: FirstLineSide; says: string }
  | { kind: 'SUPPLIER_ADDS'; says: string }

/**
 * What the screen says right after an order's header is written.
 *
 * Corrected by the second onboarding walk, 2026-10-27: a buyer raising a
 * purchase order to a supplier knows the person, the rate and the site,
 * so it is asked for the first line too, on the same screen. The only
 * buyer that is not is a client: it bills nobody, so it has no line of
 * its own to write, and each line on its order is the supplier's, added
 * from the supplier's side. "Lines come from the award" is not said here:
 * an order written by hand has no award behind it.
 */
export function afterHeader(input: {
  /** Which end of the order the person who wrote it stands at. */
  end: ReaderEnd
  /** True where that end is a client, which bills nobody and so writes no line of its own. */
  isClient: boolean
  /** The other firm on it, by name. */
  counterpartyName: string
  /** The reader's word for the document: "purchase order" or "sales order". */
  noun: string
  number: string
  /** Running placements that joined it when it was written. */
  linesAttached: number
}): AfterHeader {
  const { end, counterpartyName: them, noun, number } = input
  if (input.linesAttached > 0) {
    const n = input.linesAttached
    return {
      kind: 'HAS_LINES',
      says:
        `${n === 1 ? 'One placement' : `${n} placements`} already running with ${them} ` +
        `${n === 1 ? 'is' : 'are'} on ${number} now, one line each. Nothing more to add.`,
    }
  }
  if (end === 'BUYER' && input.isClient) {
    return {
      kind: 'SUPPLIER_ADDS',
      says:
        `${number} has no lines yet. ${them} adds a line for each person on it from its side, ` +
        `and each appears here with the person, the rate and the site.`,
    }
  }
  return {
    kind: 'ASK_FIRST_LINE',
    line: end === 'SELLER' ? 'SELL' : 'BUY',
    says:
      `Add the first line on ${number}: who works on it, at what rate, at which site, from when. ` +
      `A ${noun} with no line has nothing to ${end === 'SELLER' ? 'bill' : 'pay'} from.`,
  }
}

export interface PinOrder {
  id: string
  number: string
  issuedById: string
  issuedToId: string
  status: string
  issuedByName?: string | null
}

export type PinVerdict = { ok: true } | { ok: false; says: string; field: 'workOrderId' }

/**
 * May a line this seller bills to this client go on this order?
 *
 * A line is the seller's, so it goes only on an order the seller received,
 * from the client the line bills, while the order is open.
 */
export function mayPinToOrder(
  order: PinOrder | null,
  line: { sellerId: string; sellerName: string; buyerId: string; buyerName: string }
): PinVerdict {
  if (!order) {
    return { ok: false, field: 'workOrderId', says: 'That order is not on file. Pick one from the orders your firm received.' }
  }
  if (order.issuedToId !== line.sellerId) {
    return {
      ok: false,
      field: 'workOrderId',
      says: `${order.number} is not an order ${line.sellerName} received, so a line of yours cannot go on it.`,
    }
  }
  if (order.issuedById !== line.buyerId) {
    return {
      ok: false,
      field: 'workOrderId',
      says:
        `${order.number} is from ${order.issuedByName ?? 'another firm'}, not from ${line.buyerName}. ` +
        `A line goes on an order from the client it bills.`,
    }
  }
  if (order.status === 'CLOSED' || order.status === 'CANCELLED') {
    return {
      ok: false,
      field: 'workOrderId',
      says: `${order.number} is ${order.status === 'CLOSED' ? 'closed' : 'cancelled'}, so nothing more can be billed on it. Ask ${line.buyerName} for a new order, or record the one they gave you.`,
    }
  }
  return { ok: true }
}

/**
 * May a buy line this firm pays go on this order? The buyer's side of the
 * same rule: only an open order this firm issued, to the supplier the
 * line pays.
 */
export function mayPinBuyLine(
  order: PinOrder | null,
  line: { buyerId: string; buyerName: string; supplierId: string; supplierName: string; issuedToName?: string | null }
): PinVerdict {
  if (!order) {
    return { ok: false, field: 'workOrderId', says: 'That purchase order is not on file. Pick one your firm raised.' }
  }
  if (order.issuedById !== line.buyerId) {
    return { ok: false, field: 'workOrderId', says: `${order.number} is not a purchase order ${line.buyerName} raised, so a line it pays cannot go on it.` }
  }
  if (order.issuedToId !== line.supplierId) {
    return {
      ok: false,
      field: 'workOrderId',
      says: `${order.number} is to ${line.issuedToName ?? 'another firm'}, not to ${line.supplierName}. A line goes on the order to the firm it pays.`,
    }
  }
  if (order.status === 'CLOSED' || order.status === 'CANCELLED') {
    return { ok: false, field: 'workOrderId', says: `${order.number} is ${order.status === 'CLOSED' ? 'closed' : 'cancelled'}, so nothing more can be paid on it. Raise a new one to ${line.supplierName}.` }
  }
  return { ok: true }
}
