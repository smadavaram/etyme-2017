import { describe, it, expect } from 'vitest'
import {
  checkOvertimeMethodChange,
  overtimeMethodRecord,
  overtimeMethodSays,
  MIN_REASON,
} from '@/lib/overtime-method-choice'
import { methodFor, weekOvertime, type DayHours } from '@/lib/money/overtime-method'

/**
 * The door a paying firm's choice of overtime method goes through, and
 * what payroll reads back from it. The founder, 2026-09-29: follow US
 * law as the recommendation, allow the firm to choose otherwise, and
 * record who chose it and why.
 *
 * The week used below: 45 hours, a pay cut from $70 to $66 on the
 * Wednesday, the five hours over the line all on a $66 day.
 */

const WEEK: DayHours[] = [
  { day: '2026-06-15', hours: 8, rateCents: 7_000 },
  { day: '2026-06-16', hours: 8, rateCents: 7_000 },
  { day: '2026-06-17', hours: 8, rateCents: 6_600 },
  { day: '2026-06-18', hours: 8, rateCents: 6_600 },
  { day: '2026-06-19', hours: 13, rateCents: 6_600 },
]
const FLSA = { multiplierBps: 15_000, floorBps: 15_000 }

const payer = { mayReadCost: true, isPayer: true, personName: 'Priya Natarajan' }

describe("choosing a pay line's overtime method", () => {
  it("a firm's overtime method is recorded with who chose it and why", () => {
    const v = checkOvertimeMethodChange({ ...payer, method: 'HIGHER_RATE', reason: '  Agreed with Priya at the June review ' })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    const at = new Date('2026-09-29T15:00:00Z')
    expect(overtimeMethodRecord(v, 'person-ana', at)).toEqual({
      overtimeMethod: 'HIGHER_RATE',
      overtimeMethodById: 'person-ana',
      overtimeMethodAt: at,
      overtimeMethodReason: 'Agreed with Priya at the June review',
    })
  })

  it("a method other than the law's default is refused without a reason", () => {
    for (const reason of [undefined, '', '   ', 'because']) {
      const v = checkOvertimeMethodChange({ ...payer, method: 'RATE_ON_THE_DAY', reason })
      expect(v.ok).toBe(false)
      if (v.ok) continue
      expect(v.status).toBe(422)
      expect(v.field).toBe('reason')
      expect(v.says).toContain("Say why overtime for Priya Natarajan should not be paid at the US regular rate, the law's default.")
    }
    expect('because'.length).toBeLessThan(MIN_REASON)
  })

  it("takes the law's default with no reason at all", () => {
    const v = checkOvertimeMethodChange({ ...payer, method: 'US_REGULAR_RATE', reason: undefined })
    expect(v).toEqual({ ok: true, method: 'US_REGULAR_RATE', reason: null })
  })

  it('a desk that cannot read what people cost cannot change it', () => {
    const v = checkOvertimeMethodChange({ ...payer, mayReadCost: false, method: 'HIGHER_RATE', reason: 'Agreed with Priya at review' })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.status).toBe(403)
    expect(v.code).toBe('FORBIDDEN')
  })

  it('refuses a firm that is not the one paying, in a sentence naming the worker', () => {
    const v = checkOvertimeMethodChange({ ...payer, isPayer: false, method: 'HIGHER_RATE', reason: 'We would like her paid more' })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.status).toBe(403)
    expect(v.says).toBe('Only the firm that pays Priya Natarajan can choose how their overtime is priced.')
  })

  it('refuses a method that is not one of the three, and names the three', () => {
    const v = checkOvertimeMethodChange({ ...payer, method: 'DOUBLE_TIME', reason: 'Agreed with Priya at review' })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.status).toBe(422)
    expect(v.says).toContain('the US regular rate, the rate in force on each overtime day, or the higher of the rates worked that week')
  })
})

describe('what payroll reads off the line', () => {
  it('reads a chosen method only where the line says who chose it and why', () => {
    expect(methodFor({ overtimeMethod: 'HIGHER_RATE', overtimeMethodById: 'p1', overtimeMethodReason: 'Agreed at review' })).toMatchObject({
      method: 'HIGHER_RATE', chosen: true,
    })
    const nobody = methodFor({ overtimeMethod: 'HIGHER_RATE', overtimeMethodById: null, overtimeMethodReason: 'Agreed at review' })
    expect(nobody.method).toBe('US_REGULAR_RATE')
    expect(nobody.says).toContain('without saying who chose it and why')
    const noReason = methodFor({ overtimeMethod: 'RATE_ON_THE_DAY', overtimeMethodById: 'p1', overtimeMethodReason: ' ' })
    expect(noReason.method).toBe('US_REGULAR_RATE')
    expect(methodFor({ overtimeMethod: 'SOMETHING_ELSE', overtimeMethodById: 'p1', overtimeMethodReason: 'x'.repeat(20) }).method).toBe('US_REGULAR_RATE')
  })

  it('payroll pays the chosen method, never below the regular-rate premium for a non-exempt worker', () => {
    const price = (overtimeMethod: string) =>
      weekOvertime({
        worked: WEEK, overHours: 5, ...FLSA,
        method: methodFor({ overtimeMethod, overtimeMethodById: 'p1', overtimeMethodReason: 'Agreed with Priya at review' }).method,
      })
    // Straight time $3,034.00 over 45 hours; half the regular rate on five hours.
    const law = (0.5 * 303_400 * 5) / 45
    expect(price('US_REGULAR_RATE').premiumCents).toBeCloseTo(law, 6)
    // The higher of $70 and $66: more than the law, and paid.
    expect(price('HIGHER_RATE').premiumCents).toBe(17_500)
    expect(price('HIGHER_RATE').floorGoverns).toBe(false)
    // The rate on the day is $66 on every overtime hour: $165.00, under
    // the law's $168.56, so the law's figure is paid and the week says so.
    const onTheDay = price('RATE_ON_THE_DAY')
    expect(onTheDay.methodPremiumCents).toBe(16_500)
    expect(onTheDay.floorGoverns).toBe(true)
    expect(onTheDay.premiumCents).toBeCloseTo(law, 6)
  })
})

describe('the sentence on the pay line', () => {
  it("says the law's default in plain words where nobody chose", () => {
    const s = overtimeMethodSays({ overtimeMethod: 'US_REGULAR_RATE', overtimeMethodById: null, overtimeMethodAt: null, overtimeMethodReason: null })
    expect(s.says).toBe("Overtime is paid at the US regular rate (the law's default). It only changes a week paid at two rates.")
    expect(s.chosen).toBe(false)
    expect(s.chosenBy).toBeNull()
  })

  it('names who chose another method and when, and keeps the floor in the sentence', () => {
    const s = overtimeMethodSays({
      overtimeMethod: 'HIGHER_RATE', overtimeMethodById: 'p1', overtimeMethodAt: new Date('2026-09-29T15:00:00Z'),
      overtimeMethodReason: 'Agreed with Priya at review', overtimeMethodBy: { name: 'Ana Ruiz' },
    })
    expect(s.says).toContain('Overtime is paid at the higher of the rates worked that week. Chosen by Ana Ruiz on September 29, 2026.')
    expect(s.says).toContain('never paid less than the regular-rate premium')
    expect(s.reason).toBe('Agreed with Priya at review')
  })

  it('never shows a stored method payroll is not honoring as though it were the one paid', () => {
    const s = overtimeMethodSays({ overtimeMethod: 'HIGHER_RATE', overtimeMethodById: null, overtimeMethodAt: null, overtimeMethodReason: null })
    expect(s.method).toBe('US_REGULAR_RATE')
    expect(s.says).toContain("Overtime is paid at the US regular rate (the law's default).")
    expect(s.says).toContain('without a name or a reason, so it is not used')
  })
})
