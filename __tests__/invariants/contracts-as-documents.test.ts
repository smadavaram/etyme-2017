import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The Contracts screen reads as the documents and their lines.
 *
 * CLAUDE.md, 2026-09-18: a purchase order is one document — a header and
 * its lines — and "sell contract" and "buy contract" are the founder's
 * words for the two directions money runs, **as lines of a document,
 * never as a document of their own.**
 *
 * This screen was the clearest case of the old reading: it created a
 * sell contract and a linked buy contract from its own form, listed them
 * as rows, and never mentioned an order. These are the sentences for
 * what it does now, read off the source, because the alternative is a
 * screenshot nobody re-takes.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const SCREEN = 'src/app/dashboard/contracts/page.tsx'
const ROUTE = 'src/app/api/contracts/route.ts'
const PO_SCREEN = 'src/app/dashboard/purchase-orders/page.tsx'
const PO_ROUTE = 'src/app/api/purchase-orders/route.ts'
const PAYROLL = 'src/app/dashboard/payroll/page.tsx'

describe('a line is shown on the document it is on', () => {
  it('the contracts screen names the document in the reader’s own words, through the one vocabulary', () => {
    const src = read(SCREEN)
    expect(src).toContain("from '@/lib/order-naming'")
    expect(src).toContain('describeLine')
    // Never a second vocabulary: the words live in one file so three
    // doors into a placement cannot disagree about what the paper is
    // called.
    expect(src).not.toMatch(/const\s+\w*[Nn]oun\s*=\s*['"]purchase order['"]/)
  })

  it('a line shows the pair on the other side of the trade, or says there is none', () => {
    const src = read(SCREEN)
    expect(src).toContain('pairLine')
    expect(src).toContain('No line on the other side of this one yet')
  })

  it('a line shows the master contract it is on, or the invitation to tag it, and nothing is tagged for it', () => {
    const src = read(SCREEN)
    expect(src).toContain('masterContractLine(row.masterContract)')
    expect(src).toContain('masterContractLine(contract.masterContract)')
    // The picker offers "Not on one" and never preselects a master.
    expect(src).toContain('Not on one')
  })

  it('the move control is only shown to a seat the route would let through', () => {
    const src = read(SCREEN)
    expect(src).toContain("hasPermission(permissions, 'assignments.write')")
    const route = read('src/app/api/contracts/[id]/master-contract/route.ts')
    expect(route).toContain("hasPermission(caller.permissions, 'assignments.write')")
  })

  it('a reader can find a line by the number their finance team quotes', () => {
    const src = read(SCREEN)
    expect(src).toContain('row.document?.number.toLowerCase().includes(q)')
    expect(src).toContain('row.document?.sellerNumber?.toLowerCase().includes(q)')
  })
})

describe('a line a firm records by hand joins the document already open, and never starts one', () => {
  it('recording a placement puts the line on the order already open between the two firms', () => {
    const src = read(ROUTE)
    // The same rule the award uses to pick a header — one open order per
    // buyer-and-seller pair — so a recorded placement and an awarded one
    // land on one document rather than two.
    expect(src).toContain('chooseHeader(openOrders, {')
    expect(src).toContain('issuedById: clientCompanyId')
    expect(src).toContain('issuedToId: companyId')
    expect(src).toContain('workOrderId: header?.id ?? null')
  })

  it('a supplier recording its own book does not raise the client’s purchase order for them', () => {
    const src = read(ROUTE)
    // One route over, the platform already refuses exactly this: a
    // supplier may not raise an order in the name of a client that is
    // here and could have raised it. And an order nobody signed carries
    // a number an AP clerk will be asked for and cannot find.
    expect(src).not.toContain('headerFor(tx')
    expect(src).not.toContain('workOrder.create')
  })

  it('a line with no document behind it says what will attach and where, rather than showing a blank', () => {
    const src = read(ROUTE)
    expect(src).toContain('record the purchase ')
    // And the screen's own sentence for it comes from the one vocabulary.
    expect(read(SCREEN)).toContain('describeLine')
  })

  it('joining a document somebody else agreed does not rewrite its terms onto the line', () => {
    const src = read(ROUTE)
    expect(src).toContain('lineTermsFrom(header,')
    expect(src).toContain('raised: false')
  })

  it('the person recording it is told which document the line went on, or that none is open yet', () => {
    expect(read(ROUTE)).toContain('the order already open with')
    expect(read(SCREEN)).toContain('onCreated(body.data?.message')
  })

  it('a line with no agreement behind it has no agreement, and none is invented for it', () => {
    const src = read(ROUTE)
    // The fabricated DRAFT agreement is gone: an agreement nobody signed
    // is a fact about a negotiation that never happened. Comments
    // stripped first — the note explaining why it went is not the thing
    // coming back.
    const spoken = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(spoken).not.toContain('masterAgreement.create')
    expect(src).toContain('msaId: msa?.id ?? null')
  })
})

describe('an order screen shows its lines, and what each has billed', () => {
  it('each document lists the people on it, named by person and site', () => {
    const src = read(PO_SCREEN)
    expect(src).toContain('function Lines(')
    expect(src).toContain('lineName(')
    expect(src).toContain('<Lines po={po} />')
  })

  it('what a line has billed is read from the invoice lines, never apportioned from the ceiling', () => {
    const src = read(PO_ROUTE)
    expect(src).toContain('prisma.invoiceLine.groupBy')
    expect(src).toContain("by: ['sellContractId']")
    // Void and cancelled invoices consumed nothing, on the line or on
    // the header.
    expect(src).toContain("notIn: ['VOID', 'CANCELLED']")
  })

  it('a buy line shows no billed figure, because a supplier’s invoice is not an invoice line of ours', () => {
    expect(read(PO_ROUTE)).toContain('billed: null as number | null')
  })

  it('a document with nothing on it says so rather than showing an empty list', () => {
    expect(read(PO_SCREEN)).toContain('No lines on it yet')
  })
})

describe('payroll is how a buy line is settled, not a thing to create', () => {
  it('an empty payroll period points at the placement a pay line is written beside', () => {
    const src = read(PAYROLL)
    expect(src).toContain('A pay line is written beside the placement it funds')
    expect(src).not.toMatch(/Create buy contracts/i)
  })

  it('the screen says which of the two ways a line is settled, and that an employee gets no order', () => {
    const src = read(PAYROLL)
    expect(src).toContain('purchase order to their own employee')
  })
})
