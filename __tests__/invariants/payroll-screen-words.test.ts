/**
 * Four things the seeded pay rise (Rosa Delgado, $66 to $70 from a
 * Wednesday) showed wrong on the payroll and rate screens, each put
 * right as a sentence.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ratesSay, decidedBy } from '@/lib/money/pay-words'
import { nextOpen, overdueOpen } from '@/lib/money/next-cycle'
import { buildExport, missingIds, type SheetToPay } from '@/lib/payroll-export'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the payroll screen shows a period paid at two rates as both', () => {
  it('says 16 hours at $66 and 24 at $70, the way the payroll file splits the week of the rise', () => {
    expect(ratesSay([{ rateCents: 6_600, hours: 16 }, { rateCents: 7_000, hours: 24 }])).toBe('16 h at $66 · 24 h at $70')
  })

  it('says nothing more where one rate covered the whole period', () => {
    expect(ratesSay([{ rateCents: 7_000, hours: 40 }])).toBeNull()
    expect(ratesSay(null)).toBeNull()
  })

  it('draws the split under the pay rate on the payroll screen, in the line\'s own currency', () => {
    expect(read('src/app/dashboard/payroll/page.tsx')).toContain('ratesSay(row.rates, row.payCurrency)')
  })
})

const sheet = (over: Partial<SheetToPay> = {}): SheetToPay => ({
  personId: 'rosa',
  personName: 'Rosa Delgado',
  payrollId: null,
  contractType: 'W2',
  cutOvertime: 'ABOVE_THE_LINE',
  weAreTheEmployer: true,
  periodStart: new Date('2026-07-27T00:00:00Z'),
  periodEnd: new Date('2026-07-31T00:00:00Z'),
  weeks: [
    {
      weekOf: '2026-07-27', regularHours: 40, leaveHours: 0, overHours: 0,
      client: { treatment: null, appliedBps: null }, payRateCents: 6_600,
      rates: [{ rateCents: 6_600, hours: 16 }, { rateCents: 7_000, hours: 24 }],
    },
  ],
  submittedHours: 40,
  acceptedHours: null,
  employerAcceptedAt: new Date('2026-08-01T00:00:00Z'),
  payRateCents: 6_600,
  payModel: 'FIXED_HOURLY',
  paidOnSalaryBasis: false,
  rule: 'US_FLSA',
  assertion: null,
  currency: 'USD',
  costCode: null,
  orderNumber: null,
  ...over,
})

describe('the payroll file counts people, not rate lines', () => {
  it('counts somebody paid at two rates in one period as one person', () => {
    const e = buildExport('GENERIC', [sheet()])
    expect(e.lines).toHaveLength(2)
    expect(e.says.startsWith('1 person, 40 hours')).toBe(true)
  })

  it('counts one person with two weekly sheets in the period as one person', () => {
    const e = buildExport('GENERIC', [sheet(), sheet({ periodStart: new Date('2026-08-03T00:00:00Z'), periodEnd: new Date('2026-08-07T00:00:00Z') })])
    expect(e.says.startsWith('1 person,')).toBe(true)
  })

  it('still counts two different people as two', () => {
    const e = buildExport('GENERIC', [sheet(), sheet({ personId: 'priya', personName: 'Priya Venkataraman' })])
    expect(e.says.startsWith('2 people,')).toBe(true)
  })

  it('lists somebody with no payroll id once, however many rates they were paid at', () => {
    expect(missingIds(buildExport('GENERIC', [sheet()]))).toEqual(['Rosa Delgado'])
  })
})

describe('the next pay date is the next one, not the last one', () => {
  const c = (kind: string, due: string, done = false) => ({ kind, dueOn: new Date(`${due}T00:00:00Z`), completedAt: done ? new Date() : null })
  const TODAY = new Date('2026-09-29T00:00:00Z')

  it('reads the earliest pay date still open from today on, never the last one generated for the placement', () => {
    // Newest first, the way the screen reads them.
    const cycles = [c('SALARY_PAY', '2027-02-12'), c('SALARY_PAY', '2026-10-30'), c('SALARY_PAY', '2026-09-30'), c('SALARY_PAY', '2026-08-31', true)]
    expect(nextOpen(cycles, 'SALARY_PAY', TODAY)!.dueOn.toISOString().slice(0, 10)).toBe('2026-09-30')
  })

  it('calls an open pay date before today overdue, counted and named beside the next one, rather than next', () => {
    const cycles = [c('SALARY_PAY', '2026-10-30'), c('SALARY_PAY', '2026-07-31'), c('SALARY_PAY', '2026-06-30')]
    expect(nextOpen(cycles, 'SALARY_PAY', TODAY)!.dueOn.toISOString().slice(0, 10)).toBe('2026-10-30')
    const late = overdueOpen(cycles, 'SALARY_PAY', TODAY)
    expect(late.count).toBe(2)
    expect(late.earliest!.toISOString().slice(0, 10)).toBe('2026-06-30')
  })

  it('has no next pay date when every one is done', () => {
    expect(nextOpen([c('SALARY_PAY', '2026-07-31', true)], 'SALARY_PAY', TODAY)).toBeNull()
  })

  it('is what the payroll screen reads, and it shows a cycle date as its own day, not a day early in a US browser', () => {
    const src = read('src/app/api/payroll/route.ts')
    expect(src).toContain("nextOpen(bc.buyCycles, 'SALARY_PAY', today)")
    expect(src).toContain("overdueOpen(bc.buyCycles, 'SALARY_PAY', today)")
    expect(read('src/app/dashboard/payroll/page.tsx')).toContain("timeZone: 'UTC'")
  })
})

describe('Rate History names who decided a change as well as who proposed it', () => {
  it('names the second desk that approved a rise', () => {
    expect(decidedBy({ approvalState: 'APPROVED', approvedByName: 'Marta Oyelaran', changedByName: 'Dana Whitfield' })).toBe('Marta Oyelaran')
  })

  it('says a change nobody has decided is waiting', () => {
    expect(decidedBy({ approvalState: 'PROPOSED', approvedByName: null, changedByName: 'Dana Whitfield' })).toBe('Waiting')
  })

  it('says who rejected one', () => {
    expect(decidedBy({ approvalState: 'REJECTED', approvedByName: 'Marta Oyelaran', changedByName: 'Dana Whitfield' })).toBe('Rejected by Marta Oyelaran')
  })

  it('says a change that cleared on its own was within the threshold, the one case its proposer approved it', () => {
    expect(decidedBy({ approvalState: 'APPROVED', approvedByName: 'Dana Whitfield', changedByName: 'Dana Whitfield' })).toBe('Dana Whitfield (within the threshold)')
  })

  it('shows "Proposed by" and "Decided by" as two columns on the screen', () => {
    const src = read('src/app/dashboard/rate-history/page.tsx')
    expect(src).toContain("label: 'Proposed by'")
    expect(src).toContain("label: 'Decided by'")
  })
})
