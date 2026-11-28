import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { codingReader, codesAreThePayers, splitIsPayers } from '@/lib/money/coding-reader'

/**
 * A client's codes stay the client's (CLAUDE.md, "Money"; the schema's
 * note above InternalOrder). Only the company that pays an invoice reads
 * the cost centers and GL accounts on it. The route's walk on the seeded
 * world is `__integration__/invoice-coding-wall.test.ts`.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const client = { id: 'client', name: 'Client Co' }
const supplier = { id: 'supplier', name: 'Supplier Co' }

describe('who reads the cost coding on an invoice', () => {
  it('the client that pays reads them as before', () => {
    expect(codingReader({ readerCompanyId: 'client', vendor: supplier, payer: client, invoiceNumber: 'INV-1' }).kind).toBe('PAYER')
  })

  it('a supplier cannot read the cost centers or accounts on its own bill to a client, and is told whose they are in one sentence', () => {
    const r = codingReader({ readerCompanyId: 'supplier', vendor: supplier, payer: client, invoiceNumber: 'INV-1' })
    expect(r.kind).toBe('ISSUER')
    if (r.kind !== 'ISSUER') return
    expect(r.says).toContain('INV-1 belong to Client Co, and only Client Co reads them')
    expect(r.says).not.toMatch(/forbidden|permission|desk|program office/i)
  })

  it('a firm that is neither party is answered as if the invoice did not exist', () => {
    expect(codingReader({ readerCompanyId: 'other', vendor: supplier, payer: client, invoiceNumber: 'INV-1' }).kind).toBe('STRANGER')
  })

  it('where nothing says who pays, nobody reads the codes', () => {
    expect(codingReader({ readerCompanyId: 'client', vendor: null, payer: null, invoiceNumber: 'INV-1' }).kind).toBe('STRANGER')
    expect(codingReader({ readerCompanyId: null, vendor: supplier, payer: client, invoiceNumber: 'INV-1' }).kind).toBe('STRANGER')
  })

  it('the sentence never names anybody when the payer has no name on the record', () => {
    expect(codesAreThePayers('INV-9', null)).toContain('belong to the company that pays it')
  })

  it('a firm between that pays a sub-vendor never reads the end client’s split on the same line', () => {
    expect(splitIsPayers([{ costCenter: { companyId: 'client' } }], 'client')).toBe(true)
    expect(splitIsPayers([{ costCenter: { companyId: 'client' } }], 'prime')).toBe(false)
    expect(splitIsPayers([{ costCenter: { companyId: 'prime' } }, { costCenter: { companyId: 'client' } }], 'prime')).toBe(false)
    expect(splitIsPayers([], 'client')).toBe(false)
  })
})

describe('the route and the screen read the same answer', () => {
  it('the coding route refuses through the one decision and logs the refusal before it is sent', () => {
    const route = read('src/app/api/invoices/[id]/coding/route.ts')
    expect(route).toContain('codingReader(')
    const logged = route.indexOf('await recordRefusal(')
    const refused = route.indexOf("code: 'FORBIDDEN'")
    expect(logged).toBeGreaterThan(-1)
    expect(refused).toBeGreaterThan(logged)
    expect(route).not.toContain('Not a party to this invoice')
  })

  it('a supplier opening its own bill is shown no cost center, no account and no export of them', () => {
    const screen = read('src/app/dashboard/invoices/invoice-money.tsx')
    expect(screen).toContain("const readsCoding = invoice.direction === 'PAYABLE'")
    expect(screen).toMatch(/if \(!readsCoding\) \{\s*setCoding\(null\)/)
    expect(screen).toContain('{readsCoding && coding && coding.rows.length > 0 && (')
    // The export link sits inside that block and nowhere else.
    const block = screen.indexOf('{readsCoding && coding && coding.rows.length > 0 && (')
    expect(screen.indexOf('coding?format=csv')).toBeGreaterThan(block)
    expect(screen.split('coding?format=csv').length).toBe(2)
  })
})
