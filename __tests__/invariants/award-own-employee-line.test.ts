import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { buySide, employeePayOnRecord, type EmployeePayLine } from '@/lib/award'

/**
 * The work-country wave's leftover (2026-11-03): a firm's own employee
 * put forward as INTERNAL and awarded must get the employment line, with
 * no order, so the placement never says "No buy line behind this
 * placement" of the firm's own W2. The pay is the firm's own record of
 * it, never a number the award makes up.
 */

const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/submissions/[id]/award/route.ts'), 'utf8')
const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const line = (o: Partial<EmployeePayLine>): EmployeePayLine => ({
  payRateCents: 6_000, lineState: 'IN_PROGRESS', candidateState: 'ACTIVE', startDate: d('2026-01-04'), endDate: null, ...o,
})

describe('the award writes a firm’s own employee’s line from the pay on its own record', () => {
  it('an employee on a line running today is paid what that line pays, the latest started', () => {
    expect(employeePayOnRecord([
      line({ payRateCents: 5_500, startDate: d('2025-03-02') }),
      line({ payRateCents: 6_200, lineState: 'BENCH_PAID', startDate: d('2026-06-07') }),
    ])).toEqual({ cents: 6_200, endedOn: null })
  })

  it('an employee between projects, whose last line has ended, is paid what that line paid, and the line says which', () => {
    const pay = employeePayOnRecord([
      line({ payRateCents: 5_800, lineState: 'ENDED', endDate: d('2026-05-30') }),
      line({ payRateCents: 6_400, lineState: 'ENDED', startDate: d('2026-06-01'), endDate: d('2026-10-03') }),
    ])
    expect(pay).toEqual({ cents: 6_400, endedOn: d('2026-10-03') })
    const buy = buySide({
      awardedCompanyId: 'teleworld', suppliedByCompanyId: null, suppliedRateCents: null,
      employedByAwardedFirm: true, currentPayCents: pay!.cents, payFromLineEndedOn: pay!.endedOn,
    })
    expect(buy).toMatchObject({ write: true, vendorCompanyId: null, contractType: 'W2', payRateCents: 6_400, hopZero: true })
    expect(buy.says).toBe('Their own employee, at the pay on their last line here, which ended Oct 3, 2026.')
  })

  it('a line running today wins over a line that has ended, however recent', () => {
    expect(employeePayOnRecord([
      line({ payRateCents: 9_000, lineState: 'ENDED', startDate: d('2026-08-02'), endDate: d('2026-10-03') }),
      line({ payRateCents: 6_000, lineState: 'INTERNAL', startDate: d('2025-01-05') }),
    ])).toEqual({ cents: 6_000, endedOn: null })
  })

  it('somebody who left a line that runs on for others is not paid by it today', () => {
    expect(employeePayOnRecord([line({ candidateState: 'ENDED', endDate: d('2026-09-12') })]))
      .toEqual({ cents: 6_000, endedOn: d('2026-09-12') })
  })

  it('a draft line nobody confirmed, a cancelled line and a pay of nothing are not pay on record, so no line is written and the firm states it', () => {
    expect(employeePayOnRecord([
      line({ lineState: 'DRAFT' }), line({ lineState: 'CANCELLED' }), line({ payRateCents: 0 }),
    ])).toBeNull()
    const buy = buySide({
      awardedCompanyId: 'teleworld', suppliedByCompanyId: null, suppliedRateCents: null,
      employedByAwardedFirm: true, currentPayCents: null,
    })
    expect(buy).toMatchObject({ write: false })
    expect(buy.says).toBe('Their own employee, with no pay on record yet. The firm states it before they can start.')
  })

  it('the employment line hangs on no order: the award raises its own order only where it buys from another firm', () => {
    expect(ROUTE).toContain('const buyHeader = buy.write && buy.vendorCompanyId && buyCeiling')
    expect(ROUTE).toContain('workOrderId: buyHeader?.id ?? null,')
  })

  it('the award reads the firm’s own W2 lines, running or ended, through the one reader', () => {
    expect(ROUTE).toContain('employeePayOnRecord((await prisma.buyContractCandidate.findMany({')
    expect(ROUTE).toContain("state: { in: ['IN_PROGRESS', 'BENCH_PAID', 'INTERNAL', 'TRAINING', 'PAUSED', 'ENDED'] },")
    expect(ROUTE).toContain('payFromLineEndedOn: currentPay?.endedOn ?? null,')
  })
})
