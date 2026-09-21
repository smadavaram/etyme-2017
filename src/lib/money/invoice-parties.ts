/**
 * Who an invoice is between, when there is no agreement behind it.
 *
 * ── Why this file exists ─────────────────────────────────────────────
 *
 * `Engagement.msaId` was required, and it was the only hard dependency
 * on an agreement anywhere in the schema. No route has ever demanded
 * one. The founder, 2026-09-18: *"We don't need a master contract if
 * there is no budget profile."* A client that sends one purchase order
 * and one contractor must not be made to paper an agreement before the
 * work can be recorded.
 *
 * The moment that column goes optional, fourteen files that asked an
 * invoice who it was between through `invoice.engagement.msa` have no
 * answer. This is the answer they ask instead, and it is a cascade of
 * three documents rather than one:
 *
 *   1. **the agreement** — the two firms that signed it
 *   2. **the order** — the buyer who raised it and the seller who
 *      bills against it, which is the same two facts on the commercial
 *      document rather than the legal one
 *   3. **the lines** — the sell lines actually billed on this invoice,
 *      each of which carries its own vendor and its own customer
 *
 * And a fourth answer, which is the important one: **none of the
 * above**. An invoice with no agreement, no order and no line behind it
 * cannot say who it is between, and this returns null and says so
 * rather than naming a plausible firm. A bill addressed to a guess is
 * worse than a bill nobody can send.
 *
 * ── Scoping is the same question ─────────────────────────────────────
 *
 * Every read of an invoice is scoped to its two firms. That scope was
 * written as a Prisma filter through `engagement.msa`, and a relation
 * filter on a null relation matches nothing — so the day the column
 * goes optional, a supplier's own bill would vanish from its own
 * receivables rather than merely losing a name. `invoiceBetween` is the
 * same cascade expressed as a filter, so the sentence a screen reads
 * and the rows a query returns cannot disagree.
 *
 * No database in here, on purpose.
 */

import { directionOf, type Direction } from '@/lib/ar-ageing'

/** A firm, as much of it as the caller loaded. */
export interface FirmRef {
  id: string
  name?: string | null
}

/** Which document answered. Never absent from an answer. */
export type PartiesBasis =
  /** The agreement between the two firms. */
  | 'AGREEMENT'
  /** The order: the buyer raised it, the seller bills against it. */
  | 'ORDER'
  /** The sell lines billed on this invoice. */
  | 'LINES'

export interface InvoiceParties {
  /** The firm that raised the bill. Null where nothing says. */
  vendor: FirmRef | null
  /** The firm being asked to pay. Null where nothing says. */
  client: FirmRef | null
  /** Which document answered, or null where none could. */
  basis: PartiesBasis | null
  /** One sentence, for a screen or a refusal. */
  says: string
}

export interface PartiesInput {
  /** `Engagement.msa`, where the engagement has one. */
  agreement?: {
    vendorId: string
    clientId: string
    vendor?: FirmRef | null
    client?: FirmRef | null
  } | null
  /**
   * `Invoice.workOrder`, or the order the engagement's lines sit on.
   * The buyer raised it; the seller bills against it.
   */
  order?: {
    issuedById: string
    issuedToId: string
    issuedBy?: FirmRef | null
    issuedTo?: FirmRef | null
    number?: string | null
  } | null
  /**
   * The sell lines billed on this invoice. Each knows its own vendor and
   * its own customer, which is why a line is the last resort rather than
   * no resort.
   */
  lines?: ReadonlyArray<{
    companyId: string
    clientCompanyId: string
    company?: FirmRef | null
    clientCompany?: FirmRef | null
  }>
}

const NOTHING: InvoiceParties = {
  vendor: null,
  client: null,
  basis: null,
  says:
    'Nothing behind this invoice says who it is between — no agreement, no order and no ' +
    'line. Put it on an order, or bill it from a contract, before it is sent.',
}

/**
 * The two firms on an invoice, and which document said so.
 *
 * The order of the cascade is deliberate: the agreement is what two
 * firms signed, the order is what one of them authorized, and a line is
 * what somebody typed. Nearest to a signature wins.
 */
export function partiesOf(input: PartiesInput): InvoiceParties {
  const { agreement, order, lines } = input

  if (agreement) {
    return {
      vendor: ref(agreement.vendor, agreement.vendorId),
      client: ref(agreement.client, agreement.clientId),
      basis: 'AGREEMENT',
      says: `${nameOr(agreement.vendor, 'The supplier')} bills ${nameOr(
        agreement.client,
        'the client'
      )}, from the agreement between them.`,
    }
  }

  if (order) {
    // The seller bills against the order; the buyer raised it and pays.
    // Same two facts as the agreement carries, on the commercial
    // document rather than the legal one.
    const where = order.number ? ` ${order.number}` : ''
    return {
      vendor: ref(order.issuedTo, order.issuedToId),
      client: ref(order.issuedBy, order.issuedById),
      basis: 'ORDER',
      says: `${nameOr(order.issuedTo, 'The supplier')} bills ${nameOr(
        order.issuedBy,
        'the client'
      )}, from order${where} — there is no agreement behind this engagement.`,
    }
  }

  const fromLines = oneFirmEach(lines ?? [])
  if (fromLines) return fromLines

  return NOTHING
}

/**
 * The lines, where they all name the same two firms.
 *
 * Where they do not, this refuses. One invoice carrying two suppliers'
 * lines is a broken invoice, and picking the first line's supplier would
 * address the bill to whoever happened to be created first.
 */
function oneFirmEach(lines: NonNullable<PartiesInput['lines']>): InvoiceParties | null {
  if (lines.length === 0) return null

  const vendors = new Set(lines.map((l) => l.companyId))
  const clients = new Set(lines.map((l) => l.clientCompanyId))

  if (vendors.size > 1 || clients.size > 1) {
    return {
      vendor: null,
      client: null,
      basis: null,
      says:
        `The ${lines.length} lines on this invoice name ` +
        `${vendors.size > 1 ? `${vendors.size} different suppliers` : `${clients.size} different customers`}, ` +
        'so who it is between cannot be answered. Split it.',
    }
  }

  const first = lines[0]
  return {
    vendor: ref(first.company, first.companyId),
    client: ref(first.clientCompany, first.clientCompanyId),
    basis: 'LINES',
    says: `${nameOr(first.company, 'The supplier')} bills ${nameOr(
      first.clientCompany,
      'the client'
    )}, from the ${lines.length === 1 ? 'line' : 'lines'} on this invoice — there is no agreement and no order behind it.`,
  }
}

function ref(loaded: FirmRef | null | undefined, id: string): FirmRef {
  return loaded?.id ? loaded : { id, name: loaded?.name ?? null }
}

function nameOr(firm: FirmRef | null | undefined, fallback: string): string {
  return firm?.name ?? fallback
}

// ── Who may raise a bill under a deal ─────────────────────────────────

/** Whether this firm may bill under this deal, and why not where it may not. */
export interface BillingRight {
  ok: boolean
  /** One sentence, for a refusal or for an empty picker. */
  says: string
}

/**
 * Only the supplier bills.
 *
 * `invoices.issue` says somebody may raise a bill at their own company.
 * It says nothing about whose deal this is, and an engagement id is not
 * a secret — so without this a firm could raise an invoice in another
 * supplier's name, addressed to that supplier's client.
 *
 * ── Why it is here and not only in the route ─────────────────────────
 *
 * The release walk of 2026-09-21 opened Invoices from a program
 * office's seat, pressed "+ Generate", and was offered an engagement
 * the route then refused: *"This engagement is Arcadia Tech Group's to
 * bill, not Aptiva Workforce's."* The sentence was right. The picker
 * was the bug — it listed every engagement the seat could read rather
 * than every engagement the seat could bill, which are different
 * questions on any screen where somebody sits at another company's
 * desk.
 *
 * A button that the route will refuse is a button that lies, and a
 * picker is a row of them. So the list and the gate read one function:
 * the only way they cannot disagree.
 */
export function mayBillUnder(
  parties: InvoiceParties,
  biller: FirmRef | null | undefined
): BillingRight {
  if (!biller?.id) {
    return { ok: false, says: 'Nobody is signed in at a company, so there is nothing to bill from.' }
  }
  if (!parties.vendor || !parties.client) {
    return {
      ok: false,
      says: `Nothing says who this deal is between, so nobody can bill under it. ${parties.says}`,
    }
  }
  if (parties.vendor.id !== biller.id) {
    return {
      ok: false,
      says:
        `This engagement is ${parties.vendor.name ?? 'another firm'}'s to bill, ` +
        `not ${biller.name ? `${biller.name}'s` : 'yours'}.`,
    }
  }
  return { ok: true, says: `${biller.name ?? 'You'} bills under this engagement.` }
}

/**
 * Whose receivable or payable this is, for a reader.
 *
 * RECEIVABLE where we raised it, PAYABLE where we are being asked to
 * pay, NEITHER where we are a stranger to it — and NEITHER where nothing
 * behind the invoice could say, because an invoice that cannot name its
 * parties must not land in anybody's total.
 */
export function directionFrom(
  parties: InvoiceParties,
  companyId: string | null | undefined
): Direction {
  if (!companyId || !parties.vendor || !parties.client) return 'NEITHER'
  return directionOf({ vendorId: parties.vendor.id, clientId: parties.client.id }, companyId)
}

/**
 * The Prisma filter for "invoices this company is a party to".
 *
 * Three branches, the same cascade `partiesOf` reads:
 *
 *   · the agreement behind the engagement names them
 *   · the order names them — including the bill-to and the payer, because
 *     a shared service center that never signed the order still settles
 *     against it, and a company that cannot open the invoice it is
 *     paying will pay it by email instead
 *   · a line actually billed on the invoice names them
 *
 * The third branch is the invoice's OWN lines rather than the
 * engagement's — an engagement is a folder and a firm on one line of it
 * is not thereby a party to a different client's bill.
 *
 * Deliberately not a permission check: who may read an invoice at all is
 * `invoices.read`, and a consultant seat is not a party to a bill between
 * two companies however many of its hours are on it.
 */
export function invoiceBetween(companyId: string): Record<string, unknown> {
  return {
    OR: [
      { engagement: { msa: { OR: [{ vendorId: companyId }, { clientId: companyId }] } } },
      {
        workOrder: {
          OR: [
            { issuedById: companyId },
            { issuedToId: companyId },
            { billToId: companyId },
            { payerId: companyId },
          ],
        },
      },
      {
        invoiceLines: {
          some: {
            sellContract: {
              OR: [{ companyId }, { clientCompanyId: companyId }],
            },
          },
        },
      },
    ],
  }
}

/**
 * The same question from the supplier's end only: invoices this company
 * raised. What an accounts receivable book is.
 *
 * A payable is somebody else's receivable, and adding the two is how an
 * AR report shows a positive balance to a company that owes money.
 */
export function invoicesRaisedBy(companyId: string): Record<string, unknown> {
  return {
    OR: [
      // The agreement says we are the supplier.
      { engagement: { msa: { vendorId: companyId } } },
      // No agreement: the seller on the order is the firm that bills.
      { workOrder: { issuedToId: companyId } },
      // Neither: a sell line on the invoice is ours, and a sell line is
      // raised by the firm that bills it.
      { invoiceLines: { some: { sellContract: { companyId } } } },
    ],
  }
  // The three cannot contradict each other on sound data — the seller on
  // the order, the vendor on the agreement and the company on the sell
  // line are one firm — so they are OR'd rather than tried in turn. Where
  // they DO disagree, both firms named on the paper can see the invoice,
  // which is the safer half of a broken record: a bill nobody can open is
  // a bill settled by email.
}

// ── The reader's own side of the book ─────────────────────────────────
//
// `lib/order-naming` settled the rule for the order layer: one document,
// and which end of it the reader stands at decides the words. An invoice
// is the same. The client's invoice list opened on "Owed to us" — always
// $0 for a company that never sells — with six supplier invoices listed
// under it, so the stat cards and the table disagreed until somebody
// clicked "We owe". And the CLIENT column printed the reader's own name
// on every row, because "the client" is who the invoice is TO, which on
// a client's own screen is itself.
//
// No database and no React in here, so the answer is the same on the
// page, in the export and in a test.

/** Which half of the book a screen is showing. */
export type LedgerSide = 'RECEIVABLE' | 'PAYABLE'

/**
 * The side a reader opens on.
 *
 * A client buys and never sells (CLAUDE.md, "Who sells and who buys": the
 * client's row reads never / everyone below), so its book is what it
 * owes. Everybody else sells — a prime buys too, and opens on what it is
 * owed because that is the half it raises itself.
 *
 * Unknown opens on RECEIVABLE, which is what the screen did before any
 * of this and is the safe answer while a session is still loading: it
 * claims nothing about a company whose kind nobody has read yet.
 */
export function openingSide(companyKind: string | null | undefined): LedgerSide {
  return companyKind === 'CLIENT' ? 'PAYABLE' : 'RECEIVABLE'
}

/** What to call the other firm on a row, and which firm that is. */
export interface Counterparty {
  /** "Client" · "Supplier" · "Counterparty" */
  heading: string
  /** The firm on the other end, or null where nothing can name it. */
  firm: FirmRef | null
}

/**
 * The firm on the other end of this invoice, from where the reader sits.
 *
 * Ours to collect — the client pays it, and the client is who we name.
 * Ours to pay — the supplier raised it, and the supplier is who we name.
 * Neither — we are a bystander, and naming either end as "the client"
 * would be telling a rung in a chain something about a deal it is not
 * on. Null rather than a guess, the same rule as `partiesOf`.
 */
export function counterpartyOf(direction: Direction, parties: InvoiceParties): Counterparty {
  if (direction === 'RECEIVABLE') return { heading: 'Client', firm: parties.client }
  if (direction === 'PAYABLE') return { heading: 'Supplier', firm: parties.vendor }
  return { heading: 'Counterparty', firm: null }
}

/**
 * One heading for a column of rows that may run both ways.
 *
 * A staffing firm's list is all clients; a client's list is all
 * suppliers; a prime's is both, and a column headed with one of the two
 * words would be wrong on half its rows. An empty list takes the word
 * from the side the reader opened on, because a heading that changes
 * when the first row arrives reads as a bug.
 */
export function counterpartyHeading(
  directions: ReadonlyArray<Direction>,
  opened: LedgerSide
): string {
  const sides = new Set(directions.filter((d) => d !== 'NEITHER'))
  if (sides.size === 1) {
    return counterpartyOf([...sides][0], NOTHING).heading
  }
  if (sides.size === 0) return counterpartyOf(opened, NOTHING).heading
  return 'Client or supplier'
}
