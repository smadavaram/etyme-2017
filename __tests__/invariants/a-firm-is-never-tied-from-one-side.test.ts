/**
 * A firm on Etyme is never tied to you from your side alone (review,
 * 2026-11-13, on the neutral Company wave). The pure rules and the code
 * shapes behind each door; the walks through the routes are in
 * __integration__/a-firm-is-never-tied-from-one-side.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pickOrderSeller, type OrderSellerCandidate } from '@/app/api/imports/sheets/order-seller'

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const firm = (id: string, name: string, over: Partial<OrderSellerCandidate> = {}): OrderSellerCandidate => ({
  id, name, kind: 'VENDOR', claimedAt: new Date(), listedById: null, ...over,
})

describe('a purchase-order sheet names only a firm you may write an order to', () => {
  it('the supplier on a sheet row is matched by name among your own suppliers and records, any capitals or spacing', () => {
    const v = pickOrderSeller('  brightmoor   STAFFING ', [firm('a', 'Brightmoor Staffing'), firm('b', 'Nimbus Talent')])
    expect(v.ok && v.seller.id).toBe('a')
  })

  it('a name none of your suppliers carries is refused in a sentence that echoes only what you typed and says what to do', () => {
    const v = pickOrderSeller('Corriban Logistics', [firm('a', 'Brightmoor Staffing')])
    expect(v).toEqual({
      ok: false, code: 'NO_SUCH_SUPPLIER',
      says: 'None of your suppliers is called "Corriban Logistics". Add it on Companies and extend it to Supplier, then load this row again.',
    })
  })

  it('two of your companies with one name are never guessed between', () => {
    const v = pickOrderSeller('Ashgrove', [firm('a', 'Ashgrove'), firm('b', 'ASHGROVE', { claimedAt: null, listedById: 'me' })])
    expect(!v.ok && v.code).toBe('TWO_OF_ONE_NAME')
  })

  it('the sheet import never looks a supplier up by bare name across every company on Etyme', () => {
    const src = read('src/app/api/imports/sheets/route.ts')
    expect(src).not.toMatch(/company\.findFirst\(\{\s*where:\s*\{\s*name:/)
    expect(src).toContain('orderSellerFor(')
    expect(src).toContain('recordRefusal(')
  })

  it('a consultants sheet preview reads only the people your firm already holds, never every address on Etyme', () => {
    const src = read('src/app/api/imports/sheets/route.ts')
    expect(src).not.toMatch(/person\.findMany\(\{\s*select:\s*\{\s*primaryEmail/)
  })
})

describe('extending a firm on Etyme to Customer writes nothing on their book', () => {
  it('the Customer position writes an agreement only for a company nobody has claimed', () => {
    const src = read('src/app/api/companies/positions.ts')
    const body = src.slice(src.indexOf('export async function writeCustomerPosition('), src.indexOf('/** The Supplier position:'))
    expect(body).toMatch(/onEtyme \? null : await db\.masterAgreement\.create/)
  })

  it('listing a client on Etyme you already work with goes through the same Customer door', () => {
    const src = read('src/app/api/clients/route.ts')
    const linked = src.slice(src.indexOf('await workTogether(companyId, firm.id)'), src.indexOf('linked: true'))
    expect(linked).toContain('writeCustomerPosition(')
  })
})

describe('a company door says nothing about a company you have no business with', () => {
  it('Extend and Kind answer a stranger exactly as they answer an id that does not exist', () => {
    for (const p of ['src/app/api/companies/[id]/extend/route.ts', 'src/app/api/companies/[id]/kind/route.ts']) {
      const src = read(p)
      expect(src).toContain('dealsWith(')
      expect(src).toContain('NOT_ON_YOUR_LIST')
    }
  })
})

describe('the nightly run reads only firms that are really here', () => {
  it('both of the run’s company reads leave out a record another firm made', () => {
    const src = read('src/lib/twin/run.ts')
    for (const fn of ['programsToRun', 'suppliersToRun']) {
      const body = src.slice(src.indexOf(`export async function ${fn}(`), src.indexOf('return rows.map', src.indexOf(`export async function ${fn}(`)))
      expect(body).toContain('...REALLY_HERE')
    }
  })
})

describe('Add a company writes its register row with the company', () => {
  it('the row a relationship asks for is written inside the same transaction as the company', () => {
    const src = read('src/app/api/companies/route.ts')
    const tx = src.slice(src.indexOf('const result = await prisma.$transaction('), src.indexOf('}, { timeout: 20_000 })'))
    expect(tx).toContain('tx.counterparty.upsert(')
  })
})
