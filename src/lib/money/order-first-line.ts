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
 *   - **The buyer raising an order** does not write the seller's line,
 *     and its own buy line is written by the award, with the person it
 *     buys. So the screen says plainly that the lines come from the
 *     award, and names the supplier.
 *   - **Either, where running placements joined it**, already has lines,
 *     and is told so rather than asked for another.
 *
 * And `mayPinToOrder` is the rule for a line written by hand onto a named
 * order: it goes only on an open order this firm received from the client
 * it bills. No database in here.
 */

export type ReaderEnd = 'BUYER' | 'SELLER'

export type AfterHeader =
  | { kind: 'HAS_LINES'; says: string }
  | { kind: 'ASK_FIRST_LINE'; says: string }
  | { kind: 'LINES_FROM_AWARD'; says: string }

export function afterHeader(input: {
  /** Which end of the order the person who wrote it stands at. */
  end: ReaderEnd
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
  if (end === 'SELLER') {
    return {
      kind: 'ASK_FIRST_LINE',
      says:
        `Add the first line on ${number}: who works on it, at what rate, at which site, from when. ` +
        `A ${noun} with no line has nothing to bill from.`,
    }
  }
  return {
    kind: 'LINES_FROM_AWARD',
    says:
      `${number} has no lines yet. Lines come from the award: when you award a person from ${them} ` +
      `on a job, their line goes on this ${noun}. A placement ${them} records for you finds it ` +
      `on its own, because it is the order open between you.`,
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
