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

// ── A line on it ─────────────────────────────────────────────────────
//
// A purchase order is a header and its lines (CLAUDE.md, 2026-09-18).
// `WorkOrder` is the header; `SellContract` and `BuyContract` are its
// lines. So a line needs a name too, and it is not a row id: nobody has
// ever read out a cuid to an AP clerk. A line is a person at a site, on
// a document the reader already has a word for.
//
// The founder's two sentences say what each side of it is for:
//
//   > Sell contract will bill customer. Buy contract will pay supplier
//   > or run payroll for candidate.
//
// Those words may appear on a screen — they are his, and they are the
// trade's. What may not appear is a sell line or a buy line presented as
// a document of its own, with its own number and its own creation flow,
// beside the order. It is a line on the order.

/** Which side of the trade a line is on. */
export type LineSide = 'SELL' | 'BUY'

/** How a buy line is settled. */
export type PaidBy =
  /** A sub-vendor below us issues its invoice and we receive it. */
  | 'INVOICE_RECEIPT'
  /** Our own W2. Nobody raises a purchase order to an employee. */
  | 'PAYROLL'

export interface OrderLinePlace {
  /** 1-based, as a person counts lines on a piece of paper. */
  position?: number | null
  /** How many lines the document carries, where the reader sees them all. */
  of?: number | null
}

export interface LineSubject {
  side: LineSide
  /** Whose line it is. A line is a person. */
  personName: string
  /** Where the work happens — a town or a site, never an id. */
  siteName?: string | null
  /** On a buy line, the firm we pay. Null where we employ the person. */
  paidToName?: string | null
}

/**
 * The line itself, named by the person and the site.
 *
 * Never by a contract id. "Line 2" identifies it on the document;
 * this says who it is.
 */
export function lineName(line: LineSubject): string {
  return line.siteName ? `${line.personName} — ${line.siteName}` : line.personName
}

/**
 * Where the line sits on the document, in the reader's own words.
 *
 * "Purchase order PO-4471, line 2 of 5" to the client who raised it;
 * "Sales order SO-0913, line 2" to the supplier billing against it. The
 * count is dropped rather than guessed where the caller did not load the
 * siblings — "line 2 of 1" is worse than "line 2".
 */
export function lineHeading(
  order: OrderParties & { number: string; sellerNumber?: string | null },
  companyId: string | null | undefined,
  place: OrderLinePlace = {}
): string {
  const { Noun } = nounFor(order, companyId)
  const ref = referenceFor(order, companyId).reference
  const head = `${Noun} ${ref}`
  if (!place.position) return head
  const of = place.of && place.of > 1 ? ` of ${place.of}` : ''
  return `${head}, line ${place.position}${of}`
}

/**
 * What this line is for, which is the whole difference between the two.
 *
 * The sell line is what the firm bills from. The buy line is what it
 * pays from — a supplier's invoice received where a sub-vendor is below,
 * payroll where the firm employs the person itself. `cyclesFor` in
 * `lib/cycle-kinds` splits on exactly that, so the sentence and the
 * cycles cannot drift.
 */
export function lineDoes(line: LineSubject, side: OrderSide): string {
  if (line.side === 'SELL') {
    if (side === 'BUYER') return 'Your supplier bills from this line.'
    if (side === 'SELLER') return 'You bill from this line.'
    return 'The supplier bills from this line.'
  }
  if (line.paidToName) {
    return `You pay from this line — ${line.paidToName}'s invoice, received and matched.`
  }
  return 'You pay from this line — payroll, because you employ them.'
}

/** How a buy line is settled, from whether there is a firm below us. */
export function paidBy(line: LineSubject): PaidBy {
  return line.paidToName ? 'INVOICE_RECEIPT' : 'PAYROLL'
}

export interface LineDescription {
  /** Whether there is a document behind it at all. */
  onOrder: boolean
  /** "Purchase order" · "Sales order" · "Work order". Null off an order. */
  Noun: string | null
  /** The reference this reader would quote. Null off an order. */
  reference: string | null
  /** "Purchase order PO-4471, line 2 of 5", or the sentence where there is none. */
  heading: string
  /** "Priya Raman — Tualatin". */
  name: string
  /** What the line is for, in the reader's own words. */
  does: string
  /** The whole row in one sentence. */
  says: string
}

/**
 * One function every screen calls, so three doors into a placement
 * cannot disagree about what the paper is called.
 *
 * A line with no header is the ordinary case today — every row written
 * before the award began raising one, and every W2 buy line, which never
 * has an external order because nobody raises a purchase order to their
 * own employee. It says so in a sentence rather than showing a blank,
 * and the two sentences are different because the two facts are: one is
 * waiting for paper, the other is complete as it stands.
 */
export function describeLine(input: {
  order: (OrderParties & { number: string; sellerNumber?: string | null }) | null
  companyId: string | null | undefined
  line: LineSubject
  place?: OrderLinePlace
}): LineDescription {
  const { order, companyId, line } = input
  const side = order ? sideOf(order, companyId) : 'BYSTANDER'
  const does = lineDoes(line, side)
  const name = lineName(line)

  if (!order) {
    const heading =
      line.side === 'BUY' && !line.paidToName
        ? 'No order, and none is due.'
        : 'Not yet on an order.'
    const says =
      line.side === 'BUY'
        ? line.paidToName
          ? `Not yet on an order. The order you raise to ${line.paidToName} attaches here.`
          : 'No order, and none is due — you do not raise one to your own employee. Payroll pays this line.'
        : "Not yet on an order. The client's paper, when it arrives, attaches here."
    return { onOrder: false, Noun: null, reference: null, heading, name, does, says }
  }

  const { Noun } = orderNoun(side)
  const reference = referenceFor(order, companyId).reference
  const heading = lineHeading(order, companyId, input.place)
  return {
    onOrder: true,
    Noun,
    reference,
    heading,
    name,
    does,
    says: `${heading} — ${name}. ${does}`,
  }
}

// ── The three levels above a line, each with one word ────────────────
//
// Decided 2026-09-18 and written into CLAUDE.md, "The master contract —
// the 2017 word, kept, and made optional". Three different objects were
// all being reached for with the word "master", and two of them sound
// identical read aloud:
//
//   the pair          a sell line and the buy line that funds it   ContractLink
//   master contract   several pairs a company reads as one deal    ProjectOrder
//   agreement · MSA   the legal umbrella between two firms         MasterAgreement
//
// So the agreement is never spelled out as "master agreement" on a
// screen. `__tests__/invariants/order-lines.test.ts` fails on one that
// is, because beside "master contract" the two become one thing in a
// reader's head, and they are not one thing: one is what a company tags
// its lines to when it wants to see a deal's margin, the other is what
// says the two firms may trade at all.

/** What a screen calls `MasterAgreement`. Never "master agreement". */
export const AGREEMENT_WORD = { noun: 'agreement', Noun: 'Agreement', short: 'MSA' } as const

/** What a screen calls `ProjectOrder`. The founder's word, from 2017. */
export const MASTER_CONTRACT_WORD = {
  noun: 'master contract',
  Noun: 'Master contract',
} as const

/**
 * The master contract a line is tagged to, or the invitation to tag it.
 *
 * Optional on purpose: "letting companies tag them to master contract if
 * they want to see contract profitability." A line with no tag is a
 * complete line, not a broken one, so the sentence offers rather than
 * warns — and nothing here tags anything by itself.
 */
export function masterContractLine(tag: { code?: string | null; name?: string | null } | null): string {
  if (!tag) {
    return "Not on a master contract. Tag it to one to see this deal's margin alongside its siblings."
  }
  const ref = [tag.code, tag.name].filter(Boolean).join(' — ')
  return `${MASTER_CONTRACT_WORD.Noun} ${ref || 'on file'}.`
}

/**
 * The pair: this line and the one on the other side of the trade that
 * funds it. A placement's own margin, before any roll-up.
 */
export function pairLine(input: {
  side: LineSide
  counterpartName: string | null
  paidToName?: string | null
}): string {
  if (input.side === 'SELL') {
    if (input.counterpartName) return `Paired with what you pay ${input.counterpartName}.`
    return 'Paired with payroll, because you employ them.'
  }
  return input.paidToName
    ? `Funds the line you bill ${input.counterpartName ?? 'the client'} from.`
    : `Funds the line you bill ${input.counterpartName ?? 'the client'} from, and is paid by payroll.`
}
