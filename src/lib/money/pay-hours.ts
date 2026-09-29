/**
 * Which hours are paid, when the employer accepts fewer than were worked.
 *
 * ── The founder's rule, 2026-09-29 ────────────────────────────────────
 *
 * "Yes to all": when an employer accepts fewer hours than were worked,
 * the cut on PAY comes off the worker's **ordinary hours first**, so the
 * worker keeps their overtime. It is the opposite of the billing rule
 * (`acceptedDays` in lib/periods: overtime first, the later bill first)
 * on purpose — on the bill the firm protects its client, on pay it
 * protects its worker.
 *
 * ── The one allocation, for every reader of pay ──────────────────────
 *
 * The run, the payroll screen, the payroll file and back pay all ask
 * this, so the four cannot disagree about which hours were paid:
 *
 *   1. Each day's hours are banded the way billing bands them: worked
 *      hours cross the weekly line at the end of the week, so the hours
 *      over it sit on the week's last days; paid leave is paid, never
 *      worked, and never crosses the line.
 *   2. The hours not accepted come off **ordinary hours first**, walking
 *      from the latest day backward; on one day the hours worked go
 *      before paid leave. The hours over the line are not touched.
 *   3. Only where every ordinary hour is gone does the rest come off the
 *      hours over the line, again latest first — so the hours paid never
 *      exceed the hours accepted.
 *
 * Worked examples, a forty-hour line, forty-five worked:
 *
 *   42 accepted → 37 ordinary and 5 overtime, paid 42.
 *   38 accepted → 33 ordinary and 5 over the line, paid 38 — and see below.
 *
 * ── Where "the worker keeps their overtime" stops standing ───────────
 *
 * A premium is owed on hours worked past the line. Once the hours
 * accepted in a week are at or under the line, the week as accepted no
 * longer goes over it, so nothing in what is paid is "overtime" on any
 * reading of the acceptance — and carried all the way down the rule has
 * no floor: four hours accepted of forty-five would be four hours at
 * time and a half. Nobody has decided what a premium on such a week is,
 * so this does not decide it. The week's hours are paid at straight time
 * — the one figure every possible answer shares — its premium is held,
 * and the week says so. That is `underTheLine` below; the options are the
 * founder's to choose between.
 *
 * ── More accepted than worked ─────────────────────────────────────────
 *
 * Nothing can be cut. The hours filed are paid — an hour nobody worked
 * is not an hour anybody can put on a day — and the sheet says so.
 *
 * Pure. No database, no rates: the caller prices the days it is handed.
 */

import type { AcceptedCut, DayBands } from '@/lib/periods'
import { weekStart } from '@/lib/overtime'

const r2 = (n: number): number => Math.round(n * 100) / 100

/**
 * The sheet's days, banded: ordinary worked hours, paid leave, and hours
 * over the weekly line. `afterHours` null draws no line.
 *
 * `days` is the sheet's own map — its hours include any paid leave that
 * day, as `leaveDays` says.
 */
export function payBands(
  days: Record<string, number> | null | undefined,
  leaveDays: Record<string, number> | null | undefined,
  afterHours: number | null
): DayBands[] {
  const leave = leaveDays ?? {}
  const running = new Map<string, number>()
  const out: DayBands[] = []
  const sorted = Object.entries(days ?? {})
    .map(([k, h]) => ({ day: k.slice(0, 10), key: k, hours: Number(h) }))
    .filter((d) => Number.isFinite(d.hours) && d.hours > 0)
    .sort((a, b) => a.day.localeCompare(b.day))
  for (const d of sorted) {
    const week = weekStart(d.day)
    const onLeave = Math.min(Math.max(Number(leave[d.key] ?? leave[d.day]) || 0, 0), d.hours)
    const worked = r2(d.hours - onLeave)
    const before = running.get(week) ?? 0
    const after = r2(before + worked)
    running.set(week, after)
    const over = afterHours == null ? 0 : r2(Math.max(0, after - Math.max(afterHours, before)))
    out.push({ day: d.day, week, regular: r2(worked - over), leave: onLeave, over })
  }
  return out
}

/** One week of a sheet, as filed and as paid. */
export interface PayWeek {
  weekOf: string
  /** Worked hours filed this week, and how many of them went over the line. */
  filedWorked: number
  filedOver: number
  /** What is paid this week: ordinary worked hours, paid leave, hours over the line. */
  regular: number
  leave: number
  over: number
  /**
   * True where the week as filed went over the line and, as accepted, no
   * longer does. Its hours are paid at straight time and its premium is
   * held: see the note at the top.
   */
  underTheLine: boolean
}

export interface PayCut {
  /** The days paid, banded, after the cut. Only the days the acceptance covers. */
  days: DayBands[]
  weeks: PayWeek[]
  /** Hours on the covered days, as filed. */
  filed: number
  /** Hours paid: never more than accepted, never more than filed. */
  paid: number
  /** Hours accepted, where an acceptance said something other than every hour filed. */
  accepted: number | null
  /** Accepted more than was filed: the hours filed are paid. */
  moreThanFiled: boolean
}

/**
 * Take what the employer did not accept off the days, ordinary hours
 * first, latest day first, never the hours over the line while an
 * ordinary hour is left.
 *
 * `accepted` null pays every hour filed. The week is judged whole
 * against the line before anything is cut: which hours somebody
 * accepted does not change which hours took the week over.
 */
export function payCut(bands: readonly DayBands[], accepted: AcceptedCut | null, afterHours: number | null): PayCut {
  const covered = [...bands]
    .filter((d) => !accepted || ((!accepted.from || d.day >= accepted.from) && (!accepted.to || d.day <= accepted.to)))
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((d) => ({ ...d }))

  const filed = r2(covered.reduce((n, d) => n + d.regular + d.leave + d.over, 0))
  let cut = accepted ? r2(filed - Math.max(0, accepted.hours)) : 0

  // 1. Ordinary hours, latest day first: worked, then paid leave.
  for (let i = covered.length - 1; i >= 0 && cut > 0; i--) {
    const fromWorked = Math.min(cut, covered[i].regular)
    covered[i].regular = r2(covered[i].regular - fromWorked)
    cut = r2(cut - fromWorked)
    const fromLeave = Math.min(cut, covered[i].leave)
    covered[i].leave = r2(covered[i].leave - fromLeave)
    cut = r2(cut - fromLeave)
  }
  // 2. Only once no ordinary hour is left: the hours over the line.
  for (let i = covered.length - 1; i >= 0 && cut > 0; i--) {
    const take = Math.min(cut, covered[i].over)
    covered[i].over = r2(covered[i].over - take)
    cut = r2(cut - take)
  }

  // Weeks: filed from every band of the week (judged whole), paid from
  // the covered days after the cut.
  const byWeek = new Map<string, PayWeek>()
  const at = (w: string) => {
    if (!byWeek.has(w)) {
      byWeek.set(w, { weekOf: w, filedWorked: 0, filedOver: 0, regular: 0, leave: 0, over: 0, underTheLine: false })
    }
    return byWeek.get(w)!
  }
  for (const d of bands) {
    const w = at(d.week)
    w.filedWorked = r2(w.filedWorked + d.regular + d.over)
    w.filedOver = r2(w.filedOver + d.over)
  }
  for (const d of covered) {
    const w = at(d.week)
    w.regular = r2(w.regular + d.regular)
    w.leave = r2(w.leave + d.leave)
    w.over = r2(w.over + d.over)
  }
  const weeks = [...byWeek.values()].sort((a, b) => a.weekOf.localeCompare(b.weekOf))
  for (const w of weeks) {
    w.underTheLine = afterHours != null && w.over > 0 && r2(w.regular + w.over) <= afterHours
  }

  const paid = r2(covered.reduce((n, d) => n + d.regular + d.leave + d.over, 0))
  return {
    days: covered.filter((d) => d.regular + d.leave + d.over > 0),
    weeks,
    filed,
    paid,
    accepted: accepted ? accepted.hours : null,
    moreThanFiled: !!accepted && accepted.hours > filed + 0.005,
  }
}

/** The days paid, as a sheet's day map — hours including leave — and its leave. */
export function paidDayMaps(cut: PayCut): { days: Record<string, number>; leaveDays: Record<string, number> } {
  const days: Record<string, number> = {}
  const leaveDays: Record<string, number> = {}
  for (const d of cut.days) {
    days[d.day] = r2(d.regular + d.leave + d.over)
    if (d.leave > 0) leaveDays[d.day] = d.leave
  }
  return { days, leaveDays }
}

/**
 * The employer's acceptance of a sheet, as pay reads it: the one live
 * EMPLOYER_ACCEPTANCE on the week.
 *
 * `null` pays every hour filed — the sheet was accepted as filed, or
 * accepted by the columns that predate the ledger with no figure of
 * their own. `'MANY'` is more than one standing acceptance, where nothing
 * says which governs; the sheet is not paid on a guess.
 */
export function acceptanceForPay(
  assertions: ReadonlyArray<{ role: string; hours: unknown; coversFrom?: Date | null; coversTo?: Date | null; companyId?: string }>,
  sheet: { periodStart: Date; periodEnd: Date; acceptedHours?: unknown },
  payerCompanyId?: string | null
): AcceptedCut | null | 'MANY' {
  let mine = assertions.filter((a) => a.role === 'EMPLOYER_ACCEPTANCE')
  if (payerCompanyId && mine.some((a) => a.companyId === payerCompanyId)) {
    mine = mine.filter((a) => a.companyId === payerCompanyId)
  }
  if (mine.length > 1) return 'MANY'
  if (mine.length === 1) {
    const a = mine[0]
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const whole =
      (!a.coversFrom || a.coversFrom <= sheet.periodStart) && (!a.coversTo || a.coversTo >= sheet.periodEnd)
    return {
      hours: Number(a.hours),
      from: whole || !a.coversFrom ? null : iso(a.coversFrom),
      to: whole || !a.coversTo ? null : iso(a.coversTo),
    }
  }
  // The column that predates the ledger, where no assertion carries it.
  return sheet.acceptedHours != null ? { hours: Number(sheet.acceptedHours), from: null, to: null } : null
}

const longDay = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
const hrs = (n: number) => `${n} ${n === 1 ? 'hour' : 'hours'}`

/**
 * What the cut did, in sentences a payroll clerk can check. Null where
 * every hour filed is paid.
 */
export function payCutSays(
  cut: PayCut,
  who: { personName: string; employerName?: string | null }
): string | null {
  const parts: string[] = []
  const employer = who.employerName ?? 'The employer'
  if (cut.moreThanFiled) {
    parts.push(
      `${employer} accepted ${hrs(cut.accepted!)} and ${who.personName} filed ${hrs(cut.filed)}, so the ${cut.filed} ` +
        `filed are paid: an hour nobody filed is on no day to pay it on.`
    )
  } else if (cut.accepted != null && cut.paid < cut.filed) {
    parts.push(
      `${employer} accepted ${cut.accepted} of the ${cut.filed} hours ${who.personName} filed, so ${cut.accepted} are paid. ` +
        `The ${r2(cut.filed - cut.paid)} not accepted come off ordinary hours first, from the last day back, so hours over ` +
        `the line keep their premium.`
    )
  }
  return parts.length ? parts.join(' ') : null
}

/**
 * A week that, as accepted, no longer goes over the line: why its hours
 * are paid at straight time and its premium is held.
 */
export function heldSays(
  w: PayWeek,
  who: { personName: string; employerName?: string | null },
  afterHours: number | null
): string {
  const employer = who.employerName ?? 'the employer'
  return (
    `In the week of ${longDay(w.weekOf)}, ${who.personName} worked ${hrs(w.filedWorked)}, ${w.filedOver} over the ` +
    `${afterHours}-hour line, and ${employer} accepted ${r2(w.regular + w.over)} of them. As accepted, the week no ` +
    `longer goes over the line, and nobody has decided whether the ${hrs(w.over)} worked past it still earn a ` +
    `premium. They are paid at straight time and the premium is held until that is decided.`
  )
}

/**
 * The acceptance as it falls on some of a sheet's days — the days one
 * buy line was in force for, where a line changed mid-sheet.
 *
 * The cut is taken on the whole sheet, the way the employer accepted
 * it, and the days asked about keep what the whole-sheet cut left on
 * them. Where they are every day of the sheet the acceptance is
 * returned as it is.
 */
export function acceptedOn(
  all: Record<string, number>,
  leaveDays: Record<string, number> | null | undefined,
  afterHours: number | null,
  accepted: AcceptedCut | null,
  mine: Record<string, number>
): AcceptedCut | null {
  if (!accepted) return null
  const mineDays = Object.keys(mine).map((k) => k.slice(0, 10))
  const allDays = Object.keys(all).map((k) => k.slice(0, 10))
  if (mineDays.length === allDays.length) return accepted
  const whole = paidDayMaps(payCut(payBands(all, leaveDays, afterHours), accepted, afterHours))
  return { hours: r2(mineDays.reduce((n, d) => n + (whole.days[d] ?? 0), 0)), from: null, to: null }
}

/**
 * Everything pay needs from one sheet on one line, in one call: the days
 * to pay straight time on, and the acceptance the premium is priced from.
 * The run, the screen and back pay each call this, so the straight time
 * and the premium are cut in the same place.
 */
export function paySheet(i: {
  all: Record<string, number>
  mine: Record<string, number>
  leaveDays: Record<string, number> | null | undefined
  afterHours: number | null
  accepted: AcceptedCut | null
}): { accepted: AcceptedCut | null; cut: PayCut; days: Record<string, number>; leaveDays: Record<string, number> } {
  const accepted = acceptedOn(i.all, i.leaveDays, i.afterHours, i.accepted, i.mine)
  const leaveMine = Object.fromEntries(
    Object.entries(i.leaveDays ?? {}).filter(([d]) => Object.keys(i.mine).some((k) => k.slice(0, 10) === d.slice(0, 10)))
  )
  const cut = payCut(payBands(i.mine, leaveMine, i.afterHours), accepted, i.afterHours)
  const paid = paidDayMaps(cut)
  return { accepted, cut, days: paid.days, leaveDays: paid.leaveDays }
}
