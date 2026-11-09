import { describe, it, expect } from 'vitest'
import { generateCycles, generatePayCycles, localKey } from '@/lib/cycle-generator'
import { getTemplatePack } from '@/lib/template-packs'
import { extensionPlan, type PlannedCycle } from '@/lib/contract-cycles'
import { pickCycle, pickByPeriod, type CycleRow } from '@/lib/cycle-complete'
import { DEFAULT_CYCLE_SHIFT, directionFor, shiftToWorkingDay } from '@/lib/cycle-shift'

/**
 * The founder, 2026-11-09: the last regular period runs through the
 * contract's end date ("The cycle engine, honestly", item 2). A contract
 * ending on a Wednesday has its hours-due, invoice and pay dates for those
 * last days, on the period's usual date; an extension moves that period's
 * last day out, never leaving a short cycle behind. Every cycle carries
 * the days it covers (`Cycle.periodStart`, `periodEnd`).
 */

const u = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const day = (d: Date) => d.toISOString().slice(0, 10)
const US_IT = getTemplatePack('US_IT')!.cycleDefinitions
const of = (cs: ReturnType<typeof generateCycles>, kind: string) => cs.filter((c) => c.kind === kind)

// Monday January 5 to Wednesday February 25, 2026.
const START = u(2026, 1, 5)
const WED = u(2026, 2, 25)

describe('the last regular period runs through the contract’s end date', () => {
  it('a contract ending on a Wednesday files the hours of its last three days on the week’s usual Monday', () => {
    const hours = of(generateCycles(START, WED, US_IT), 'TIMESHEET_SUBMIT')
    const last = hours[hours.length - 1]
    expect(localKey(last.dueOn)).toBe('2026-03-02')
    expect([day(last.periodStart), day(last.periodEnd)]).toEqual(['2026-02-22', '2026-02-25'])
  })

  it('a contract ending on a Wednesday bills its last days on the half-month’s usual date', () => {
    const bills = of(generateCycles(START, WED, US_IT), 'INVOICE_GENERATE')
    const last = bills[bills.length - 1]
    // February 28, 2026 is a Saturday: it moves off it the way the company's
    // bill setting says (read from the policy, never assumed here).
    const expected = localKey(shiftToWorkingDay(new Date(2026, 1, 28), [], directionFor('BILL', DEFAULT_CYCLE_SHIFT)))
    expect(localKey(last.dueOn)).toBe(expected)
    expect([day(last.periodStart), day(last.periodEnd)]).toEqual(['2026-02-16', '2026-02-25'])
  })

  it('a contract ending on a Wednesday pays its last days on the fortnight’s usual Friday', () => {
    const pay = of(generateCycles(START, WED, US_IT), 'SALARY_PAY')
    const last = pay[pay.length - 1]
    expect(day(last.periodEnd)).toBe('2026-02-25')
    expect(localKey(last.dueOn) > '2026-02-25').toBe(true)
  })

  it('a contract ending on a Saturday has no period past its end, as before', () => {
    const hours = of(generateCycles(START, u(2026, 2, 28), US_IT), 'TIMESHEET_SUBMIT')
    expect(day(hours[hours.length - 1].periodEnd)).toBe('2026-02-28')
    expect(localKey(hours[hours.length - 1].dueOn)).toBe('2026-03-02')
  })

  it('every period starts the day after the one before and none starts before the contract', () => {
    for (const kind of ['TIMESHEET_SUBMIT', 'INVOICE_GENERATE', 'SALARY_PAY', 'VENDOR_BILL_GENERATE']) {
      const cs = of(generateCycles(START, WED, US_IT), kind).sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())
      expect(day(cs[0].periodStart), kind).toBe('2026-01-05')
      for (let i = 1; i < cs.length; i++) {
        expect(cs[i].periodStart.getTime(), kind).toBe(cs[i - 1].periodEnd.getTime() + 86_400_000)
      }
      expect(day(cs[cs.length - 1].periodEnd), kind).toBe('2026-02-25')
    }
  })

  it('a company’s own monthly payroll pays the last days of a contract ending mid-month on the month’s pay day', () => {
    const pay = generatePayCycles(u(2026, 1, 1), u(2026, 2, 18), { payPeriod: 'MONTHLY', payCalcOffsetDays: 4, payDayOffsetDays: 6, payDaysOfMonth: [28], payCalcDaysBefore: 3 })
      .filter((c) => c.kind === 'SALARY_PAY')
    expect(pay.map((c) => localKey(c.dueOn))).toEqual(['2026-01-30', '2026-02-27'])
    expect([day(pay[1].periodStart), day(pay[1].periodEnd)]).toEqual(['2026-02-01', '2026-02-18'])
  })

  it('a company’s every-other-week payroll pays the last days on the fortnight’s usual Friday', () => {
    const pay = generatePayCycles(u(2026, 1, 4), u(2026, 1, 21), { payPeriod: 'BIWEEKLY', payCalcOffsetDays: 4, payDayOffsetDays: 6, payDaysOfMonth: [28], payCalcDaysBefore: 3 })
      .filter((c) => c.kind === 'SALARY_PAY')
    expect(pay.map((c) => [localKey(c.dueOn), day(c.periodStart), day(c.periodEnd)])).toEqual([
      ['2026-01-23', '2026-01-04', '2026-01-17'],
      ['2026-02-06', '2026-01-18', '2026-01-21'],
    ])
  })
})

describe('an extension moves the last period’s end, never leaving a short cycle behind', () => {
  const sell = 'sell-1'
  const rows = (end: Date) =>
    of(generateCycles(START, end, US_IT), 'TIMESHEET_SUBMIT').map((c) => ({ sellContractId: sell, kind: c.kind, dueOn: c.dueOn, periodStart: c.periodStart, periodEnd: c.periodEnd }) as PlannedCycle)

  it('the week that held the old Wednesday end grows to its Saturday, keeps its date, and is not written again', () => {
    const before = rows(WED)
    const stored = before.map((c, i) => ({ id: `c${i}`, sellContractId: sell, buyContractId: null, kind: c.kind, periodStart: c.periodStart, periodEnd: c.periodEnd }))
    const full = rows(u(2026, 3, 31))
    const added = full.filter((c) => c.periodStart.getTime() > WED.getTime() || day(c.periodStart) === '2026-02-22')
    const plan = extensionPlan(stored, full, added)
    const last = stored[stored.length - 1]
    expect(plan.widen).toEqual([{ id: last.id, periodEnd: u(2026, 2, 28) }])
    expect(plan.write.some((c) => day(c.periodStart) === '2026-02-22')).toBe(false)
    expect(plan.write.map((c) => day(c.periodStart))[0]).toBe('2026-03-01')
  })

  it('a cycle written before the columns is left as it was, and its added periods are written as before', () => {
    const stored = [{ id: 'old', sellContractId: sell, buyContractId: null, kind: 'TIMESHEET_SUBMIT', periodStart: null, periodEnd: null }]
    const full = rows(u(2026, 3, 31))
    const plan = extensionPlan(stored, full, full.slice(-2))
    expect(plan.widen).toEqual([])
    expect(plan.write).toHaveLength(2)
  })
})

describe('which cycle a period’s event closes', () => {
  const at = (id: string, due: string, start: string, end: string, done = false): CycleRow =>
    ({ id, kind: 'TIMESHEET_SUBMIT', dueOn: new Date(`${due}T00:00:00Z`), completedAt: done ? new Date() : null, periodStart: new Date(`${start}T00:00:00Z`), periodEnd: new Date(`${end}T00:00:00Z`) })

  it('a week closes the cycle whose stored period holds its last day', () => {
    const rows = [at('a', '2026-02-16', '2026-02-08', '2026-02-14'), at('b', '2026-02-23', '2026-02-15', '2026-02-21')]
    expect(pickByPeriod(rows, 'TIMESHEET_SUBMIT', new Date('2026-02-21T00:00:00Z'))?.id).toBe('b')
  })

  it('the last week, whose Saturday falls after a Wednesday end, closes the cut period', () => {
    const rows = [at('b', '2026-02-23', '2026-02-15', '2026-02-21'), at('c', '2026-03-02', '2026-02-22', '2026-02-25')]
    expect(pickByPeriod(rows, 'TIMESHEET_SUBMIT', new Date('2026-02-28T00:00:00Z'))?.id).toBe('c')
  })

  it('a week before the first reminder written closes nothing', () => {
    const rows = [at('b', '2026-02-23', '2026-02-15', '2026-02-21')]
    expect(pickByPeriod(rows, 'TIMESHEET_SUBMIT', new Date('2026-02-07T00:00:00Z'))).toBeNull()
  })

  it('a cycle written before the columns is still placed from its series', () => {
    const rows: CycleRow[] = [{ id: 'old', kind: 'TIMESHEET_SUBMIT', dueOn: new Date('2026-02-23T00:00:00Z'), completedAt: null, periodStart: null, periodEnd: null }]
    expect(pickByPeriod(rows, 'TIMESHEET_SUBMIT', new Date('2026-02-21T00:00:00Z'))).toBeUndefined()
    expect(pickCycle(rows, 'TIMESHEET_SUBMIT', new Date('2026-02-21T00:00:00Z'))?.id).toBe('old')
  })
})
