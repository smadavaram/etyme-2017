/**
 * A timesheet's overtime, week by week, each day at the rate in force.
 *
 * The payroll screen, the payroll run, the payroll file and back pay all
 * ask the same question of the same days, so they ask it here. Before
 * this, the file priced overtime on the rate of the week's first day and
 * the screen and the run priced no overtime at all: a nonexempt worker's
 * forty-five-hour week was paid forty-five hours of straight time by the
 * run and time and a half by the file.
 *
 * Nothing here decides whether a premium is owed. That is the wage rules'
 * answer (`weekWage` in lib/worker-classification), turned into a
 * multiplier and a legal floor by `premiumTerms`. Nothing here rounds
 * either: the caller rounds once per line.
 */

import { rateInForce, type RatePeriod } from '@/lib/contract-rate'
import { weekStart } from '@/lib/overtime'
import {
  weekWage,
  type ExemptAssertion,
  type ExemptionBasis,
  type ExemptStatus,
  type WagePay,
  type WageRuleName,
} from '@/lib/worker-classification'
import { weekOvertime, overDaysOf, type DayHours, type OvertimeMethod, type WeekOvertime } from '@/lib/money/overtime-method'

const round2 = (n: number) => Math.round(n * 100) / 100
const dayDate = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`)

/**
 * Worked hours per day — the sheet's hours less paid leave — each at the
 * rate in force that day, grouped by the Monday of their week.
 *
 * Leave is left out on purpose: it is paid, but it was not worked, so it
 * neither crosses the line nor counts toward the regular rate (29 U.S.C.
 * §207(e)(2) excludes pay for time not worked).
 */
export function workedByWeek(input: {
  days: Record<string, number> | null | undefined
  leaveDays?: Record<string, number> | null
  contractRateCents: number
  periods: RatePeriod[]
}): Map<string, DayHours[]> {
  const out = new Map<string, DayHours[]>()
  const leave = input.leaveDays ?? {}
  const days = Object.entries(input.days ?? {})
    .map(([day, h]) => ({ day: day.slice(0, 10), hours: Number(h) || 0 }))
    .sort((a, b) => a.day.localeCompare(b.day))
  for (const d of days) {
    const worked = round2(Math.max(0, d.hours - Math.max(0, Number(leave[d.day] ?? 0) || 0)))
    if (worked <= 0) continue
    const r = rateInForce(input.contractRateCents, input.periods, dayDate(d.day)).rateCents
    const week = weekStart(d.day)
    out.set(week, [...(out.get(week) ?? []), { day: d.day, hours: worked, rateCents: r }])
  }
  return out
}

/** What the wage rules make an overtime hour worth, for one week. */
export interface PremiumTerms {
  /** False where nobody can say what the week is owed. */
  priced: boolean
  multiplierBps: number
  floorBps: number | null
  /** Why a week is not priced. Null where it is. */
  says: string | null
}

/**
 * The wage rules' verdict, and the better thing the contract promised.
 *
 * Nonexempt under a statute that prices overtime: the statute's multiple,
 * and a floor on the regular rate. Everywhere the contract governs: its
 * own multiple where it names one, straight time where it does not. A
 * week nobody can classify is not priced, and says why.
 */
export function premiumTerms(verdict: WagePay, contractPremiumBps: number | null | undefined): PremiumTerms {
  const agreed = contractPremiumBps ?? 0
  // Somebody else's wage — a corp-to-corp company, a sub-vendor's
  // employee — is settled on the contract's own terms, and no statute of
  // ours prices it.
  if (verdict.code === 'NOT_A_WAGE') {
    return { priced: true, multiplierBps: Math.max(10_000, agreed), floorBps: null, says: null }
  }
  if (!verdict.ok) {
    return { priced: false, multiplierBps: 10_000, floorBps: null, says: verdict.says }
  }
  if (verdict.code === 'OWED_IN_MONEY') {
    const floor = verdict.appliedBps ?? 15_000
    return { priced: true, multiplierBps: Math.max(floor, agreed), floorBps: floor, says: null }
  }
  return { priced: true, multiplierBps: Math.max(10_000, agreed), floorBps: null, says: null }
}

/** The employer's exempt position as the wage rules read it, from its row. */
export function assertionOf(row: {
  status: string
  basis: string | null
  assertedByCompanyId: string
  assertedByCompany?: { name: string } | null
  assertedBy?: { name: string } | null
  assertedAt: Date
  note: string | null
  reviewBy: Date | null
} | null | undefined): ExemptAssertion | null {
  if (!row) return null
  return {
    status: row.status as ExemptStatus,
    basis: (row.basis as ExemptionBasis | null) ?? null,
    assertedByCompanyId: row.assertedByCompanyId,
    assertedByCompanyName: row.assertedByCompany?.name ?? null,
    assertedByName: row.assertedBy?.name ?? null,
    assertedAt: row.assertedAt,
    note: row.note,
    reviewBy: row.reviewBy,
  }
}

/** The facts about a pay line the wage rules need, once per person. */
export interface WageLine {
  personName: string
  contractType: string
  weAreTheEmployer: boolean
  payModel: string
  rule: WageRuleName
  assertion: ExemptAssertion | null
  /** The buy line's own overtime multiple, only where it names a threshold. */
  contractPremiumBps: number | null
  employerName?: string | null
}

export interface SheetWeek {
  weekOf: string
  overHours: number
  /** Which days the hours over the line fell on, priced or not. */
  overDays: DayHours[]
  terms: PremiumTerms
  /** Null where the week is not priced. */
  overtime: WeekOvertime | null
}

/**
 * Every week of a sheet that went over the line, and what its overtime
 * is worth under the method.
 *
 * `afterHours` null is straight time: no week goes over a line nobody
 * drew. Weeks under the line are not returned — they have no premium.
 */
export function sheetOvertime(input: {
  days: Record<string, number> | null | undefined
  leaveDays?: Record<string, number> | null
  afterHours: number | null
  contractRateCents: number
  periods: RatePeriod[]
  method: OvertimeMethod
  line: WageLine
}): SheetWeek[] {
  if (input.afterHours == null) return []
  const weeks = workedByWeek(input)
  const out: SheetWeek[] = []
  for (const [weekOf, worked] of [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const hours = round2(worked.reduce((n, d) => n + d.hours, 0))
    const overHours = round2(Math.max(0, hours - input.afterHours))
    if (overHours <= 0) continue
    const leaveHours = round2(
      Object.entries(input.leaveDays ?? {})
        .filter(([day]) => weekStart(day.slice(0, 10)) === weekOf)
        .reduce((n, [, h]) => n + (Number(h) || 0), 0)
    )
    const verdict = weekWage(
      { weekOf, regularHours: round2(hours - overHours), leaveHours, overHours },
      {
        personName: input.line.personName,
        contractType: input.line.contractType,
        weAreTheEmployer: input.line.weAreTheEmployer,
        pay: { payModel: input.line.payModel, payRateCents: worked[0].rateCents, paidOnSalaryBasis: false },
        rule: input.line.rule,
        assertion: input.line.assertion,
        // The client's billing decision is a fact about a different
        // contract, and never prices a wage.
        client: { treatment: null, appliedBps: null },
        employerName: input.line.employerName,
      }
    )
    const terms = premiumTerms(verdict, input.line.contractPremiumBps)
    out.push({
      weekOf,
      overHours,
      overDays: overDaysOf(worked, overHours),
      terms,
      overtime: terms.priced
        ? weekOvertime({ worked, overHours, multiplierBps: terms.multiplierBps, floorBps: terms.floorBps, method: input.method })
        : null,
    })
  }
  return out
}

/** One day's overtime hours and their premium, exact. */
export interface DayPremium {
  weekOf: string
  hours: number
  premiumCents: number
  rateCents: number
}

/**
 * The premium on each day, for the days a reader is paying.
 *
 * A pay period can hold part of a week. The regular rate is still the
 * whole week's, and the premium belongs to the day its overtime hours
 * were worked — which, the line being crossed at the end of a week, is
 * the week's last days. `only` narrows to the days in the period.
 */
export function premiumByDay(weeks: SheetWeek[], only?: Set<string> | null): Map<string, DayPremium> {
  const out = new Map<string, DayPremium>()
  for (const w of weeks) {
    if (!w.overtime) continue
    for (const d of w.overtime.overDays) {
      if (only && !only.has(d.day)) continue
      const prev = out.get(d.day)
      out.set(d.day, {
        weekOf: w.weekOf,
        hours: round2((prev?.hours ?? 0) + d.hours),
        premiumCents: (prev?.premiumCents ?? 0) + d.premiumCents,
        rateCents: d.rateCents,
      })
    }
  }
  return out
}

/**
 * What the premium in these weeks is, and what could not be priced, in
 * sentences. Null where nothing went over the line.
 */
export function overtimeSaysFor(weeks: SheetWeek[], only?: Set<string> | null): string | null {
  const touched = weeks.filter((w) => !only || w.overDays.some((d) => only.has(d.day)))
  if (touched.length === 0) return null
  const parts: string[] = []
  const priced = touched.filter((w) => w.overtime && w.overtime.premiumCents > 0)
  if (priced.length > 0) {
    const two = priced.filter((w) => w.overtime!.rates.length > 1)
    parts.push(
      `${round2(priced.reduce((n, w) => n + w.overHours, 0))} hours over the line ` +
        `(${priced.map((w) => `week of ${w.weekOf}`).join(', ')}) carry an overtime premium` +
        (two.length > 0
          ? `; ${two.map((w) => `the week of ${w.weekOf}`).join(' and ')} was paid at two rates, so ` +
            `${two.length === 1 ? 'its' : 'their'} premium is on the regular rate (29 CFR §778.115)`
          : '') +
        '.'
    )
  }
  for (const w of touched.filter((x) => !x.terms.priced)) {
    parts.push(
      `${w.overHours} hours over the line in the week of ${w.weekOf} are paid at straight time here and ` +
        `their premium is not priced: ${w.terms.says ?? 'nobody can say what they are owed.'}`
    )
  }
  return parts.length ? parts.join(' ') : null
}
