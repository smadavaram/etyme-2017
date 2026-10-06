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
  const weekly = [
    c('w1', 'TIMESHEET_SUBMIT', '2026-09-04'),
    c('w2', 'TIMESHEET_SUBMIT', '2026-09-11'),
    c('w3', 'TIMESHEET_SUBMIT', '2026-09-18'),
    c('a2', 'TIMESHEET_APPROVE', '2026-09-14'),
  ]

  it('a week ending Friday completes the hours cycle due that Friday, not the week before or after', () => {
    expect(pickCycle(weekly, 'TIMESHEET_SUBMIT', d('2026-09-11'))?.id).toBe('w2')
  })

  it('a due date shifted to Monday by a weekend still belongs to the week that ended Friday', () => {
    const shifted = [c('w1', 'TIMESHEET_SUBMIT', '2026-09-07'), c('w2', 'TIMESHEET_SUBMIT', '2026-09-14')]
    expect(pickCycle(shifted, 'TIMESHEET_SUBMIT', d('2026-09-11'))?.id).toBe('w2')
  })

  it('a week nobody submitted stays owed — a later week does not quietly complete it', () => {
    expect(pickCycle(weekly, 'TIMESHEET_SUBMIT', d('2026-09-18'))?.id).toBe('w3')
    expect(weekly.find((x) => x.id === 'w2')!.completedAt).toBeNull()
  })

  it('only the kind that happened moves: submitting hours does not approve them', () => {
    expect(pickCycle(weekly, 'TIMESHEET_APPROVE', d('2026-09-11'))?.id).toBe('a2')
    expect(pickCycle(weekly, 'INVOICE_GENERATE', d('2026-09-11'))).toBeNull()
  })

  it('a cycle already done is not done twice', () => {
    const done = [c('w2', 'TIMESHEET_SUBMIT', '2026-09-11', true), c('w3', 'TIMESHEET_SUBMIT', '2026-09-18')]
    expect(pickCycle(done, 'TIMESHEET_SUBMIT', d('2026-09-11'))?.id).toBe('w3')
  })

  it('a contract with no cycles of that kind completes nothing, and nothing fails', () => {
    expect(pickCycle([], 'TIMESHEET_SUBMIT', d('2026-09-11'))).toBeNull()
  })
})

describe('a week from before the first reminder', () => {
  // Awarded for work already under way: no reminder before the award, so
  // the first one written is for the week after it.
  const fromAward = [
    c('w3', 'TIMESHEET_SUBMIT', '2026-09-18'),
    c('w4', 'TIMESHEET_SUBMIT', '2026-09-25'),
  ]

  it('the earliest reminder of its kind is not claimed by a period that ended a whole cycle or more before it', () => {
    expect(pickCycle(fromAward, 'TIMESHEET_SUBMIT', d('2026-09-11'))).toBeNull()
    expect(pickCycle(fromAward, 'TIMESHEET_SUBMIT', d('2026-09-04'))).toBeNull()
  })

  it('a Sunday-to-Saturday week ending the day after a Friday reminder the floor dropped does not claim the next Friday’s', () => {
    const fridays = [c('f1', 'TIMESHEET_SUBMIT', '2026-10-09'), c('f2', 'TIMESHEET_SUBMIT', '2026-10-16')]
    expect(pickCycle(fridays, 'TIMESHEET_SUBMIT', d('2026-10-03'))).toBeNull()
  })

  it('the week the earliest reminder is for still claims it', () => {
    expect(pickCycle(fromAward, 'TIMESHEET_SUBMIT', d('2026-09-18'))?.id).toBe('w3')
  })

  it('a reminder shifted past a weekend still belongs to the week that ended just before it', () => {
    const shifted = [c('w3', 'TIMESHEET_SUBMIT', '2026-09-14'), c('w4', 'TIMESHEET_SUBMIT', '2026-09-21')]
    expect(pickCycle(shifted, 'TIMESHEET_SUBMIT', d('2026-09-11'))?.id).toBe('w3')
  })

  it('once the earliest reminder is done the guard no longer applies, and the next open reminder is claimed as before', () => {
    const done = [c('w3', 'TIMESHEET_SUBMIT', '2026-09-18', true), c('w4', 'TIMESHEET_SUBMIT', '2026-09-25')]
    expect(pickCycle(done, 'TIMESHEET_SUBMIT', d('2026-09-11'))?.id).toBe('w4')
  })

  it('with only one reminder of its kind there is no rhythm to read, and the earliest open one is claimed as before', () => {
    expect(pickCycle([c('w3', 'TIMESHEET_SUBMIT', '2026-09-18')], 'TIMESHEET_SUBMIT', d('2026-09-04'))?.id).toBe('w3')
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
