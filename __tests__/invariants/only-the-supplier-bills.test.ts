/**
 * A picker does not offer what the button will refuse.
 *
 * ── What was wrong ───────────────────────────────────────────────────
 *
 * The release walk of 2026-09-21, from the seat Cavanaugh Glassworks
 * granted Aptiva Workforce: Invoices → "+ Generate" → the picker held
 * an engagement belonging to one of the client's suppliers, and
 * pressing the button answered 403 — *"This engagement is Arcadia Tech
 * Group's to bill, not Aptiva Workforce's."*
 *
 * The sentence was right. The list was the bug. It was built out of
 * `/api/contracts?side=sell`, which answers "what may this seat read",
 * and a program office sitting at a client's desk may read the client's
 * whole book. Reading is not billing.
 *
 * CLAUDE.md: a button that the route will refuse is a button that lies.
 * A picker is a row of them. So the list and the gate read one rule,
 * and it is this one.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { partiesOf, mayBillUnder } from '@/lib/money/invoice-parties'

const ARCADIA = { id: 'co_arcadia', name: 'Arcadia Tech Group' }
const APTIVA = { id: 'co_aptiva', name: 'Aptiva Workforce' }
const CAVANAUGH = { id: 'co_cavanaugh', name: 'Cavanaugh Glassworks' }

const agreed = partiesOf({
  agreement: { vendorId: ARCADIA.id, clientId: CAVANAUGH.id, vendor: ARCADIA, client: CAVANAUGH },
})

const nothing = partiesOf({})

describe('only the firm that supplied the people may bill for them', () => {

  it('lets the supplier on the agreement bill under it', () => {
    expect(mayBillUnder(agreed, ARCADIA).ok).toBe(true)
  })

  it('refuses the client, who buys and never sells', () => {
    expect(mayBillUnder(agreed, CAVANAUGH).ok).toBe(false)
  })

  it('refuses a program office sitting at that client\'s desk, and names both firms', () => {
    const right = mayBillUnder(agreed, APTIVA)
    expect(right.ok).toBe(false)
    expect(right.says).toBe("This engagement is Arcadia Tech Group's to bill, not Aptiva Workforce's.")
  })

  it('refuses a deal nobody can say the parties of, rather than guessing one', () => {
    const right = mayBillUnder(nothing, ARCADIA)
    expect(right.ok).toBe(false)
    expect(right.says).toContain('Nothing says who this deal is between')
  })

  it('refuses a caller with no company at all', () => {
    expect(mayBillUnder(agreed, null).ok).toBe(false)
  })

  it('reads the order where there is no agreement, and the seller on it is who bills', () => {
    // A client that sent one purchase order and no MSA. The buyer
    // raised it; the seller bills against it.
    const onAnOrder = partiesOf({
      order: {
        issuedById: CAVANAUGH.id, issuedToId: ARCADIA.id,
        issuedBy: CAVANAUGH, issuedTo: ARCADIA, number: 'PO-4410',
      },
    })
    expect(mayBillUnder(onAnOrder, ARCADIA).ok).toBe(true)
    expect(mayBillUnder(onAnOrder, CAVANAUGH).ok).toBe(false)
  })

  it('reads the lines where there is neither, and the firm on them is who bills', () => {
    const onLines = partiesOf({
      lines: [{ companyId: ARCADIA.id, clientCompanyId: CAVANAUGH.id, company: ARCADIA, clientCompany: CAVANAUGH }],
    })
    expect(mayBillUnder(onLines, ARCADIA).ok).toBe(true)
    expect(mayBillUnder(onLines, APTIVA).ok).toBe(false)
  })

  it('refuses where two suppliers are named on one deal, because neither is the answer', () => {
    const mixed = partiesOf({
      lines: [
        { companyId: ARCADIA.id, clientCompanyId: CAVANAUGH.id },
        { companyId: APTIVA.id, clientCompanyId: CAVANAUGH.id },
      ],
    })
    expect(mayBillUnder(mixed, ARCADIA).ok).toBe(false)
    expect(mayBillUnder(mixed, APTIVA).ok).toBe(false)
  })
})

describe('the picker asks the same question the button will be refused on', () => {
  const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/invoices/generate/route.ts'), 'utf8')
  const PAGE = readFileSync(join(process.cwd(), 'src/app/dashboard/invoices/page.tsx'), 'utf8')

  it('lists the engagements from the route that raises the bill, not from the contracts a seat may read', () => {
    expect(PAGE).toContain("fetch('/api/invoices/generate')")
    expect(PAGE, 'still building the picker out of readable contracts')
      .not.toContain("fetch('/api/contracts?side=sell&state=IN_PROGRESS&limit=100')")
  })

  it('has a route behind that list, and it filters on the same rule the refusal uses', () => {
    expect(ROUTE).toContain('export async function GET')
    expect((ROUTE.match(/mayBillUnder\(/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('never asks a person to type a database identifier instead', () => {
    // The empty state used to be a text box labelled "Engagement ID".
    expect(PAGE).not.toContain('placeholder="Engagement ID"')
  })

  it('says why there is nothing to bill instead of offering a button that cannot work', () => {
    expect(PAGE).toContain('nothingToBill')
    expect(PAGE).toContain('A bill is raised by the firm that ')
  })

  it('offers the expense screen the firm\'s own placements, which is the book that route accepts', () => {
    // The same shape, one screen over. `/api/contracts` honors a
    // program office's seat and answers with the client's book; `POST
    // /api/expenses` scopes the contract to the caller's own company
    // and refuses every row on it. The picker asks for the book the
    // route will take.
    const EXPENSES = readFileSync(join(process.cwd(), 'src/app/dashboard/expenses/page.tsx'), 'utf8')
    expect(EXPENSES).toContain("side=sell&state=IN_PROGRESS&limit=100&books=own")
  })
})
