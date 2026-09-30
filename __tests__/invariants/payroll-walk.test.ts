import { describe, it, expect } from 'vitest'

import { onPayrollFor, payrollClientFor, periodPayStatus } from '@/lib/money/payroll-rows'
import { depositPayDays, depositDeadline } from '@/lib/payroll-export'
import { generateCycles, localKey } from '@/lib/cycle-generator'
import { periodFor, type Terms } from '@/lib/periods'

/**
 * Four things a browser walk of the seeded world found on the payroll
 * screens, 2026-09-30, each as the rule it broke.
 *
 * 1. Karthik Menon worked June to August for Teleworld and was paid for
 *    every month, and the payroll screen said "W-2 employees 0" for all
 *    three, because it read active contracts only and his had ended.
 * 2. The deposit deadlines listed a date for every week hours were
 *    posted — Mondays for Teleworld, Saturdays for Brightmoor — for
 *    workers paid once a month. A deposit follows the day wages are
 *    paid, and that is a pay day on the line, not a posting.
 * 3. A corp-to-corp worker's "Client" was the employer's own name,
 *    because the hours are filed on the supplier's contract and that
 *    contract's client is the employer.
 * 4. A month whose pay day the run had already settled still read
 *    "Pending", because the status was the contract's earliest open
 *    date rather than the month's own.
 */

const D = (s: string) => new Date(`${s}T00:00:00Z`)
const MONTHLY: Terms = { frequency: 'MONTHLY', anchor: 'CALENDAR', straddle: 'SPLIT', startedOn: D('2026-06-01') }
const month = (s: string) => periodFor(D(s), MONTHLY)

describe('a placement that has ended is still on the payroll for the months it worked', () => {
  const karthik = { state: 'ENDED', startDate: D('2026-06-01'), endDate: D('2026-08-31') }

  it('a worker whose placement has ended is still on the payroll for every month they worked', () => {
    for (const m of ['2026-06-01', '2026-07-01', '2026-08-01']) {
      expect(onPayrollFor(karthik, { period: month(m), asked: true, hours: 0, settled: false })).toBe(true)
    }
  })

  it('an ended placement is not on the payroll for a month after its last day', () => {
    expect(onPayrollFor(karthik, { period: month('2026-09-01'), asked: true, hours: 0, settled: false })).toBe(false)
  })

  it('an ended placement with hours still in a later month is on the payroll for that month, because the hours are owed', () => {
    expect(onPayrollFor(karthik, { period: month('2026-09-01'), asked: true, hours: 8, settled: false })).toBe(true)
  })

  it('an ended placement whose last month is paid drops off the view of every period, and stays on the month itself', () => {
    const last = month('2026-08-01')
    expect(onPayrollFor(karthik, { period: last, asked: false, hours: 144, settled: true })).toBe(false)
    expect(onPayrollFor(karthik, { period: last, asked: true, hours: 144, settled: true })).toBe(true)
  })

  it('an ended placement whose last month is not yet paid stays on the view of every period', () => {
    expect(onPayrollFor(karthik, { period: month('2026-08-01'), asked: false, hours: 144, settled: false })).toBe(true)
  })

  it('a cancelled or draft placement is never on the payroll, because nobody worked it', () => {
    for (const state of ['CANCELLED', 'DRAFT', 'PENDING_VERIFICATION']) {
      expect(onPayrollFor({ ...karthik, state }, { period: month('2026-07-01'), asked: true, hours: 40, settled: false })).toBe(false)
    }
  })

  it('a placement in progress is on the payroll whether or not it has hours, as it always was', () => {
    expect(onPayrollFor({ ...karthik, state: 'IN_PROGRESS', endDate: null }, { period: month('2026-09-01'), asked: true, hours: 0, settled: false })).toBe(true)
  })
})

describe('the month’s own pay day decides its status', () => {
  const pay = [
    { id: 'p1', kind: 'SALARY_PAY', dueOn: D('2026-07-09'), completedAt: D('2026-07-10') },
    { id: 'p2', kind: 'SALARY_PAY', dueOn: D('2026-08-07'), completedAt: D('2026-08-10') },
    { id: 'p3', kind: 'SALARY_PAY', dueOn: D('2026-09-09'), completedAt: null },
    { id: 'c1', kind: 'SALARY_CALCULATE', dueOn: D('2026-07-03'), completedAt: null },
    { id: 'c2', kind: 'SALARY_CALCULATE', dueOn: D('2026-08-04'), completedAt: null },
    { id: 'c3', kind: 'SALARY_CALCULATE', dueOn: D('2026-09-04'), completedAt: D('2026-09-04') },
  ]
  const of = (d: Date) => periodFor(d, MONTHLY)

  it('a month whose pay day the run has already settled reads as processed, even where an earlier date was never marked', () => {
    expect(periodPayStatus(pay, month('2026-07-01'), of, D('2026-06-01'))).toBe('PROCESSED')
  })

  it('a month calculated and not yet paid reads as calculated', () => {
    expect(periodPayStatus(pay, month('2026-08-01'), of, D('2026-06-01'))).toBe('CALCULATED')
  })

  it('a month with no pay day of its own on the line says nothing, so the screen keeps its older reading', () => {
    expect(periodPayStatus(pay, month('2026-12-01'), of, D('2026-06-01'))).toBeNull()
  })
})

describe('the client on a pay row is the client the work is for', () => {
  const brightmoor = { id: 'bm', name: 'Brightmoor Staffing' }
  const nordway = { id: 'nw', name: 'Nordway Retail' }
  const northbend = { id: 'nb', name: 'Northbend Athletic' }

  it('a corp-to-corp worker’s client is the client the employer bills, never the employer itself', () => {
    const c = payrollClientFor({
      employerId: 'bm',
      own: [{ clientCompany: nordway, endClientCompany: null }],
      supplier: { clientCompany: brightmoor, endClientCompany: nordway },
    })
    expect(c?.name).toBe('Nordway Retail')
  })

  it('the client shown is the end client where the work is done, where the employer’s own contract names one', () => {
    const c = payrollClientFor({
      employerId: 'x',
      own: [{ clientCompany: nordway, endClientCompany: northbend }],
      supplier: null,
    })
    expect(c?.name).toBe('Northbend Athletic')
  })

  it('where the employer has no sell line, the supplier’s end client is shown, and never the employer’s own name', () => {
    expect(payrollClientFor({ employerId: 'bm', own: [], supplier: { clientCompany: brightmoor, endClientCompany: nordway } })?.name)
      .toBe('Nordway Retail')
    expect(payrollClientFor({ employerId: 'bm', own: [], supplier: { clientCompany: brightmoor, endClientCompany: null } }))
      .toBeNull()
  })

  it('a W2 on the employer’s own sell line reads that line’s client, as before', () => {
    expect(payrollClientFor({ employerId: 'bm', own: [{ clientCompany: northbend, endClientCompany: null }], supplier: null })?.name)
      .toBe('Northbend Athletic')
  })
})

describe('deposit deadlines follow the pay days on the lines', () => {
  const today = D('2026-09-30')
  const karthik = [
    { dueOn: D('2026-07-09'), completedAt: new Date('2026-07-10T17:00:00Z'), contractType: 'W2' },
    { dueOn: D('2026-08-07'), completedAt: new Date('2026-08-10T17:00:00Z'), contractType: 'W2' },
    { dueOn: D('2026-09-09'), completedAt: new Date('2026-09-10T17:00:00Z'), contractType: 'W2' },
  ]

  it('a monthly-paid worker has one deposit date a month, however many weeks they filed', () => {
    const days = depositPayDays(karthik, 2026, today)
    expect(days.map((d) => d.payDay.toISOString().slice(0, 10))).toEqual(['2026-07-10', '2026-08-10', '2026-09-10'])
  })

  it('a pay day the run has settled is dated the day it was paid, the day the worker’s own page says', () => {
    const days = depositPayDays(karthik, 2026, today)
    expect(days.every((d) => d.paid)).toBe(true)
    expect(depositDeadline(days[0].payDay, 'MONTHLY').dueOn.toISOString().slice(0, 10)).toBe('2026-08-17')
  })

  it('a pay day not yet settled reads as due, never as paid', () => {
    const days = depositPayDays([{ dueOn: D('2026-10-09'), completedAt: null, contractType: 'W2' }], 2026, today)
    expect(days).toHaveLength(1)
    expect(days[0].paid).toBe(false)
    expect(days[0].payDay.toISOString().slice(0, 10)).toBe('2026-10-09')
  })

  it('a pay day more than a month away is not listed yet', () => {
    expect(depositPayDays([{ dueOn: D('2026-12-09'), completedAt: null, contractType: 'W2' }], 2026, today)).toHaveLength(0)
  })

  it('a corp-to-corp or 1099 payment sets no employment-tax deposit date, because it is not wages', () => {
    const days = depositPayDays(
      [
        { dueOn: D('2026-08-07'), completedAt: D('2026-08-07'), contractType: 'C2C' },
        { dueOn: D('2026-08-14'), completedAt: D('2026-08-14'), contractType: 'IND_1099' },
      ],
      2026,
      today
    )
    expect(days).toHaveLength(0)
  })

  it('a pay day from another year sets no deposit in this one', () => {
    expect(depositPayDays([{ dueOn: D('2025-12-31'), completedAt: D('2025-12-31'), contractType: 'W2' }], 2026, today)).toHaveLength(0)
  })

  it('two workers paid on one day are one deposit date', () => {
    const days = depositPayDays(
      [
        { dueOn: D('2026-08-07'), completedAt: D('2026-08-07'), contractType: 'W2' },
        { dueOn: D('2026-08-07'), completedAt: D('2026-08-07'), contractType: 'C2H_W2' },
      ],
      2026,
      today
    )
    expect(days).toHaveLength(1)
  })

  it('a pay day that falls on a Saturday is paid on the Friday before, so its deposit follows the Friday', () => {
    // 4 July 2026 is a Saturday. The generator moves pay backward.
    const cycles = generateCycles(new Date(2026, 6, 1), new Date(2026, 6, 31), [{ kind: 'SALARY_PAY', frequency: 'MONTHLY', dayOfMonth: 4 }], [], new Map())
    expect(localKey(cycles[0].dueOn)).toBe('2026-07-03')
    const days = depositPayDays([{ dueOn: D(localKey(cycles[0].dueOn)), completedAt: null, contractType: 'W2' }], 2026, D('2026-07-01'))
    expect(days[0].payDay.toISOString().slice(0, 10)).toBe('2026-07-03')
    expect(days[0].payDay.getUTCDay()).toBe(5)
  })
})
