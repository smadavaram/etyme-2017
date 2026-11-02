import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The supplier register (`GET /api/suppliers`) was the slowest read of the
 * page timing pass (2026-11-02): 20.7 s at 40 at once for Corvane's hiring
 * manager, 414 queries for 25 suppliers, because what each firm owes on
 * the client's orders was read one firm after another, and every time the
 * client's whole order set and dictionary were read again.
 */

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
const desks = code('src/lib/supplier-desks.ts')
const owing = desks.slice(desks.indexOf('export async function suppliersOwing('), desks.indexOf('export async function keepSupplierPaper('))
const each = desks.slice(desks.indexOf('export async function orderedOfEachSupplier('), desks.indexOf('export async function suppliersOwing('))

describe('the supplier register reads what every firm owes at once, never one firm after another', () => {
  it('what each firm owes is read for every firm at once, beside what each firm holds', () => {
    expect(owing).toContain('orderedOfEachSupplier(companyId, ids)')
    expect(owing).toMatch(/const \[held, orderedOf\] = await Promise\.all\(\[/)
    expect(owing).not.toContain('await orderedOfSupplier(')
  })

  it('the client’s order set and its dictionary are read once, however many suppliers there are', () => {
    expect(each.match(/prisma\.documentRequirement\.findMany\(/g)?.length).toBe(1)
    expect(each.match(/dictionaryOf\(companyId\)/g)?.length).toBe(1)
    // Every firm's line in one read, not a read per firm.
    expect(each).toContain("where: { clientCompanyId: companyId, companyId: { in: [...supplierIds] } },")
    expect(each).not.toContain('sellContract.findFirst(')
  })

  it('each firm’s own line is still read through the one door, so an item added or waived for one firm is honored', () => {
    expect(each).toContain('await requirementsFor({ sellContractId: lineId })')
    expect(each).toContain('withLine(base, byKey, set)')
    expect(desks).toMatch(/export async function orderedOfSupplier[\s\S]*?return withLine\(base, byKey, set\)/)
  })

  it('a firm’s line is picked the same way by the register and by a submission: earliest state, latest start, then the id', () => {
    expect(desks).toContain("const LINE_FIRST = [{ state: 'asc' as const }, { startDate: 'desc' as const }, { id: 'asc' as const }]")
    expect(desks.match(/orderBy: LINE_FIRST,/g)?.length).toBe(2)
  })

  it('the register itself asks once per request, through the one function', () => {
    const route = code('src/app/api/suppliers/route.ts')
    expect(route.match(/suppliersOwing\(/g)?.length).toBe(1)
  })
})
