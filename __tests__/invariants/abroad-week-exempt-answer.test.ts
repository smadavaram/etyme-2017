/**
 * Walk, 2026-11-17 (decisions/92, answer 4): a W-2 week of 46 hours worked
 * in India, where Etyme has no overtime rule, was held on Payroll. Pressing
 * "Not exempt" on the held row released it, and the run paid all 86 hours
 * of the period at the usual rate: $8,256, the 46 abroad hours at $96 with
 * no premium and no word. A week over the line is never paid at the usual
 * rate by silence. The exempt answer is a US answer; only a rule recorded
 * for the country, or the work location moved, releases the week.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  payLineFor, heldForExemption, heldSays, judgedLine, payLineSays, weeklyWorked, type PayLineInput,
} from '@/lib/money/pay-line'
import { buildExport, type SheetToPay } from '@/lib/payroll-export'

const base: PayLineInput = {
  buyAfterHours: null, sellAfterHours: null, personName: 'Rhea Castellan', employerName: 'Northwind Staffing',
  contractType: 'W2', weAreTheEmployer: true, exemptStatus: null,
  where: { wageRule: null, payCurrency: 'USD', entityCountry: null, siteCountry: 'IN' },
}
// Monday 8 June 2026: 10 + 9 + 9 + 9 + 9 = 46 hours.
const days46 = { '2026-06-08': 10, '2026-06-09': 9, '2026-06-10': 9, '2026-06-11': 9, '2026-06-12': 9 }
const answered = (exemptStatus: string | null, wageRule: string | null = 'US_FLSA'): PayLineInput =>
  ({ ...base, exemptStatus, where: { ...base.where, wageRule } })
const heldOn = (i: PayLineInput) =>
  heldForExemption({ line: payLineFor(i), days: days46, accepted: null, cutOvertime: 'OVERTIME_FIRST' as never })

describe('an exempt answer never releases a week worked in a country with no overtime rule', () => {
  it('recording not exempt does not release a week worked in a country with no rule', () => {
    const w = heldOn(answered('NONEXEMPT'))
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ weekOf: '2026-06-07', workedHours: 46, workedIn: 'India' })
  })

  it('recording exempt does not release a week worked in a country with no rule', () => {
    expect(heldOn(answered('EXEMPT'))).toHaveLength(1)
    expect(heldOn(answered('EXEMPT', null))[0].workedIn).toBe('India')
  })

  it('recording not exempt under another country\'s wage rule does not release it either', () => {
    expect(heldOn(answered('NONEXEMPT', 'UK'))).toHaveLength(1)
  })

  it('a week worked in the US with not exempt recorded is not held, as before', () => {
    expect(heldOn({ ...answered('NONEXEMPT'), where: { ...base.where, wageRule: 'US_FLSA', siteCountry: 'US' } })).toEqual([])
  })

  it('somebody else\'s employee working abroad is never held on our payroll', () => {
    expect(heldOn({ ...answered('NONEXEMPT'), weAreTheEmployer: false })).toEqual([])
    expect(payLineFor({ ...answered('NONEXEMPT'), contractType: 'C2C' }).heldAbroad).toBeUndefined()
  })

  it('a week held abroad is judged on forty whatever the exempt answer, so the pay file leaves it off', () => {
    expect(judgedLine(payLineFor(answered('NONEXEMPT')))).toBe(40)
    expect(judgedLine(payLineFor(answered('EXEMPT')))).toBe(40)
  })

  it('the held row says recording the exempt answer does not release the week, and what does', () => {
    const says = heldSays('Rhea Castellan', heldOn(answered('NONEXEMPT')))!
    expect(says).toContain('46 hours worked in India')
    expect(says).toContain('Recording whether Rhea Castellan is exempt does not release it.')
    expect(says).toContain('when a rule is recorded or the work location is moved')
    expect(says).not.toContain('records it on this row')
  })

  it('the line\'s own sentence never says a week held abroad is paid at straight time', () => {
    for (const i of [answered('NONEXEMPT'), answered('EXEMPT'), answered(null, null)]) {
      const says = payLineSays(payLineFor(i), { personName: 'Rhea Castellan' }, weeklyWorked(days46))!
      expect(says).toContain('no overtime rule recorded for India')
      expect(says).toContain('is held, whether or not Rhea Castellan is exempt')
      expect(says).not.toContain('straight time')
    }
  })
})

describe('the pay file and the Payroll row agree that the answer does not release an abroad week', () => {
  const sheet = (over: Partial<SheetToPay> = {}): SheetToPay => ({
    personName: 'Rhea Castellan', payrollId: 'E1', contractType: 'W2', cutOvertime: 'ABOVE_THE_LINE',
    weAreTheEmployer: true, periodStart: new Date('2026-06-07T00:00:00Z'), periodEnd: new Date('2026-06-13T00:00:00Z'),
    weeks: [{ weekOf: '2026-06-07', regularHours: 40, leaveHours: 0, overHours: 6, client: { treatment: 'BILLABLE', appliedBps: null }, payRateCents: 9_600, rates: null, worked: null, straightTime: null } as never],
    submittedHours: 46, acceptedHours: null, employerAcceptedAt: new Date('2026-06-13T00:00:00Z'), payRateCents: 9_600,
    payModel: 'FIXED_HOURLY', paidOnSalaryBasis: false, rule: 'US_FLSA',
    assertion: { status: 'NONEXEMPT', basis: null, assertedByCompanyId: 'c', assertedByCompanyName: 'Northwind Staffing', assertedByName: null, assertedAt: new Date('2026-06-14T00:00:00Z'), note: null, reviewBy: null } as never,
    currency: 'USD', orderNumber: null, employerName: 'Northwind Staffing', clientName: 'Corvane Packaging',
    ...over,
  })

  it('a week worked abroad is left off the pay file with not exempt recorded, and the file says what releases it', () => {
    const out = buildExport('GENERIC' as never, [sheet({ heldAbroad: { says: 'Held: 46 hours worked in India.', country: 'India' } })])
    expect(out.lines).toHaveLength(0)
    expect(out.skipped).toHaveLength(1)
    expect(out.skipped[0].why).toBe('Held: 46 hours worked in India.')
    expect(out.skipped[0].action).toBe('Paid once Etyme records an overtime rule for India, or the work location is moved.')
  })

  it('the Payroll row offers "Not exempt" and "Exempt…" only where the answer releases a held week', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/payroll/page.tsx'), 'utf8')
    const route = readFileSync(join(process.cwd(), 'src/app/api/payroll/route.ts'), 'utf8')
    expect(page).toContain('{mayRecordExempt && row.exemptReleases && <ExemptAnswer')
    expect(route).toContain('exemptReleases: heldInPeriod.some((w) => !w.workedIn)')
  })
})
