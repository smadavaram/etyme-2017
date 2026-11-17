import { describe, it, expect } from 'vitest'
import { localOvertimeRuleFor } from '@/lib/money/local-overtime-rule'
import { payLineFor, heldForExemption, heldSays, judgedLine, type PayLineInput } from '@/lib/money/pay-line'
import { heldWeeksFor } from '@/lib/consultant-portfolio/held-weeks'

const base: PayLineInput = {
  buyAfterHours: null, sellAfterHours: null, personName: 'Omar Haddock', employerName: 'Northwind Staffing',
  contractType: 'W2', weAreTheEmployer: true, exemptStatus: null,
  where: { wageRule: null, payCurrency: 'USD', entityCountry: null, siteCountry: null },
}
const where = (w: Partial<PayLineInput['where']>) => ({ ...base, where: { ...base.where, ...w } })
// Monday 8 June 2026: 10 + 9 + 9 + 9 + 9 = 46 hours.
const days46 = { '2026-06-08': 10, '2026-06-09': 9, '2026-06-10': 9, '2026-06-11': 9, '2026-06-12': 9 }
const held = (i: PayLineInput) =>
  heldForExemption({ line: payLineFor(i), days: days46, accepted: null, cutOvertime: 'OVERTIME_FIRST' as never })

describe('which overtime rule a week falls under, by the country where the work was done', () => {
  it('the US has a known rule and every other country reads as not known yet', () => {
    expect(localOvertimeRuleFor('US')).toEqual({ known: true, rule: 'US_FLSA' })
    expect(localOvertimeRuleFor('IN')).toEqual({ known: false })
    expect(localOvertimeRuleFor('GB')).toEqual({ known: false })
  })

  it('a week of 46 hours worked in a country with no configured overtime rule is held, and the sentence names the country', () => {
    const i = where({ siteCountry: 'IN' })
    const w = held(i)
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ workedHours: 46, overHours: 6, workedIn: 'India' })
    const says = heldSays('Omar Haddock', w)!
    expect(says).toContain('46 hours worked in India')
    expect(says).toContain('no overtime rule recorded for India')
    expect(says).not.toContain('exempt from overtime')
  })

  it('a week worked at the home location is not held, even on a business-visa trip', () => {
    // On a trip: paid by the home employer in another currency, the entity
    // abroad, and the work location still unset or in the US.
    expect(held(where({ siteCountry: null, payCurrency: 'INR', entityCountry: 'IN' }))).toEqual([])
    expect(held(where({ siteCountry: 'US', payCurrency: 'INR' }))).toEqual([]) // unchanged from before
    // At a US site with nothing abroad: held for the exempt answer, as before, and never as "worked in".
    expect(held(where({ siteCountry: 'US' }))).toHaveLength(1)
    expect(held(where({ siteCountry: 'US' }))[0].workedIn).toBeUndefined()
  })

  it('the entity country and the pay currency never select a local overtime rule', () => {
    for (const w of [{ entityCountry: 'IN' }, { payCurrency: 'INR' }, { entityCountry: 'GB', payCurrency: 'GBP' }]) {
      const line = payLineFor(where(w))
      expect(line.heldAbroad).toBeUndefined()
      expect(held(where(w))).toEqual([])
    }
    expect(payLineFor(where({ siteCountry: 'IN', entityCountry: 'US', payCurrency: 'USD' })).heldAbroad).toBe('India')
  })

  it('a person whose exempt answer is already recorded is still held abroad: the answer never releases a week worked where Etyme has no rule', () => {
    expect(held({ ...where({ siteCountry: 'IN' }), exemptStatus: 'EXEMPT' })).toHaveLength(1)
    expect(held({ ...where({ siteCountry: 'IN', wageRule: 'US_FLSA' }), exemptStatus: 'NONEXEMPT' })).toHaveLength(1)
  })

  it('a week at or under forty hours worked abroad is not held', () => {
    const line = payLineFor(where({ siteCountry: 'IN' }))
    expect(heldForExemption({ line, days: { '2026-06-08': 8, '2026-06-09': 8, '2026-06-10': 8, '2026-06-11': 8, '2026-06-12': 8 }, accepted: null, cutOvertime: 'OVERTIME_FIRST' as never })).toEqual([])
  })

  it('a week held abroad is judged on forty, so the pay file leaves it off', () => {
    expect(judgedLine(payLineFor(where({ siteCountry: 'IN' })))).toBe(40)
  })

  it('her own page holds the same week the Payroll row holds', () => {
    const line = payLineFor(where({ siteCountry: 'IN' }))
    const weeks = heldWeeksFor({
      line, cutOvertime: 'OVERTIME_FIRST' as never, paidHours: () => 0,
      sheets: [{ id: 's1', allDays: days46, days: days46, leaveDays: {}, accepted: null } as never],
    })
    expect(weeks.map((w) => w.workedHours)).toEqual([46])
  })
})
