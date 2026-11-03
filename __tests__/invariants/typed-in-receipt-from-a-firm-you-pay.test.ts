import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The second screen walk, 2026-11-03: a client's AP clerk could not name a
 * supplier on a typed-in invoice receipt, because the form read only the
 * caller's own buy lines. The list is now the firms the caller pays
 * (`suppliersFor`, 23ffa6fe3); this holds the other half, that a receipt
 * typed against a firm the caller does not pay is refused in a sentence.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a typed-in invoice receipt comes from a firm the payer pays', () => {
  it('a client’s supplier list holds the firms whose lines bill it, beside its own buy lines', () => {
    const opts = read('src/lib/money/receipt-options.ts')
    expect(opts).toMatch(/where: \{ clientCompanyId: companyId, companyId: \{ not: companyId \}, state: \{ not: 'DRAFT' \} \}/)
    expect(opts).toMatch(/where: \{ companyId, vendorCompanyId: \{ not: null \}, state: \{ not: 'DRAFT' \} \}/)
  })

  it('a receipt naming no line, from a firm with no line and no order of the payer’s, is refused in a sentence naming both firms', () => {
    const route = read('src/app/api/ap/bills/route.ts')
    expect(route).toContain("code: 'NOT_A_SUPPLIER'")
    expect(route).toContain('does not pay ${vendor.name}: there is no line with them and no order raised to them.')
    expect(route).toContain('An invoice receipt is recorded only from a firm you pay.')
    // Asked across all three ways a firm pays another, before anything is written.
    expect(route).toMatch(/prisma\.buyContract\.count\(\{ where: \{ companyId, vendorCompanyId \} \}\)/)
    expect(route).toMatch(/prisma\.sellContract\.count\(\{ where: \{ companyId: vendorCompanyId, clientCompanyId: companyId \} \}\)/)
    expect(route).toMatch(/prisma\.workOrder\.count\(\{ where: \{ issuedById: companyId, issuedToId: vendorCompanyId \} \}\)/)
    expect(route.indexOf("code: 'NOT_A_SUPPLIER'")).toBeLessThan(route.indexOf('prisma.vendorBill.create'))
  })

  it('a receipt naming a supplier’s line not billed to the payer is refused in its own sentence', () => {
    expect(read('src/app/api/ap/bills/route.ts')).toContain('No line of ${vendor.name}’s is billed to you here.')
  })
})
