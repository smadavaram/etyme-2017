import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isWorkersOwnPayLine, ownPayLineWhere } from '@/lib/money/paid-through'
import { callerCompanyIdFromMe } from '@/lib/money/caller-company'
import { orderIsTheirsSays, rolesThatRaiseOrders } from '@/lib/money/order-raiser'
import { signOfferFor } from '@/lib/money/agreement-record'
import { lineDoesForReader } from '@/lib/money/order-line-words'

/**
 * The Tapin walk, 2026-10-29: a bench supplier selling through a prime
 * found four faults in money's files. Each sentence below is one of them,
 * read on the shapes the walk met.
 */

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8')

// Ravi Kumar, Tapin's W2 at $45. Brightmoor buys him from Tapin at $100.
const brightmoorBuysFromTapin = { contractType: 'C2C', vendorCompanyId: 'tapin', supplierSellContractId: null }
const tapinEmploysRavi = { contractType: 'W2', vendorCompanyId: null, supplierSellContractId: null }

describe('the worker’s own page and the rungs above him', () => {
  it('a worker’s own page never shows a rate of a rung he is not party to', () => {
    // Before Tapin has written its own line, the prime's line names Ravi
    // and has no rung below it on the record. It is still a price between
    // two firms, and never his.
    expect(isWorkersOwnPayLine(brightmoorBuysFromTapin, [])).toBe(false)
    // After, the rung below is named, and it stays closed.
    expect(isWorkersOwnPayLine({ ...brightmoorBuysFromTapin, supplierSellContractId: 'tapin-sell' }, [])).toBe(false)
    // His employer's line is his.
    expect(isWorkersOwnPayLine(tapinEmploysRavi, [])).toBe(true)
  })

  it('a line buying from the worker’s own company is hers to read, corp to corp', () => {
    expect(isWorkersOwnPayLine({ contractType: 'C2C', vendorCompanyId: 'byrne-llc', supplierSellContractId: null }, ['byrne-llc'])).toBe(true)
  })

  it('the worker’s rate history asks the database for her own pay line only, never one bought from another firm', () => {
    const where = ownPayLineWhere('ravi', [])
    expect(where.supplierSellContractId).toBeNull()
    expect(where.OR).toEqual([{ vendorCompanyId: null }])
    expect(ownPayLineWhere('colleen', ['byrne-llc']).OR).toEqual([{ vendorCompanyId: null }, { vendorCompanyId: { in: ['byrne-llc'] } }])
    const route = src('app/api/rate-history/route.ts')
    expect(route).toContain('ownPayLineWhere(caller.person.id')
    expect(route).not.toMatch(/candidates: \{ some: \{ personId: caller\.person\.id \} \} \}, supplierSellContractId: null/)
  })
})

describe('Record a placement', () => {
  it('Record a placement knows the caller’s company', () => {
    // `/api/me` returns the seat in use and every seat, never a bare companyId.
    expect(callerCompanyIdFromMe({ data: { activeContext: { company: { id: 'tapin' } }, contexts: [] } })).toBe('tapin')
    expect(callerCompanyIdFromMe({ data: { activeContext: null, contexts: [{ company: { id: 'tapin' } }] } })).toBe('tapin')
    expect(callerCompanyIdFromMe({ data: { activeContext: null, contexts: [] } })).toBeNull()
    const page = src('app/dashboard/contracts/page.tsx')
    expect(page).toContain('callerCompanyIdFromMe(meBody)')
    expect(page).not.toContain('meBody.data?.companyId')
  })
})

describe('recording the order a prime gave you', () => {
  const brightmoorRoles = [
    { name: 'Recruiter', permissions: ['submissions.write'] },
    { name: 'Owner', permissions: ['*'] },
    { name: 'Admin', permissions: ['*'] },
    { name: 'Contract Manager', permissions: ['rates.write', 'invoices.issue'] },
    { name: 'Finance', permissions: ['invoices.read', 'invoices.issue'] },
  ]

  it('the order refusal names the role that may at a supplier', () => {
    expect(rolesThatRaiseOrders(brightmoorRoles)).toEqual(['Owner', 'Admin', 'Contract Manager', 'Finance'])
    const says = orderIsTheirsSays({ buyerName: 'Brightmoor Staffing', roles: brightmoorRoles })
    expect(says).toContain("Ask Brightmoor Staffing's Owner, Admin, Contract Manager or Finance to raise it.")
    expect(says).not.toMatch(/MSP|AP clerk/)
  })

  it('a buyer with no role that may raise an order is named itself, never a role it does not have', () => {
    const says = orderIsTheirsSays({ buyerName: 'Brightmoor Staffing', roles: [{ name: 'Recruiter', permissions: [] }] })
    expect(says).toContain('Ask Brightmoor Staffing to raise it.')
  })

  it('the order route reads the buyer’s own roles for the refusal', () => {
    const route = src('app/api/purchase-orders/route.ts')
    expect(route).toContain('orderIsTheirsSays({')
  })

  it('a sub reads the prime’s buy line as the line that pays it, not in the prime’s words', () => {
    const line = { side: 'BUY' as const, personName: 'Ravi Kumar', paidToName: 'Tapin' }
    expect(lineDoesForReader(line, 'SELLER', 'Brightmoor Staffing')).toBe(
      'Brightmoor Staffing pays you from this line — your invoice, received and matched.'
    )
    expect(lineDoesForReader(line, 'BUYER', 'Tapin')).toContain("You pay from this line — Tapin's invoice")
  })
})

describe('signing an agreement on screen', () => {
  it('an agreement is countersigned on screen by the seat that may', () => {
    // Tapin sells to Brightmoor and holds the paper: its contract desk
    // records both sides, the second being the countersignature.
    const none = signOfferFor({ role: 'VENDOR', counterpartyName: 'Brightmoor Staffing', signedParties: [], holdsTheDesk: true })
    expect(none).toMatchObject({ offer: true, sides: ['VENDOR', 'CLIENT'] })
    const half = signOfferFor({ role: 'VENDOR', counterpartyName: 'Brightmoor Staffing', signedParties: ['VENDOR'], holdsTheDesk: true })
    expect(half).toMatchObject({ offer: true, sides: ['CLIENT'] })
    expect(half.says).toContain('countersignature')
    // Nobody else is offered a button the sign route would refuse.
    expect(signOfferFor({ role: 'VENDOR', counterpartyName: 'Brightmoor Staffing', signedParties: [], holdsTheDesk: false }).offer).toBe(false)
    expect(signOfferFor({ role: 'CLIENT', counterpartyName: 'Tapin', signedParties: [], holdsTheDesk: true })).toMatchObject({
      offer: false, says: 'Tapin records the signatures, both sides, from the copy it holds.',
    })
    expect(signOfferFor({ role: 'VENDOR', counterpartyName: 'X', signedParties: ['VENDOR', 'CLIENT'], holdsTheDesk: true }).offer).toBe(false)
    expect(signOfferFor({ role: 'VENDOR', counterpartyName: 'X', signedParties: [], holdsTheDesk: true, ended: true }).offer).toBe(false)

    const screen = src('app/dashboard/purchase-orders/agreements.tsx')
    expect(screen).toContain('/api/program/agreements/${row.id}/sign')
    // The signatures are read where the list route puts them.
    expect(screen).toContain('a.signing?.signatures')
  })
})
