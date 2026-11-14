import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  periodHolding, periodShownSays, payFileWaits, noHolidaysSays, payDayInsidePeriod, payDayInsideSays,
  type PayFileRow,
} from '@/lib/money/pay-periods'
import { DEFAULT_PAY_RHYTHM, type PayRhythm } from '@/lib/pay-dates'

/**
 * Three things a payroll person is told on the Payroll page (2026-11-14,
 * after the skeptic's walk of the company's own pay periods):
 *
 *   1. Pay never goes out before it is worked out (the founder's rule).
 *      The pay file leaves for the payroll provider, so a period nobody
 *      worked out offers a sentence in the button's place, and the route
 *      refuses the file in the same sentence.
 *   2. A pay day moves off a public holiday only where that holiday is on
 *      the company's own calendar. An empty calendar is said, never filled.
 *   3. A pay day on or before the period's last day is said on the
 *      period's line. The rule that put it there is left alone.
 *
 * Calendar facts: Dec 6, 2026 is a Sunday; Dec 19 a Saturday; Dec 18 a
 * Friday; Dec 25, 2026 a Friday.
 */

const biweekly = (first: string, over: Partial<PayRhythm> = {}): PayRhythm =>
  ({ ...DEFAULT_PAY_RHYTHM, payDaysOfMonth: [28], payFirstPeriodStart: first, ...over })

const row = (name: string, payStatus: string, over: Partial<PayFileRow> = {}): PayFileRow => ({
  person: { name }, totalApprovedHours: 80, payRate: 5_000, grossPay: 400_000, payCurrency: 'USD', payStatus, ...over,
})

const words = (text: string) => text.split(/(?<=\.)\s+/).map((s) => s.split(/\s+/).length)

describe('the pay file is offered only once the period is worked out', () => {
  it('a period nobody has worked out offers no pay file, and says whose pay is not worked out and to press Calculate', () => {
    expect(payFileWaits([row('Ines Varga', 'PENDING')])).toBe(
      'Pay for Ines Varga is not worked out yet, so there is no pay file yet. Press Calculate first.',
    )
  })

  it('one person not worked out holds back the file for the whole period, and is named', () => {
    expect(payFileWaits([row('Ines Varga', 'CALCULATED'), row('Tomas Ruiz', 'PENDING')])).toBe(
      'Pay for Tomas Ruiz is not worked out yet, so there is no pay file yet. Press Calculate first.',
    )
    expect(payFileWaits([row('Ines Varga', 'PENDING'), row('Tomas Ruiz', 'PENDING')])).toContain('Pay for Ines Varga and Tomas Ruiz is')
    expect(payFileWaits(['Ines Varga', 'Tomas Ruiz', 'Amara Nwosu', 'Rhea Lindqvist'].map((n) => row(n, 'PENDING')))).toContain(
      'Pay for Ines Varga, Tomas Ruiz and 2 more is',
    )
  })

  it('a period worked out, or paid, offers its pay file', () => {
    expect(payFileWaits([row('Ines Varga', 'CALCULATED'), row('Tomas Ruiz', 'PROCESSED')])).toBeNull()
  })

  it('a period part paid keeps its pay file, which carries what is still to pay with what was paid already', () => {
    expect(payFileWaits([row('Rhea Lindqvist', 'PENDING', { paidSoFar: { hours: 40, grossCents: 80_000 } })])).toBeNull()
  })

  it('a person with no hours in the period does not hold back the pay file', () => {
    expect(payFileWaits([row('Ines Varga', 'CALCULATED'), row('Nobody This Period', 'PENDING', { totalApprovedHours: 0, grossPay: 0 })])).toBeNull()
  })

  it('the Payroll page puts the sentence in the pay file button’s place, and the route refuses the file with the same sentence', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/payroll/page.tsx'), 'utf8')
    expect(page).toContain('{!nothingToPay && payFileWaits && (')
    expect(page).toContain('{!nothingToPay && !payFileWaits && (')
    const route = readFileSync(join(process.cwd(), 'src/app/api/payroll/route.ts'), 'utf8')
    expect(route).toContain('const fileWaits = shownPeriod ? payFileWaits(onRun) : null')
    expect(route).toContain("{ error: { code: 'NOT_WORKED_OUT', field: 'period', message: fileWaits } }")
    expect(route).toContain('payFileWaits: fileWaits')
  })
})

describe('a company with no holidays on its calendar is told its pay days are not moved off one', () => {
  it('a company with no holidays on its calendar is told a pay day on a public holiday is not moved, and where to add them', () => {
    expect(noHolidaysSays('Tapin', {})).toBe(
      "No holidays are on Tapin's calendar, so a pay day on a public holiday is not moved. Add them in Settings, under Holidays.",
    )
    expect(noHolidaysSays('Tapin', { holidays: new Set() })).not.toBeNull()
  })

  it('a company with a holiday on its calendar is told nothing about it', () => {
    expect(noHolidaysSays('Tapin', { holidays: new Set(['2026-12-25']) })).toBeNull()
    expect(noHolidaysSays('Tapin', { holidays: ['2026-12-25'] })).toBeNull()
  })

  it('nothing adds a holiday: with an empty calendar a pay day on December 25 stays on December 25', () => {
    // Paid the Saturday plus 6: the period Dec 6 – Dec 19 pays Fri Dec 25.
    expect(periodHolding('2026-12-06', biweekly('2026-12-06'), {})!.payOn).toBe('2026-12-25')
  })

  it('the Payroll page says it beside the company’s pay periods, and the Settings page it names holds a Holidays tab', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/payroll/page.tsx'), 'utf8')
    expect(page).toContain('{payPeriods && noHolidays && <p')
    const route = readFileSync(join(process.cwd(), 'src/app/api/payroll/route.ts'), 'utf8')
    expect(route).toContain('noHolidays: co.byPeriod ? noHolidaysSays(companyName, co.rule) : null')
    const settings = readFileSync(join(process.cwd(), 'src/app/dashboard/settings/page.tsx'), 'utf8')
    expect(settings).toMatch(/const TABS = \[[^\]]*'Holidays'/)
  })
})

describe('a pay day on or before the period’s last day is said on the period’s line', () => {
  // "Paid on" 0 days after the Saturday, moved to the working day before:
  // the period Dec 6 – Dec 19 pays Fri Dec 18, inside the period.
  const r = biweekly('2026-12-06', { payCalcOffsetDays: 0, payDayOffsetDays: 0 })
  const inside = periodHolding('2026-12-06', r, {})!

  it('the rule is left alone: a pay offset of 0 with the working day before pays on the period’s own Friday', () => {
    expect(inside.payOn).toBe('2026-12-18')
    expect(payDayInsidePeriod(inside)).toBe(true)
  })

  it('a period whose pay day falls on or before its last day says so on its line, and where "Paid on" is set', () => {
    expect(payDayInsideSays(inside)).toBe(
      'This pay day is on or before the period\'s last day, Sat, Dec 19, 2026. "Paid on" is set in Settings, under Cycles, then Payroll.',
    )
    expect(periodShownSays('Tapin', r, inside)).toContain(
      'paid Fri, Dec 18, 2026. It moved from Sat, Dec 19, 2026, a day off or a holiday. This pay day is on or before the period\'s last day',
    )
  })

  it('a pay day on the period’s last day itself is said too', () => {
    expect(payDayInsidePeriod({ ...inside, payOn: inside.end })).toBe(true)
  })

  it('a period paid after its last day says nothing more', () => {
    const after = periodHolding('2026-12-06', biweekly('2026-12-06'), { holidays: ['2026-12-25'] })!
    expect(payDayInsidePeriod(after)).toBe(false)
    expect(periodShownSays('Tapin', biweekly('2026-12-06'), after)).not.toContain('on or before')
  })

  it('the Settings field it names is called "Paid on"', () => {
    const panel = readFileSync(join(process.cwd(), 'src/components/settings/payroll-panel.tsx'), 'utf8')
    expect(panel).toContain('<Field label="Paid on">')
  })
})

describe('the three sentences read the way a payroll person says them', () => {
  it('every sentence is under twenty-five words and says neither desk nor program office', () => {
    const inside = periodHolding('2026-12-06', biweekly('2026-12-06', { payCalcOffsetDays: 0, payDayOffsetDays: 0 }), {})!
    const said = [
      payFileWaits(['Marisol Quintero', 'Ana Lee', 'Tomas Ruiz'].map((n) => row(n, 'PENDING')))!,
      noHolidaysSays('Brightmoor Staffing', {})!,
      payDayInsideSays(inside),
    ]
    for (const text of said) {
      for (const n of words(text)) expect(n, text).toBeLessThan(25)
      expect(text).not.toMatch(/\bdesk\b|program office/i)
    }
  })
})
