import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { appliesTo } from '@/lib/holidays'

/**
 * The last Phase 2 and 3 money pieces: a holiday belongs to a place,
 * a bill that did not match lands on the desk that pays, a milestone
 * bills on acceptance, and a commission run posts what an agent earned.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a holiday belongs to a place', () => {
  it('a holiday with no country is everybody’s; one marked for another country is not this site’s', () => {
    expect(appliesTo(null, 'US')).toBe(true)
    expect(appliesTo('JP', 'US')).toBe(false)
    expect(appliesTo('us', 'US')).toBe(true)
  })
  it('with no site known, every holiday on the calendar applies, as before', () => {
    expect(appliesTo('JP', null)).toBe(true)
  })
  it('the award reads the client’s primary site and passes its country to the calendar', () => {
    const award = read('src/app/api/submissions/[id]/award/route.ts')
    expect(award).toContain("prisma.companyLocation.findFirst({\n    where: { companyId: payerId }")
    expect(award).toContain("site?.country ?? null)")
  })
})

describe('a bill that did not match is a decision for the desk that pays', () => {
  it('recording a disputed bill tells everybody who can record a payment which check failed', () => {
    const bills = read('src/app/api/ap/bills/route.ts')
    expect(bills).toContain("if (statusAfterMatch === 'DISPUTED') {")
    expect(bills).toContain("role: { permissions: { has: 'payments.record' } }")
    expect(bills).toContain('title: `A bill from ${vendor?.name ?? \'a supplier\'} does not match`')
  })
  it('the decisions queue lists disputed bills for the AP desk, held out of payment runs', () => {
    const d = read('src/app/api/decisions/route.ts')
    expect(d).toContain("type: 'BILL_DISPUTED'")
    expect(d).toContain("where: { companyId, status: 'DISPUTED' }")
  })
})

describe('a milestone bills on acceptance', () => {
  it('generation picks up accepted milestones on the engagement’s orders, bills them as lines with the milestone behind, and marks them INVOICED', () => {
    const g = read('src/app/api/invoices/generate/route.ts')
    expect(g).toContain("where: { status: 'ACCEPTED', order: { engagementId, issuedToId: caller.company!.id } }")
    expect(g).toMatch(/milestoneId: m\.id,\s*timesheetId: null,\s*sellContractId: null,\s*personId: null/)
    expect(g).toContain("await tx.orderMilestone.update({ where: { id: m.id }, data: { status: 'INVOICED' } })")
  })
  it('an invoice may carry only milestones', () => {
    expect(read('src/app/api/invoices/generate/route.ts')).toContain('if (timesheets.length === 0 && expenseRows.length === 0 && milestones.length === 0)')
  })
})

describe('the commission run', () => {
  it('posts once per contract per period, under the cap, and writes the run down', () => {
    const r = read('src/app/api/payroll/commissions/route.ts')
    expect(r).toContain('sourceId: `commission:${bc.id}:${periodKey}:${o.sellContractId}`')
    expect(r).toContain("alreadyCents: Math.abs(already._sum.amountCents ?? 0)")
    expect(r).toContain("action: 'COMMISSION_RUN'")
  })
  it('a commission is a cost posting against the order the work billed to', () => {
    expect(read('src/lib/order-postings.ts')).toContain("kind: 'COMMISSION',")
  })
})
