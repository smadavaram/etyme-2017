import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { pickCycle, type CycleRow } from '@/lib/cycle-complete'

/**
 * A cycle is marked done when the thing it was waiting for happens.
 *
 * The placement timeline reads `completedAt` to say hours, pay and bill
 * are done, and only the pay run ever set it. A week submitted, signed,
 * invoiced and paid stayed "Hours due · overdue" for the life of the
 * contract. "All tables must keep moving their statuses across the
 * app." This is the table that did not.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const c = (id: string, kind: string, due: string, done = false): CycleRow => ({
  id, kind, dueOn: d(due), completedAt: done ? d(due) : null,
})

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('which cycle a week completes', () => {
  // Sunday-to-Saturday weeks, hours due the Monday after, approved the
  // Wednesday. Labor Day, Monday 7 September 2026, moves the first week's
  // hours to Tuesday 8.
  const weekly = [
    c('w1', 'TIMESHEET_SUBMIT', '2026-09-08'),
    c('w2', 'TIMESHEET_SUBMIT', '2026-09-14'),
    c('w3', 'TIMESHEET_SUBMIT', '2026-09-21'),
    c('a2', 'TIMESHEET_APPROVE', '2026-09-16'),
  ]

  it('a week ending Saturday completes the hours cycle due the Monday after, not the week before or after', () => {
    expect(pickCycle(weekly, 'TIMESHEET_SUBMIT', d('2026-09-12'))?.id).toBe('w2')
  })

  it('a due date moved to Tuesday by a Monday holiday still belongs to the week that ended the Saturday before', () => {
    expect(pickCycle(weekly, 'TIMESHEET_SUBMIT', d('2026-09-05'))?.id).toBe('w1')
  })

  it('a week nobody submitted stays owed — a later week does not quietly complete it', () => {
    expect(pickCycle(weekly, 'TIMESHEET_SUBMIT', d('2026-09-19'))?.id).toBe('w3')
    expect(weekly.find((x) => x.id === 'w2')!.completedAt).toBeNull()
  })

  it('only the kind that happened moves: submitting hours does not approve them', () => {
    expect(pickCycle(weekly, 'TIMESHEET_APPROVE', d('2026-09-12'))?.id).toBe('a2')
    expect(pickCycle(weekly, 'INVOICE_GENERATE', d('2026-09-12'))).toBeNull()
  })

  it('a cycle already done is not done twice', () => {
    const done = [c('w2', 'TIMESHEET_SUBMIT', '2026-09-14', true), c('w3', 'TIMESHEET_SUBMIT', '2026-09-21')]
    expect(pickCycle(done, 'TIMESHEET_SUBMIT', d('2026-09-12'))?.id).toBe('w3')
  })

  it('a Friday reminder an older pack wrote is still completed by the Sunday-to-Saturday week ending the day after it', () => {
    const fridays = [c('f1', 'TIMESHEET_SUBMIT', '2026-09-11'), c('f2', 'TIMESHEET_SUBMIT', '2026-09-18')]
    expect(pickCycle(fridays, 'TIMESHEET_SUBMIT', d('2026-09-12'))?.id).toBe('f1')
  })

  it('a contract with no cycles of that kind completes nothing, and nothing fails', () => {
    expect(pickCycle([], 'TIMESHEET_SUBMIT', d('2026-09-12'))).toBeNull()
  })
})

describe('a week from before the first reminder', () => {
  // Awarded for work already under way: no reminder before the award, so
  // the first one written is for the week after it.
  const fromAward = [
    c('w3', 'TIMESHEET_SUBMIT', '2026-09-21'),
    c('w4', 'TIMESHEET_SUBMIT', '2026-09-28'),
  ]

  it('the earliest reminder of its kind is not claimed by a period that ended a whole cycle or more before it', () => {
    expect(pickCycle(fromAward, 'TIMESHEET_SUBMIT', d('2026-09-12'))).toBeNull()
    expect(pickCycle(fromAward, 'TIMESHEET_SUBMIT', d('2026-09-05'))).toBeNull()
  })

  it('a first pay date a holiday pulled back to the Friday before is not claimed by the week before the one it pays', () => {
    // Labor Day pay moved back from Monday 7 to Friday 4 September: a
    // ten-day gap to the next, which is not the rhythm.
    const pulledBack = [
      c('p1', 'SALARY_PAY', '2026-09-04'),
      c('p2', 'SALARY_PAY', '2026-09-14'),
      c('p3', 'SALARY_PAY', '2026-09-21'),
    ]
    expect(pickCycle(pulledBack, 'SALARY_PAY', d('2026-08-29'))).toBeNull()
    expect(pickCycle(pulledBack, 'SALARY_PAY', d('2026-09-05'))?.id).toBe('p1')
  })

  it('a Sunday-to-Saturday week ending the day after a Friday reminder the floor dropped does not claim the next Friday’s', () => {
    const fridays = [c('f1', 'TIMESHEET_SUBMIT', '2026-10-09'), c('f2', 'TIMESHEET_SUBMIT', '2026-10-16')]
    expect(pickCycle(fridays, 'TIMESHEET_SUBMIT', d('2026-10-03'))).toBeNull()
  })

  it('a semimonthly invoice date is claimed by the week that ends before it, though one gap in the year is shorter than the one before it', () => {
    // A placement awarded on 6 October: its first invoice date is 15
    // October, and the year runs 13 to 18 days between dates — 16 February
    // to 1 March is the shortest. The week ending Saturday 3 October is the
    // first half of October's, and claims it.
    const year = ['2026-10-15', '2026-11-02', '2026-11-16', '2026-11-30', '2026-12-15', '2026-12-31',
      '2027-01-15', '2027-02-01', '2027-02-16', '2027-03-01', '2027-03-15', '2027-03-31']
      .map((due) => c(due, 'INVOICE_GENERATE', due))
    expect(pickCycle(year, 'INVOICE_GENERATE', d('2026-10-03'))?.id).toBe('2026-10-15')
    // And the second half of September, whose own date was never written, claims nothing.
    expect(pickCycle(year, 'INVOICE_GENERATE', d('2026-09-30'))).toBeNull()
  })

  it('the week the earliest reminder is for still claims it', () => {
    expect(pickCycle(fromAward, 'TIMESHEET_SUBMIT', d('2026-09-19'))?.id).toBe('w3')
  })

  it('a first reminder moved to Tuesday by a Monday holiday still belongs to the week that ended the Saturday before it', () => {
    const shifted = [c('w3', 'TIMESHEET_SUBMIT', '2026-09-15'), c('w4', 'TIMESHEET_SUBMIT', '2026-09-21')]
    expect(pickCycle(shifted, 'TIMESHEET_SUBMIT', d('2026-09-12'))?.id).toBe('w3')
  })

  it('once the earliest reminder is done the guard no longer applies, and the next open reminder is claimed as before', () => {
    const done = [c('w3', 'TIMESHEET_SUBMIT', '2026-09-21', true), c('w4', 'TIMESHEET_SUBMIT', '2026-09-28')]
    expect(pickCycle(done, 'TIMESHEET_SUBMIT', d('2026-09-12'))?.id).toBe('w4')
  })

  it('with only one reminder of its kind there is no rhythm to read, and the earliest open one is claimed as before', () => {
    expect(pickCycle([c('w3', 'TIMESHEET_SUBMIT', '2026-09-21')], 'TIMESHEET_SUBMIT', d('2026-09-05'))?.id).toBe('w3')
  })
})

describe('where the line\'s whole series is known, the week\'s own date is read, not estimated', () => {
  // A semimonthly invoice line under way since early October 2026, awarded
  // on 22 October: the 15th was never written, and the 31st, a Saturday,
  // moved to Monday 2 November. The series is every date the line has.
  const series = ['2026-10-15', '2026-11-02', '2026-11-16', '2026-11-30', '2026-12-15', '2026-12-31', '2027-01-15'].map(d)
  const written = ['2026-11-02', '2026-11-16', '2026-11-30', '2026-12-15', '2026-12-31', '2027-01-15']
    .map((due) => c(due, 'INVOICE_GENERATE', due))

  it('a placement awarded after its first invoice date was moved off a weekend closes that date when its first week is billed', () => {
    // The week ending Saturday 17 October: its own date is the first on or
    // after Friday the 16th, which is 2 November, and the award wrote it.
    expect(pickCycle(written, 'INVOICE_GENERATE', d('2026-10-17'), series)?.id).toBe('2026-11-02')
    expect(pickCycle(written, 'INVOICE_GENERATE', d('2026-10-24'), series)?.id).toBe('2026-11-02')
  })

  it('without the series the estimate would have refused it, which is why the series is read where it is known', () => {
    // 2 November less the usual fifteen days is the 18th, which the week
    // ending the 17th would have claimed — so it claimed nothing.
    expect(pickCycle(written, 'INVOICE_GENERATE', d('2026-10-17'))).toBeNull()
  })

  it('a week whose own invoice date fell before the award, and so was never written, still closes nothing', () => {
    // The week ending 10 October bills on the 15th, a week before the award.
    expect(pickCycle(written, 'INVOICE_GENERATE', d('2026-10-10'), series)).toBeNull()
    expect(pickCycle(written, 'INVOICE_GENERATE', d('2026-10-03'), series)).toBeNull()
  })

  it('a single written date is refused to a week whose own date the award never wrote, once the series says so', () => {
    expect(pickCycle([written[0]], 'INVOICE_GENERATE', d('2026-10-10'), series)).toBeNull()
    expect(pickCycle([written[0]], 'INVOICE_GENERATE', d('2026-10-17'), series)?.id).toBe('2026-11-02')
  })

  it('where the earliest written date is not in the series — the weekend rule changed since the award — the estimate decides as before', () => {
    // Regenerated today the 31st moves back to Friday 30 October, so the
    // written 2 November is not in it: the series is not the one written.
    const moved = ['2026-10-15', '2026-10-30', '2026-11-16', '2026-11-30', '2026-12-15', '2026-12-31', '2027-01-15'].map(d)
    for (const pe of ['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31']) {
      expect(pickCycle(written, 'INVOICE_GENERATE', d(pe), moved)?.id ?? null, pe)
        .toBe(pickCycle(written, 'INVOICE_GENERATE', d(pe))?.id ?? null)
    }
  })

  it('a date that is not the earliest written is chosen exactly as before, series or none', () => {
    const fromAward = [c('w3', 'TIMESHEET_SUBMIT', '2026-09-21'), c('w4', 'TIMESHEET_SUBMIT', '2026-09-28', false)]
    const weeks = ['2026-09-08', '2026-09-14', '2026-09-21', '2026-09-28'].map(d)
    expect(pickCycle(fromAward, 'TIMESHEET_SUBMIT', d('2026-09-26'), weeks)?.id).toBe('w4')
    expect(pickCycle(fromAward, 'TIMESHEET_SUBMIT', d('2026-09-19'), weeks)?.id).toBe('w3')
    expect(pickCycle(fromAward, 'TIMESHEET_SUBMIT', d('2026-09-12'), weeks)).toBeNull()
  })
})

describe('every event that ends a wait marks its cycle', () => {
  const cases: [string, string, string][] = [
    ['src/app/api/timesheets/[id]/submit/route.ts', 'TIMESHEET_SUBMIT', 'hours are sent'],
    ['src/app/api/timesheets/[id]/approve/route.ts', 'TIMESHEET_APPROVE', 'both parties have signed the hours'],
    ['src/app/api/invoices/generate/route.ts', 'INVOICE_GENERATE', 'the invoice is raised'],
    ['src/app/api/ap/bills/route.ts', 'VENDOR_BILL_GENERATE', 'a vendor bill is recorded'],
  ]
  for (const [file, kind, when] of cases) {
    it(`when ${when}, the ${kind.replace(/_/g, ' ').toLowerCase()} cycle is done`, () => {
      const src = read(file)
      expect(src).toContain("from '@/lib/cycle-complete'")
      expect(src).toContain(`kind: '${kind}'`)
    })
  }

  it('hours are approved only once both signatures are in, and so is the cycle', () => {
    const src = read('src/app/api/timesheets/[id]/approve/route.ts')
    expect(src).toMatch(/if \(g\.mayInvoice && g\.mayPay\) \{\s*await completeCycle/)
  })

  it('a pay run already marked its cycles; nothing here doubles it', () => {
    expect(read('src/app/api/payroll/run/route.ts')).not.toContain('cycle-complete')
  })
})

/**
 * A cycle that is never written cannot be completed.
 *
 * Paying an invoice and settling a vendor bill used to close an
 * INVOICE_DUE and a VENDOR_BILL_DUE cycle. Neither kind is generated
 * any more — when a document falls due is the document's own fact, not
 * a day the calendar picked months before it existed — so the calls
 * were looking for a row nothing writes and quietly finding none.
 */
describe('nothing completes a cycle that is no longer generated', () => {
  it('paying an invoice no longer closes a cycle nothing ever wrote', () => {
    expect(read('src/app/api/invoices/[id]/payments/route.ts')).not.toContain("kind: 'INVOICE_DUE'")
  })

  it('settling a vendor bill no longer closes a cycle nothing ever wrote', () => {
    for (const f of ['src/app/api/ap/bills/route.ts', 'src/app/api/ap/payment-runs/route.ts']) {
      expect(read(f), f).not.toContain("kind: 'VENDOR_BILL_DUE'")
    }
  })

  it('raising the invoice and raising the vendor bill still close theirs', () => {
    expect(read('src/app/api/invoices/generate/route.ts')).toContain("kind: 'INVOICE_GENERATE'")
    expect(read('src/app/api/ap/bills/route.ts')).toContain("kind: 'VENDOR_BILL_GENERATE'")
  })
})
