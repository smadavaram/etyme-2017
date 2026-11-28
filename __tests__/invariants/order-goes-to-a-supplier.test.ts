import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { suppliersFrom, supplierStanding, type SupplierFacts } from '@/lib/counterparty'
import { mayWriteOrder } from '@/lib/off-system'

const ROOT = join(__dirname, '..', '..')
const CLIENT = 'co-cavanaugh'
const facts = (over: Partial<SupplierFacts> = {}): SupplierFacts => ({
  buyerId: CLIENT, sellersPaid: [], agreementVendors: [], register: [], buysFrom: [], blacklisted: [], ...over,
})
const tenant = (id: string, name: string) => ({ id, name, claimedAt: new Date('2026-01-01') })

describe('who a buyer buys from', () => {
  it('a firm with somebody on site that the client pays is one of the client’s suppliers', () => {
    expect(supplierStanding(suppliersFrom(facts({ sellersPaid: ['co-wrenfield'] })), 'co-wrenfield')).toBe('SUPPLIER')
  })

  it('a firm with an agreement naming the client as client is one of the client’s suppliers', () => {
    expect(supplierStanding(suppliersFrom(facts({ agreementVendors: ['co-veritan'] })), 'co-veritan')).toBe('SUPPLIER')
  })

  it('a firm on the client’s register as a supplier or a prime is a supplier, and one there only as a client is not', () => {
    const s = suppliersFrom(facts({
      register: [
        { otherCompanyId: 'co-sup', relationship: 'SUPPLIER', status: 'ACTIVE' },
        { otherCompanyId: 'co-prime', relationship: 'PRIME', status: 'ACTIVE' },
        { otherCompanyId: 'co-cust', relationship: 'CLIENT', status: 'ACTIVE' },
      ],
    }))
    expect(supplierStanding(s, 'co-sup')).toBe('SUPPLIER')
    expect(supplierStanding(s, 'co-prime')).toBe('SUPPLIER')
    expect(supplierStanding(s, 'co-cust')).toBe('NONE')
  })

  it('a firm the buyer pays on a buy line is a supplier, which is how a prime buys from its sub-vendor', () => {
    expect(supplierStanding(suppliersFrom(facts({ buysFrom: ['co-sub', null] })), 'co-sub')).toBe('SUPPLIER')
  })

  it('a firm the client has blocked is not offered as a supplier, however it came to be one', () => {
    const s = suppliersFrom(facts({ sellersPaid: ['co-a', 'co-b'], blacklisted: ['co-a'],
      register: [{ otherCompanyId: 'co-b', relationship: 'SUPPLIER', status: 'BLOCKED' }] }))
    expect(s.ids.size).toBe(0)
    expect(supplierStanding(s, 'co-a')).toBe('BLOCKED')
    expect(supplierStanding(s, 'co-b')).toBe('BLOCKED')
  })

  it('a firm the client has never dealt with is not a supplier, and the client is never its own', () => {
    const s = suppliersFrom(facts({ sellersPaid: [CLIENT] }))
    expect(supplierStanding(s, 'co-stranger')).toBe('NONE')
    expect(s.ids.has(CLIENT)).toBe(false)
  })
})

describe('a purchase order goes only to one of the buyer’s suppliers', () => {
  const buyer = tenant(CLIENT, 'Cavanaugh Glassworks')

  it('a buyer may raise an order to a firm it already buys from', () => {
    const v = mayWriteOrder({ callerCompanyId: CLIENT, buyer, seller: tenant('co-w', 'Wrenfield Technical'), sellerStanding: 'SUPPLIER' })
    expect(v.ok).toBe(true)
  })

  it('a buyer cannot raise an order to a firm that is not one of its suppliers, and is told to recommend them first', () => {
    const v = mayWriteOrder({ callerCompanyId: CLIENT, buyer, seller: tenant('co-x', 'Brightmoor Staffing'), sellerStanding: 'NONE' })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('Brightmoor Staffing is not one of Cavanaugh Glassworks\'s suppliers')
    expect(v.says).toContain('Recommend them as a supplier first')
  })

  it('a buyer cannot raise an order to a supplier it has blocked, and is told where the block is lifted', () => {
    const v = mayWriteOrder({ callerCompanyId: CLIENT, buyer, seller: tenant('co-x', 'Brightmoor Staffing'), sellerStanding: 'BLOCKED' })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('has blocked Brightmoor Staffing')
  })

  it('the purchase-order supplier picker and the supplier check read the one list of a buyer’s suppliers', () => {
    const picker = readFileSync(join(ROOT, 'src/app/api/companies/suppliers/route.ts'), 'utf8')
    expect(picker).toMatch(/suppliersOf\(desk\.companyId\)/)
    expect(picker).toMatch(/writingDesk\(caller, request\)/)
  })
})
