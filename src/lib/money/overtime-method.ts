/**
 * Overtime in a week paid at two rates.
 *
 * ── The founder's rule, 2026-09-29 ────────────────────────────────────
 *
 * "Follow US law as recommendation, but allow for user input if they
 * want to change." Every hour is paid at the rate in force on the day it
 * was worked (`priceByDay` in lib/contract-rate). What that leaves open is
 * the week that crosses a rate change AND goes over the line: which rate
 * is an overtime hour "at"?
 *
 * ── The default: the US regular rate, 29 CFR §778.115 ─────────────────
 *
 * Where an employee works at two or more rates in one workweek, the
 * regular rate is the week's total straight-time pay divided by the total
 * hours actually worked. Overtime is then:
 *
 *   straight time for EVERY hour worked, each at its own day's rate
 *   + (multiplier − 1) × regular rate × hours over the line
 *
 * With the statutory time and a half that premium is half the regular
 * rate per overtime hour. This is the formula used here, and the only
 * one — the other shapes below are algebra on it.
 *
 * ── The "equivalent form", and when it is not equivalent ──────────────
 *
 * The same total can be written as forty hours at the regular rate plus
 * time and a half of the regular rate for the hours over:
 *
 *   RR × 40 + 1.5 × RR × O  =  RR × (H − O) + 1.5 × RR × O
 *                           =  RR × H + 0.5 × RR × O
 *                           =  S + 0.5 × RR × O          (since RR × H = S)
 *
 * so the two agree exactly. They agree ONLY when "straight time for the
 * first forty" means forty hours at the regular rate. Paying the first
 * forty hours at their own day rates and then time and a half of the
 * regular rate for the rest is a different number: it prices the overtime
 * hours' straight time at the regular rate instead of the rate they were
 * worked at, and is off by O × (rate of the overtime days − RR). In the
 * founder's example that under-pays by $7.11. `firstFortyAtDayRates`
 * below exists only so a test can say so.
 *
 * ── The other two methods a paying firm may choose ───────────────────
 *
 *   RATE_ON_THE_DAY  the premium on each overtime hour is priced on the
 *                    rate in force the day that hour was worked
 *   HIGHER_RATE      the premium is priced on the higher of the rates
 *                    worked that week
 *
 * Neither may pay a nonexempt US employee less than the regular-rate
 * premium. HIGHER_RATE never can (the higher rate is at least the
 * average). RATE_ON_THE_DAY can — a pay cut in the middle of a week puts
 * the overtime on the lower rate — and where the law sets a floor the
 * floor is paid and the week says so. A firm's choice is an agreement
 * with its worker; it is not a waiver of a statute.
 *
 * ── Where the choice is kept ──────────────────────────────────────────
 *
 * On the buy line, with who chose it, when and why (`overtimeMethod`,
 * `overtimeMethodById`, `overtimeMethodAt`, `overtimeMethodReason`,
 * added 2026-09-29). `overtimeAfterHours` and `overtimeMultiplierBps` are
 * the line's terms and say nothing about a method; `OvertimeDecision` is
 * the client's per-week billing decision on the SELL leg. `methodFor`
 * reads the line, and applies a method other than the default only where
 * the line also says who chose it and why — a choice with no record of
 * who made it is the silent application the founder ruled out.
 *
 * ── Rounding ──────────────────────────────────────────────────────────
 *
 * Nothing here rounds. Every figure is exact cents as a real number, and
 * the caller rounds once, at the end, per line — a payroll run per
 * person and period, a file per rate line. Rounding the regular rate to
 * $68.58 first and multiplying would pay $171.45, a cent the arithmetic
 * does not support.
 */

import { DEFAULT_CURRENCY, amount, rate } from '@/lib/money-display'

export type OvertimeMethod = 'US_REGULAR_RATE' | 'RATE_ON_THE_DAY' | 'HIGHER_RATE'

export const DEFAULT_OVERTIME_METHOD: OvertimeMethod = 'US_REGULAR_RATE'

export const OVERTIME_METHOD_LABEL: Record<OvertimeMethod, string> = {
  US_REGULAR_RATE: 'US regular rate (the default)',
  RATE_ON_THE_DAY: 'The rate in force on each overtime day',
  HIGHER_RATE: 'The higher of the rates worked that week',
}

export const OVERTIME_METHODS = Object.keys(OVERTIME_METHOD_LABEL) as OvertimeMethod[]

/** One day's worked hours at the rate in force that day. Never paid leave. */
export interface DayHours {
  day: string
  hours: number
  rateCents: number
}

export interface WeekOvertimeInput {
  /** Every hour worked in the week, each day at its own rate. */
  worked: DayHours[]
  /** Hours past the weekly line. They are the week's last worked hours. */
  overHours: number
  /**
   * What an overtime hour is worth, in basis points of the rate the
   * method names: the better of statute and the contract. 15000 is time
   * and a half; 10000 is straight time and makes every premium zero.
   */
  multiplierBps: number
  /**
   * What the law requires on the REGULAR rate, whatever the firm chose.
   * 15000 under the FLSA for a nonexempt employee; null where no statute
   * prices an overtime hour.
   */
  floorBps: number | null
  method: OvertimeMethod
}

export interface OverDay extends DayHours {
  /** Exact cents. The premium only — straight time is in `straightCents`. */
  premiumCents: number
}

export interface WeekOvertime {
  method: OvertimeMethod
  hours: number
  overHours: number
  /** Every worked hour at its own day's rate. Exact. */
  straightCents: number
  /** Straight-time pay divided by hours worked. Exact; null with no hours. */
  regularRateCents: number | null
  /** The overtime hours, the day each fell on, and its premium. */
  overDays: OverDay[]
  /** What the chosen method prices. Exact. */
  methodPremiumCents: number
  /** What the law requires on the regular rate. Exact; 0 with no floor. */
  floorPremiumCents: number
  /** What is owed: the greater of the two. Exact. */
  premiumCents: number
  /** True where the chosen method fell short and the law's figure was paid. */
  floorGoverns: boolean
  /** Straight time plus premium. Exact. */
  totalCents: number
  /** Distinct rates worked this week. */
  rates: number[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Straight-time pay over hours worked, exact. Null where nothing was worked. */
export function regularRateCents(worked: DayHours[]): number | null {
  const hours = worked.reduce((n, d) => n + d.hours, 0)
  if (hours <= 0) return null
  return worked.reduce((n, d) => n + d.hours * d.rateCents, 0) / hours
}

/**
 * Which worked hours are the overtime ones: the last `overHours` of the
 * week, walking back from its last day. The line is crossed at the end
 * of a week, not the start.
 */
export function overDaysOf(worked: DayHours[], overHours: number): DayHours[] {
  const sorted = [...worked].sort((a, b) => a.day.localeCompare(b.day))
  const out: DayHours[] = []
  let left = round2(overHours)
  for (let i = sorted.length - 1; i >= 0 && left > 0; i--) {
    const take = Math.min(left, sorted[i].hours)
    if (take > 0) out.unshift({ day: sorted[i].day, hours: round2(take), rateCents: sorted[i].rateCents })
    left = round2(left - take)
  }
  return out
}

/**
 * Take `off` hours out of a week's ordinary hours — the ones just before
 * the overtime, walking back — and leave the hours over the line alone.
 *
 * The payroll file takes hours an employer struck out off the ordinary
 * hours, never off the premium (`payable` in lib/payroll-export); the
 * worked days the overtime is priced from are cut at the same place so
 * the file and its regular rate describe the same week.
 */
export function cutOrdinary(worked: DayHours[], overHours: number, off: number): DayHours[] {
  const sorted = [...worked].map((d) => ({ ...d })).sort((a, b) => a.day.localeCompare(b.day))
  let skip = round2(overHours)
  let left = round2(off)
  for (let i = sorted.length - 1; i >= 0 && left > 0; i--) {
    const overHere = Math.min(skip, sorted[i].hours)
    skip = round2(skip - overHere)
    const ordinary = round2(sorted[i].hours - overHere)
    const take = Math.min(left, ordinary)
    sorted[i].hours = round2(sorted[i].hours - take)
    left = round2(left - take)
  }
  return sorted.filter((d) => d.hours > 0)
}

/**
 * What a week's overtime is worth under a method, exact.
 *
 * A week at one rate comes out the same under all three methods, which is
 * why a firm's choice only ever matters in a week that crossed a change.
 */
export function weekOvertime(input: WeekOvertimeInput): WeekOvertime {
  const worked = input.worked.filter((d) => d.hours > 0)
  const hours = round2(worked.reduce((n, d) => n + d.hours, 0))
  const straightCents = worked.reduce((n, d) => n + d.hours * d.rateCents, 0)
  const rr = regularRateCents(worked)
  const over = overDaysOf(worked, Math.min(input.overHours, hours))
  const overHours = round2(over.reduce((n, d) => n + d.hours, 0))
  const rates = [...new Set(worked.map((d) => d.rateCents))].sort((a, b) => a - b)
  const higher = rates.length ? rates[rates.length - 1] : 0

  const factor = Math.max(0, input.multiplierBps - 10_000) / 10_000
  const floorFactor = input.floorBps == null ? 0 : Math.max(0, input.floorBps - 10_000) / 10_000

  const basisOf = (d: DayHours) =>
    input.method === 'RATE_ON_THE_DAY' ? d.rateCents : input.method === 'HIGHER_RATE' ? higher : rr ?? 0

  // Per hour, so the premium can be attributed to the day it belongs to —
  // back pay reads it that way. The regular rate is a property of the
  // whole week, so under it every overtime hour carries the same premium.
  const methodDays = over.map((d) => ({ ...d, premiumCents: factor * basisOf(d) * d.hours }))
  // S × O × f / H rather than (S / H) × O × f: one division, last.
  const floorPremiumCents =
    rr == null || hours <= 0 ? 0 : (floorFactor * straightCents * overHours) / hours
  const methodPremiumCents = methodDays.reduce((n, d) => n + d.premiumCents, 0)

  // A tolerance of a thousandth of a cent, so floating point never
  // reports the law "governing" a week where the two are the same number.
  const floorGoverns = floorPremiumCents - methodPremiumCents > 0.001
  const overDays: OverDay[] = floorGoverns
    ? over.map((d) => ({ ...d, premiumCents: overHours > 0 ? (floorPremiumCents * d.hours) / overHours : 0 }))
    : methodDays
  const premiumCents = floorGoverns ? floorPremiumCents : methodPremiumCents

  return {
    method: input.method,
    hours,
    overHours,
    straightCents,
    regularRateCents: rr,
    overDays,
    methodPremiumCents,
    floorPremiumCents,
    premiumCents,
    floorGoverns,
    totalCents: straightCents + premiumCents,
    rates,
  }
}

/**
 * The shape of the "equivalent form" when the first forty hours are paid
 * at their own day rates rather than at the regular rate. Not used to pay
 * anybody: it exists so a test can show it is not the same number.
 */
export function firstFortyAtDayRates(worked: DayHours[], overHours: number, multiplierBps: number): number {
  const rr = regularRateCents(worked) ?? 0
  const over = overDaysOf(worked, overHours)
  const overStraight = over.reduce((n, d) => n + d.hours * d.rateCents, 0)
  const straight = worked.reduce((n, d) => n + d.hours * d.rateCents, 0)
  const o = over.reduce((n, d) => n + d.hours, 0)
  return straight - overStraight + (multiplierBps / 10_000) * rr * o
}

/** What `methodFor` reads off a buy line. Every field optional: a caller that did not load them gets the default. */
export interface OvertimeMethodOnLine {
  overtimeMethod?: string | null
  overtimeMethodById?: string | null
  overtimeMethodReason?: string | null
}

const isMethod = (m: unknown): m is OvertimeMethod => typeof m === 'string' && (OVERTIME_METHODS as string[]).includes(m)

/**
 * The method a line is paid on, and why.
 *
 * The line's own choice where somebody made one and said why; the US
 * regular rate otherwise. Whatever this answers, `weekOvertime` still
 * pays the law's floor on the regular rate where one applies.
 */
export function methodFor(line?: object | null): { method: OvertimeMethod; chosen: boolean; says: string } {
  // Any buy line, whatever else it was loaded with. A caller whose query
  // did not select these columns reads the default — see the note above.
  const l = (line ?? {}) as OvertimeMethodOnLine
  const stored = l.overtimeMethod
  const byWhom = l.overtimeMethodById ?? null
  const why = l.overtimeMethodReason?.trim() || null
  const defaultSays =
    'Overtime in a week paid at two rates is priced on the US regular rate (29 CFR §778.115). '

  if (isMethod(stored) && stored !== DEFAULT_OVERTIME_METHOD && byWhom && why) {
    return {
      method: stored,
      chosen: true,
      says:
        `Overtime in a week paid at two rates is priced on ${OVERTIME_METHOD_LABEL[stored].toLowerCase()}, ` +
        `as the paying firm chose: ${why}. A nonexempt US worker is never paid less than the regular-rate premium.`,
    }
  }
  if (stored != null && stored !== DEFAULT_OVERTIME_METHOD) {
    // A value outside the set, or another method with nobody named or no
    // reason. Neither is a choice anybody can stand behind, so the law's
    // default is paid and the sentence says why.
    return {
      method: DEFAULT_OVERTIME_METHOD,
      chosen: false,
      says: defaultSays + 'The line names another method without saying who chose it and why, so the default is paid.',
    }
  }
  if (byWhom) {
    return { method: DEFAULT_OVERTIME_METHOD, chosen: true, says: defaultSays + 'The paying firm chose it.' }
  }
  return { method: DEFAULT_OVERTIME_METHOD, chosen: false, says: defaultSays + 'No other method has been chosen for this line.' }
}

/**
 * The week, in a sentence a payroll clerk can check with a calculator.
 *
 * "Week of 29 June 2026: 45 hours worked at $66.00/hr and $70.00/hr,
 * $3,086.00 straight time. Regular rate $68.58/hr. 5 hours over the line
 * earn half of it again: $171.44 (US regular rate, 29 CFR §778.115)."
 */
export function weekOvertimeSays(weekOf: string, w: WeekOvertime, currency: string = DEFAULT_CURRENCY): string {
  const rates = w.rates.map((r) => rate(r, currency)).join(' and ')
  const rr = w.regularRateCents == null ? '—' : rate(Math.round(w.regularRateCents), currency)
  const head =
    `Week of ${weekOf}: ${w.hours} hours worked at ${rates}, ${amount(Math.round(w.straightCents), currency)} straight time. ` +
    `Regular rate ${rr}.`
  if (w.overHours <= 0) return head
  const premium = amount(Math.round(w.premiumCents), currency)
  const how =
    w.method === 'US_REGULAR_RATE'
      ? 'US regular rate, 29 CFR §778.115'
      : `${OVERTIME_METHOD_LABEL[w.method].toLowerCase()}, as the paying firm chose`
  const floor = w.floorGoverns
    ? ` The method chosen would have paid ${amount(Math.round(w.methodPremiumCents), currency)}, under what the law requires on the regular rate, so the law's figure is paid.`
    : ''
  return `${head} ${w.overHours} hour${w.overHours === 1 ? '' : 's'} over the line earn a premium of ${premium} (${how}).${floor}`
}
