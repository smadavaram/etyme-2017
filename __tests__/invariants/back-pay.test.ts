/**
 * Back pay for a raise dated in the past.
 *
 * The founder, 2026-09-29: "A raise dated in the past has its back pay
 * worked out and put forward as a one-off payment for a desk to approve,
 * never paid silently." So these are sentences about a proposal: what
 * it adds up to, which weeks, and what it refuses to count.
 */

import { describe, it, expect } from 'vitest'
import { backPayOf, backPaySays, weeksSay, type PaidDay } from '@/lib/money/back-pay'

const JUNE = { start: '2026-06-01', label: 'June 2026' }
const JULY = { start: '2026-07-01', label: 'July 2026' }

/** A day paid at `paidRate`, now worth `nowRate`. */
function day(d: string, hours: number, paidRate: number, nowRate: number, over: Partial<PaidDay> = {}): PaidDay {
  return {
    personId: 'priya',
    sellContractId: 'sell',
    timesheetId: `ts-${d.slice(0, 7)}`,
    day: d,
    weekOf: over.weekOf ?? d,
    period: d < '2026-07-01' ? JUNE : JULY,
    paid: { hours, straightCents: hours * paidRate, premiumHours: 0, premiumCents: 0, premiumRecorded: true },
    rateNowCents: nowRate,
    premiumPerHourNowCents: 0,
    overHoursNow: 0,
    inChange: true,
    weekInChange: true,
    ...over,
  }
}

describe('back pay for a rise dated before days already paid', () => {
  it('owes $4 an hour on every hour paid at $66 after a rise to $70 that reaches it', () => {
    const f = backPayOf([day('2026-06-22', 8, 6_600, 7_000), day('2026-06-23', 8, 6_600, 7_000)])
    expect(f.totalCents).toBe(16 * 400)
    expect(f.periods).toHaveLength(1)
    expect(f.periods[0].label).toBe('June 2026')
  })

  it('adds the difference in the overtime premium, because a rise moves the regular rate of the whole week', () => {
    // Forty-five hours, all at $66 when paid: a $165 premium on the five
    // over the line. At $70 the regular rate is $70 and the premium $175.
    const friday = day('2026-06-19', 13, 6_600, 7_000, {
      weekOf: '2026-06-15',
      paid: { hours: 13, straightCents: 13 * 6_600, premiumHours: 5, premiumCents: 16_500, premiumRecorded: true },
      premiumPerHourNowCents: 3_500,
      overHoursNow: 5,
    })
    const f = backPayOf([friday])
    expect(f.totalCents).toBe(13 * 400 + (17_500 - 16_500))
    expect(f.periods[0].lines[0].premiumCents).toBe(1_000)
  })

  it('counts the premium on a paid overtime day the change reaches only through its week, but not its straight time', () => {
    // A rise from Friday: Thursday's overtime premium moves because the
    // week's regular rate moved; Thursday's own hours are still $66 hours.
    const thursday = day('2026-06-18', 10, 6_600, 6_600, {
      weekOf: '2026-06-15',
      inChange: false,
      paid: { hours: 10, straightCents: 10 * 6_600, premiumHours: 2, premiumCents: 6_600, premiumRecorded: true },
      premiumPerHourNowCents: 3_350,
      overHoursNow: 2,
    })
    const f = backPayOf([thursday])
    expect(f.periods[0].lines[0].straightCents).toBe(0)
    expect(f.totalCents).toBe(2 * 3_350 - 6_600)
  })

  it('measures from what was already paid, back pay included, so the same difference is never proposed twice', () => {
    const settled = day('2026-06-22', 8, 7_000, 7_000)
    expect(backPayOf([settled]).totalCents).toBe(0)
    expect(backPayOf([settled]).periods).toEqual([])
  })

  it('proposes one payment per pay period, each rounded once, because an off-cycle payment posts to the period it belongs to', () => {
    const f = backPayOf([
      day('2026-06-30', 7.33, 6_600, 7_000),
      day('2026-06-29', 7.33, 6_600, 7_000),
      day('2026-07-01', 8, 6_600, 7_000),
    ])
    expect(f.periods.map((p) => [p.label, p.amountCents])).toEqual([
      ['June 2026', Math.round(14.66 * 400)],
      ['July 2026', 8 * 400],
    ])
    expect(f.totalCents).toBe(Math.round(14.66 * 400) + 8 * 400)
  })

  it('proposes nothing for a cut, and says the period was paid more than the new rate', () => {
    const f = backPayOf([day('2026-06-22', 8, 7_000, 6_600)])
    expect(f.totalCents).toBe(0)
    expect(f.overpaid).toEqual([{ label: 'June 2026', cents: 8 * 400 }])
    expect(backPaySays(f, { personName: 'Priya', toCents: 6_600, currency: 'USD' })).toContain('does not recover')
  })

  it('leaves out overtime paid before the run priced overtime at all, and says it is owed on its own', () => {
    const legacy = day('2026-06-19', 13, 6_600, 7_000, {
      paid: { hours: 13, straightCents: 13 * 6_600, premiumHours: 0, premiumCents: 0, premiumRecorded: false },
      premiumPerHourNowCents: 3_500,
      overHoursNow: 5,
    })
    const f = backPayOf([legacy])
    expect(f.totalCents).toBe(13 * 400)
    expect(f.unpricedOvertimeHours).toBe(5)
    expect(backPaySays(f, { personName: 'Priya', toCents: 7_000, currency: 'USD' })).toContain('not in this figure')
  })

  it('says how much, for whom, for which weeks, and that nothing is paid until a payroll desk approves it', () => {
    const f = backPayOf([
      day('2026-06-15', 8, 6_600, 7_000, { weekOf: '2026-06-15' }),
      day('2026-06-22', 8, 6_600, 7_000, { weekOf: '2026-06-22' }),
    ])
    const says = backPaySays(f, { personName: 'Priya Venkataraman', toCents: 7_000, currency: 'USD' })
    expect(says).toBe(
      'Back pay of $64.00 is proposed for Priya Venkataraman, for the weeks of June 15, 2026 and June 22, 2026, ' +
        'which were paid before the change to $70/hr was approved. A payroll desk approves it as an off-cycle ' +
        'payment; nothing is paid until then.'
    )
  })

  it('says plainly when nothing is owed', () => {
    expect(backPaySays(backPayOf([]), { personName: 'Priya', toCents: 7_000, currency: 'USD' })).toBe(
      'No back pay is owed to Priya: no day this change reaches was paid at the old rate.'
    )
  })

  it('names one week as a week', () => {
    expect(weeksSay(['2026-06-29'])).toBe('the week of June 29, 2026')
  })
})
