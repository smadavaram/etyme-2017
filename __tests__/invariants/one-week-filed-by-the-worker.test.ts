import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mayFile, rungVerdict, type OnFile } from '@/app/api/timesheets/filing'
import { rungsToFile, type WorkRung } from '@/lib/consultant-portfolio'
import { whereHoursLive, mayBill, type Rung } from '@/lib/work-chain'

/**
 * One week, filed once by the worker, signed at the top.
 *
 * Founder, 2026-09-28. The door that writes weeks asked none of the
 * worker's questions: a probe filed Helena Marsh's week on the Computer
 * Systems → Northbend rung, above her employer's, and got a 201; future
 * days, days outside the placement and days another week covered all went
 * in; and a week sent back could never be corrected.
 */

const TODAY = '2026-09-28' // a Monday
const PLACEMENT = { startDate: '2026-03-12', endDate: '2027-03-07' }

const file = (over: Partial<Parameters<typeof mayFile>[0]> = {}) =>
  mayFile({
    periodStart: '2026-09-21',
    periodEnd: '2026-09-27',
    hours: { '2026-09-21': 8, '2026-09-22': 8 },
    contract: PLACEMENT,
    onFile: [],
    today: TODAY,
    ...over,
  })

const week = (over: Partial<OnFile> = {}): OnFile => ({
  id: 'w1', status: 'APPROVED', periodStart: '2026-09-14', periodEnd: '2026-09-20', actedOn: false, ...over,
})

// Helena: Techpeple employs her and sells her to Computer Systems, which
// sells her to Northbend Athletic.
const HELENA: WorkRung[] = [
  { id: 'techpeple-rung', personId: 'helena', companyId: 'techpeple', clientCompanyId: 'cs', state: 'IN_PROGRESS', startDate: '2026-03-12', endDate: '2027-03-07' },
  { id: 'cs-rung', personId: 'helena', companyId: 'cs', clientCompanyId: 'northbend', state: 'IN_PROGRESS', startDate: '2026-03-12', endDate: '2027-03-07' },
]

describe('only the worker files, and only on their own rung', () => {
  it('a week on a rung above the worker’s employer is refused, because every rung above bills the week filed below', () => {
    const v = rungVerdict(HELENA, 'cs-rung', TODAY)
    expect(v?.ok).toBe(false)
    if (v && !v.ok) {
      expect(v.code).toBe('NOT_THIS_RUNG')
      expect(v.says).toBe('Your hours go on the contract with the firm that employs you, not this one. Choose that placement.')
    }
  })

  it('a week on the employer’s rung is the worker’s to file', () => {
    expect(rungVerdict(HELENA, 'techpeple-rung', TODAY)).toBeNull()
  })

  it('a placement that is not running takes no hours', () => {
    const paused = HELENA.map((r) => ({ ...r, state: 'SUSPENDED' }))
    const v = rungVerdict(paused, 'techpeple-rung', TODAY)
    expect(v && !v.ok && v.code).toBe('NOT_TAKING_HOURS')
  })

  it('the rung a worker files on is the rung every rung above bills from, so the week the client signs at the top is the one week below it', () => {
    const own = rungsToFile(HELENA, TODAY).map((r) => r.id)
    expect(own).toEqual(['techpeple-rung'])
    const ladder: Rung[] = [
      { sellContractId: 'cs-rung', companyId: 'cs', buyContractId: 'cs-buy', supplierSellContractId: 'techpeple-rung' },
      { sellContractId: 'techpeple-rung', companyId: 'techpeple', buyContractId: 'techpeple-buy', supplierSellContractId: null },
    ]
    expect(whereHoursLive('cs-rung', ladder)).toBe('techpeple-rung')
    expect(mayBill('cs-rung', 'techpeple-rung', ladder)).toBe(true)
    // And never the other way: a week on the prime's rung is nothing the
    // employer below could bill.
    expect(mayBill('techpeple-rung', 'cs-rung', ladder)).toBe(false)
  })
})

describe('the days on a week', () => {
  it('a week of days that have happened, inside the placement, is filed', () => {
    const v = file()
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.totalHours).toBe(16)
      expect(v.replaces).toBeNull()
    }
  })

  it('a day that has not happened yet is refused, even with no hours on it, because the week would claim it', () => {
    const v = file({ periodStart: '2026-09-28', periodEnd: '2026-10-04', hours: { '2026-09-28': 8 } })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).toBe('Tue, Sep 29 has not happened yet. Send the week once its days are over, or end it on Mon, Sep 28.')
  })

  it('a day before the placement starts is refused, naming the first day', () => {
    const v = file({ contract: { startDate: '2026-09-23', endDate: null }, hours: { '2026-09-23': 8 } })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).toBe('Mon, Sep 21 is before your placement starts on Wed, Sep 23. Start the week on Wed, Sep 23.')
  })

  it('a day after the placement ended is refused, naming the last day', () => {
    const v = file({ contract: { startDate: '2026-03-12', endDate: '2026-09-23' } })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).toBe('Thu, Sep 24 is after your placement ended on Wed, Sep 23. End the week on Wed, Sep 23.')
  })

  it('a day another week already covers is refused, so two weeks never claim one day', () => {
    const v = file({ onFile: [week({ periodStart: '2026-09-17', periodEnd: '2026-09-23' })] })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.code).toBe('ALREADY_FILED')
      expect(v.says).toBe('Mon, Sep 21 is already on a week you filed.')
    }
  })

  it('a week with no hours on it is not a week anybody can sign', () => {
    const v = file({ hours: {} })
    expect(v.ok).toBe(false)
  })

  it('a period that ends before it starts, or runs longer than a month, is refused in a sentence', () => {
    expect(file({ periodEnd: '2026-09-20' }).ok).toBe(false)
    const long = file({ periodStart: '2026-08-01', periodEnd: '2026-09-27' })
    expect(long.ok).toBe(false)
    if (!long.ok) expect(long.says).toContain('at most 31 days')
  })
})

describe('a week sent back is filed again over itself', () => {
  it('a week returned to the worker is filed again on the same row, not refused as a duplicate', () => {
    const v = file({ onFile: [week({ id: 'returned', status: 'OPEN', periodStart: '2026-09-21', periodEnd: '2026-09-27' })] })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.replaces).toBe('returned')
  })

  it('a week already sent or approved cannot be filed again; it has to be returned first', () => {
    for (const status of ['SUBMITTED', 'APPROVED']) {
      const v = file({ onFile: [week({ status, periodStart: '2026-09-21', periodEnd: '2026-09-27' })] })
      expect(v.ok).toBe(false)
      if (!v.ok) expect(v.says).toBe('The week of Mon, Sep 21 is already sent. If it is wrong, ask for it to be returned, then file it again.')
    }
  })

  it('a returned week somebody has already billed, decided or drawn leave from is not overwritten', () => {
    const v = file({ onFile: [week({ status: 'OPEN', actedOn: true, periodStart: '2026-09-21', periodEnd: '2026-09-27' })] })
    expect(v.ok).toBe(false)
  })

  it('filing again clears both signatures, because they were given on hours that are no longer the hours', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/timesheets/route.ts'), 'utf8')
    const replace = route.slice(route.indexOf('filing.replaces\n      ?'), route.indexOf(': await prisma.timesheet.create'))
    for (const cleared of ['clientApprovedAt: null', 'employerAcceptedAt: null', 'acceptedHours: null', 'approvedAt: null']) {
      expect(replace).toContain(cleared)
    }
  })
})

describe('the door asks, not only the page', () => {
  it('the timesheets door checks the rung and the days itself, with the worker’s own rules', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/timesheets/route.ts'), 'utf8')
    expect(route).toMatch(/rungVerdict\(/)
    expect(route).toMatch(/mayFile\(/)
    const filing = readFileSync(join(process.cwd(), 'src/app/api/timesheets/filing.ts'), 'utf8')
    // Reused from supply, never a second copy.
    expect(filing).toMatch(/import \{ checkWeek, dayStanding, rungsToFile/)
  })
})
