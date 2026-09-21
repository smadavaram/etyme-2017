import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  partiesOf,
  directionFrom,
  invoiceBetween,
  invoicesRaisedBy,
  openingSide,
  counterpartyOf,
  counterpartyHeading,
} from '@/lib/money/invoice-parties'

/**
 * An invoice knows who it is between, with or without an agreement.
 *
 * `Engagement.msaId` is optional: a client that sends one purchase order
 * and one contractor is not made to paper an agreement first. Fourteen
 * files asked an invoice who it was between through the agreement, and
 * one of those answers was the scoping — who may open the bill at all.
 *
 * So the cascade is three documents and an honest refusal, and the
 * refusal is the point: a bill addressed to a guess is worse than a bill
 * nobody can send.
 */

const SUPPLIER = { id: 'co-veritan', name: 'Veritan Talent' }
const CLIENT = { id: 'co-northbend', name: 'Northbend Athletic' }
const STRANGER = 'co-auralis'
const SERVICE_CENTER = 'co-northbend-ssc'

const AGREEMENT = {
  vendorId: SUPPLIER.id,
  clientId: CLIENT.id,
  vendor: SUPPLIER,
  client: CLIENT,
}

const ORDER = {
  issuedById: CLIENT.id,
  issuedToId: SUPPLIER.id,
  issuedBy: CLIENT,
  issuedTo: SUPPLIER,
  number: 'PO-4471',
}

const LINE = {
  companyId: SUPPLIER.id,
  clientCompanyId: CLIENT.id,
  company: SUPPLIER,
  clientCompany: CLIENT,
}

describe('who an invoice is between', () => {
  it('an invoice with an agreement behind it names the two firms the agreement names', () => {
    const p = partiesOf({ agreement: AGREEMENT, order: ORDER, lines: [LINE] })
    expect(p.vendor?.id).toBe(SUPPLIER.id)
    expect(p.client?.id).toBe(CLIENT.id)
    expect(p.basis).toBe('AGREEMENT')
    expect(p.says).toBe('Veritan Talent bills Northbend Athletic, from the agreement between them.')
  })

  it('an invoice with no agreement behind it still knows who it is between, from the order', () => {
    const p = partiesOf({ agreement: null, order: ORDER })
    expect(p.vendor?.id).toBe(SUPPLIER.id)
    expect(p.client?.id).toBe(CLIENT.id)
    expect(p.basis).toBe('ORDER')
    expect(p.says).toContain('PO-4471')
    expect(p.says).toContain('there is no agreement behind this engagement')
  })

  it('the firm that bills is the one the order was issued to, and the firm that pays is the one that raised it', () => {
    const p = partiesOf({ order: ORDER })
    // The buyer raises the paper; the seller bills against it. Reading
    // those the other way round addresses every bill to the supplier.
    expect(p.vendor?.name).toBe('Veritan Talent')
    expect(p.client?.name).toBe('Northbend Athletic')
  })

  it('an invoice with neither an agreement nor an order reads its two firms off the lines billed on it', () => {
    const p = partiesOf({ agreement: null, order: null, lines: [LINE, LINE] })
    expect(p.basis).toBe('LINES')
    expect(p.vendor?.id).toBe(SUPPLIER.id)
    expect(p.client?.id).toBe(CLIENT.id)
    expect(p.says).toContain('no agreement and no order')
  })

  it('an invoice whose lines name two different suppliers refuses to pick one', () => {
    const p = partiesOf({
      lines: [LINE, { companyId: 'co-pinnacle', clientCompanyId: CLIENT.id }],
    })
    expect(p.basis).toBeNull()
    expect(p.vendor).toBeNull()
    expect(p.says).toContain('2 different suppliers')
    expect(p.says).toContain('Split it')
  })

  it('an invoice with nothing behind it says so in a sentence rather than naming a plausible firm', () => {
    const p = partiesOf({ agreement: null, order: null, lines: [] })
    expect(p.vendor).toBeNull()
    expect(p.client).toBeNull()
    expect(p.basis).toBeNull()
    expect(p.says).toContain('no agreement, no order and no line')
    expect(p.says).not.toMatch(/undefined|null|unknown/i)
  })

  it('every answer says which document it came from, so a wrong name can be traced to a piece of paper', () => {
    expect(partiesOf({ agreement: AGREEMENT }).basis).toBe('AGREEMENT')
    expect(partiesOf({ order: ORDER }).basis).toBe('ORDER')
    expect(partiesOf({ lines: [LINE] }).basis).toBe('LINES')
    expect(partiesOf({}).basis).toBeNull()
  })
})

describe('which way an invoice runs for the person reading it', () => {
  it('the supplier reads its own bill as a receivable and the client reads it as a payable', () => {
    const p = partiesOf({ order: ORDER })
    expect(directionFrom(p, SUPPLIER.id)).toBe('RECEIVABLE')
    expect(directionFrom(p, CLIENT.id)).toBe('PAYABLE')
  })

  it('a firm that is party to neither end of it is owed nothing and owes nothing', () => {
    expect(directionFrom(partiesOf({ order: ORDER }), STRANGER)).toBe('NEITHER')
  })

  it('an invoice that cannot name its two firms lands in nobody’s total', () => {
    // The alternative is a figure on an AR page that belongs to whoever
    // happened to be loaded first, which is the class of bug CLAUDE.md
    // records under "every figure on a screen has a sentence".
    expect(directionFrom(partiesOf({}), SUPPLIER.id)).toBe('NEITHER')
  })
})

describe('an invoice with no agreement is still found by the scope that lists it', () => {
  /** The three branches, by the fact each one reads. */
  const branches = (companyId: string) => invoiceBetween(companyId).OR as Record<string, any>[]

  it('the scope asks the agreement, the order and the lines — not the agreement alone', () => {
    const [byAgreement, byOrder, byLine] = branches(SUPPLIER.id)
    expect(byAgreement.engagement.msa.OR).toEqual([
      { vendorId: SUPPLIER.id },
      { clientId: SUPPLIER.id },
    ])
    expect(byOrder.workOrder.OR).toContainEqual({ issuedToId: SUPPLIER.id })
    expect(byLine.invoiceLines.some.sellContract.OR).toEqual([
      { companyId: SUPPLIER.id },
      { clientCompanyId: SUPPLIER.id },
    ])
  })

  it('the shared service center that pays an order can open the invoice it settles', () => {
    const [, byOrder] = branches(SERVICE_CENTER)
    expect(byOrder.workOrder.OR).toContainEqual({ billToId: SERVICE_CENTER })
    expect(byOrder.workOrder.OR).toContainEqual({ payerId: SERVICE_CENTER })
  })

  it('a line on somebody else’s engagement does not open this invoice — only a line billed on it', () => {
    // The engagement is a folder. A firm on one line of it is not thereby
    // a party to a different client's bill, so the branch reads the
    // invoice's own lines rather than the engagement's.
    const [, , byLine] = branches(STRANGER)
    expect(JSON.stringify(byLine)).toContain('invoiceLines')
    expect(JSON.stringify(byLine)).not.toContain('engagement')
  })

  it('every place that asks “is this invoice ours to act on” asks it the same way', () => {
    // Four routes scoped through the agreement in a WHERE clause, which
    // fails silently rather than loudly: a relation filter on a null
    // relation matches nothing, so a firm's own bill would have
    // disappeared from its receivables, refused a receipt as "no such
    // invoice of ours", and dropped out of its own collections ladder.
    const asks = [
      'src/app/api/ar/book.ts',
      'src/app/api/ar/payments/route.ts',
      'src/app/api/ar/collections/route.ts',
      'src/app/api/ar/credit-notes/route.ts',
      'src/app/api/invoices/[id]/submit/route.ts',
    ]
    for (const file of asks) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, `${file} should scope through invoicesRaisedBy`).toContain('invoicesRaisedBy')
    }
  })

  it('opening one invoice asks who may look and what is ours as two questions, not one', () => {
    // `invoiceScope` answers the first — a consultant seat is not a party
    // to a bill between two companies, however many of their hours are on
    // it — and it answers the second through the agreement alone, which
    // would 404 an invoice with none behind it for the two firms whose
    // bill it is. The gate stays; the cascade decides ours.
    //
    // The cascade now arrives through one door rather than four copies of
    // one expression: `reading.invoiceWhere` is `invoiceBetween` of
    // whichever book the reader is on — their own firm's, or a client's
    // where a program office is sitting at its desk
    // (`lib/money/seated-books`, and the unit test there holds the
    // equality). What this refuses, still, is a route deciding for itself
    // which invoices are ours.
    for (const file of [
      'src/app/api/invoices/[id]/route.ts',
      'src/app/api/invoices/[id]/received/route.ts',
      'src/app/api/invoices/[id]/match/route.ts',
      'src/app/api/invoices/[id]/payments/route.ts',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, `${file} should keep the consultant gate`).toContain('invoiceScope(caller)')
      expect(src, `${file} should scope through the one door`).toContain('reading.invoiceWhere')
      expect(src, `${file} should ask whose book this is`).toContain(
        "from '@/lib/money/seated-books'"
      )
      // And never a company id straight off the caller, which is the
      // line that served a program office its own books.
      expect(src, `${file} scopes an invoice read by the caller's own firm`).not.toContain(
        'invoiceBetween(caller.company!.id)'
      )
    }
  })

  it('a bill is submitted by the firm that raised it, and by nobody else who happens to have the id', () => {
    // This route authenticated the caller, checked a permission at their
    // own company, and then loaded any invoice by id — so a firm with
    // invoices.issue could push somebody else's bill into the three-way
    // match. It even selected the two parties off the agreement and
    // compared them to nothing.
    const src = readFileSync(
      join(process.cwd(), 'src/app/api/invoices/[id]/submit/route.ts'),
      'utf8'
    )
    expect(src).toContain('...invoicesRaisedBy(companyId)')
    expect(src).toContain('No such invoice of yours')
  })

  it('an accounts receivable book is what this firm billed, and never what it was billed', () => {
    const raised = invoicesRaisedBy(SUPPLIER.id).OR as Record<string, any>[]
    expect(raised).toContainEqual({ engagement: { msa: { vendorId: SUPPLIER.id } } })
    expect(raised).toContainEqual({ workOrder: { issuedToId: SUPPLIER.id } })
    // Never the buyer's end of the order, and never the customer on a
    // line: a payable is somebody else's receivable.
    const json = JSON.stringify(raised)
    expect(json).not.toContain('issuedById')
    expect(json).not.toContain('clientCompanyId')
    expect(json).not.toContain('clientId')
  })
})

/**
 * ── The reader's own side of the book ────────────────────────────────
 *
 * A client's invoice list opened on "Owed to us" — which is $0 for a
 * company that never sells — with six supplier invoices listed under
 * it, so the stat cards and the table disagreed until somebody clicked
 * "We owe". And the column headed CLIENT printed the reader's own name
 * on every row, because "the client" is who the invoice is TO, and on a
 * client's own screen that is always itself.
 *
 * The rule is `lib/order-naming`'s: the reader's side decides the
 * words. What a client wants named on a bill it owes is the supplier
 * that billed it.
 */
describe("an invoice list is read from the side of the book the reader is on", () => {
  it('a client opens on what it owes, because a client never sells and is never owed', () => {
    expect(openingSide('CLIENT')).toBe('PAYABLE')
  })

  it('a staffing vendor opens on what it is owed', () => {
    expect(openingSide('VENDOR')).toBe('RECEIVABLE')
  })

  it('a prime, which both sells and buys, opens on what it is owed', () => {
    expect(openingSide('PRIME')).toBe('RECEIVABLE')
  })

  it('a reader whose company kind is not yet loaded opens on what it is owed rather than guessing', () => {
    expect(openingSide(null)).toBe('RECEIVABLE')
  })

  it('a bill this company must pay names the supplier that billed it', () => {
    const p = partiesOf({ agreement: AGREEMENT })
    const c = counterpartyOf('PAYABLE', p)
    expect(c.heading).toBe('Supplier')
    expect(c.firm?.name).toBe('Veritan Talent')
  })

  it('a bill this company is owed names the client that must pay it', () => {
    const p = partiesOf({ agreement: AGREEMENT })
    const c = counterpartyOf('RECEIVABLE', p)
    expect(c.heading).toBe('Client')
    expect(c.firm?.name).toBe('Northbend Athletic')
  })

  it('an invoice between two other firms names neither as ours and says so', () => {
    const p = partiesOf({ agreement: AGREEMENT })
    const c = counterpartyOf('NEITHER', p)
    expect(c.heading).toBe('Counterparty')
    expect(c.firm).toBeNull()
  })

  it('an invoice nothing can attribute leaves the name blank rather than inventing a firm', () => {
    const c = counterpartyOf('PAYABLE', partiesOf({}))
    expect(c.firm).toBeNull()
  })

  it('a book of bills to pay heads the column Supplier', () => {
    expect(counterpartyHeading(['PAYABLE', 'PAYABLE'], 'PAYABLE')).toBe('Supplier')
  })

  it('a book of bills to collect heads the column Client', () => {
    expect(counterpartyHeading(['RECEIVABLE', 'RECEIVABLE'], 'RECEIVABLE')).toBe('Client')
  })

  it("a prime's book with both on it heads the column with both words rather than picking one", () => {
    expect(counterpartyHeading(['RECEIVABLE', 'PAYABLE'], 'RECEIVABLE')).toBe('Client or supplier')
  })

  it('an empty list is headed from the side the reader opened on', () => {
    expect(counterpartyHeading([], 'PAYABLE')).toBe('Supplier')
  })
})
