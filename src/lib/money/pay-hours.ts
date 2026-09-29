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
 *   41 accepted → 36 ordinary and 5 overtime, paid 41.
 *   40 accepted → 40 at straight time.
 *   38 accepted → 38 at straight time.
 *
 * ── An acceptance at or under the line is the hours worked ───────────
 *
 * The founder, 2026-09-29: where the employer accepts forty hours or
 * fewer of a longer week, those hours are paid at straight time. A
 * premium is owed on hours worked past the line, and an employer that
 * accepts thirty-eight of forty-five has said the week is thirty-eight
 * hours of work; a week of thirty-eight does not go over forty. Above
 * the line the worker keeps their overtime, by the ordinary-first cut
 * above.
 *
 *   1. The week is judged on the line in force — the contract's own
 *      line, or the law's forty where no contract drew one — never a
 *      forty typed here.
 *   2. It is judged on hours WORKED as accepted, never on paid leave,
 *      because leave is paid and not worked and never crosses the line
 *      (29 U.S.C. §207(e)(2)). That is the same count that took the week
 *      over the line as filed.
 *   3. Such a week carries nothing over the line: its hours worked past
 *      the line as filed are banded ordinary, so every reader that
 *      prices a premium from `over` finds none, and `underTheLine` says
 *      why in one sentence (`straightTimeSays`).
 *
 * This replaces a hold. Until the founder decided, such a week's
 * premium was held and the payroll file left the sheet off.
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
  /** Worked hours filed this week, how many of them went over the line, and paid leave filed. */
  filedWorked: number
  filedOver: number
  filedLeave: number
  /** What is paid this week: ordinary worked hours, paid leave, hours over the line. */
  regular: number
  leave: number
  over: number
  /**
   * True where the week as filed went over the line and the hours worked
   * as accepted are at or under it. Every hour of it is paid at straight
   * time and `over` is 0: an acceptance at or under the line is the hours
   * worked. See the note at the top.
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
  /** The weekly line the weeks were judged on. Null draws no line. */
  line: number | null
}

/**
 * Take what the employer did not accept off the days, ordinary hours
 * first, latest day first, never the hours over the line while an
 * ordinary hour is left. Then a week whose hours worked, as accepted,
 * are at or under the line is paid at straight time: nothing of it is
 * left over the line.
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
      byWeek.set(w, { weekOf: w, filedWorked: 0, filedOver: 0, filedLeave: 0, regular: 0, leave: 0, over: 0, underTheLine: false })
    }
    return byWeek.get(w)!
  }
  for (const d of bands) {
    const w = at(d.week)
    w.filedWorked = r2(w.filedWorked + d.regular + d.over)
    w.filedOver = r2(w.filedOver + d.over)
    w.filedLeave = r2(w.filedLeave + d.leave)
  }
  for (const d of covered) {
    const w = at(d.week)
    w.regular = r2(w.regular + d.regular)
    w.leave = r2(w.leave + d.leave)
    w.over = r2(w.over + d.over)
  }
  const weeks = [...byWeek.values()].sort((a, b) => a.weekOf.localeCompare(b.weekOf))
  // 3. A week whose hours worked, as accepted, are at or under the line
  //    is paid at straight time: its hours past the line as filed are
  //    ordinary hours of an accepted week that does not go over it.
  for (const w of weeks) {
    w.underTheLine = afterHours != null && w.over > 0 && r2(w.regular + w.over) <= afterHours
    if (!w.underTheLine) continue
    w.regular = r2(w.regular + w.over)
    w.over = 0
    for (const d of covered) {
      if (d.week !== w.weekOf || d.over <= 0) continue
      d.regular = r2(d.regular + d.over)
      d.over = 0
    }
  }

  const paid = r2(covered.reduce((n, d) => n + d.regular + d.leave + d.over, 0))
  return {
    days: covered.filter((d) => d.regular + d.leave + d.over > 0),
    weeks,
    filed,
    paid,
    accepted: accepted ? accepted.hours : null,
    moreThanFiled: !!accepted && accepted.hours > filed + 0.005,
    line: afterHours,
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
 *
 * "Hours over the line keep their premium" is said only where a week
 * still has hours over the line after the cut; a week accepted at or
 * under the line says instead, in its own sentence, that it is paid at
 * straight time.
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
    const keeps = cut.weeks.some((w) => w.over > 0)
    parts.push(
      `${employer} accepted ${cut.accepted} of the ${cut.filed} hours ${who.personName} filed, so ${cut.accepted} are paid. ` +
        `The ${r2(cut.filed - cut.paid)} not accepted come off ordinary hours first, from the last day back` +
        (keeps ? ', so hours over the line keep their premium.' : '.')
    )
    for (const w of cut.weeks) if (w.underTheLine) parts.push(straightTimeSays(w, cut.line))
  }
  return parts.length ? parts.join(' ') : null
}

/**
 * A week worked over the line and accepted at or under it, in one
 * sentence: how many hours were accepted of how many, and that they are
 * paid at straight time because the accepted week is not over the line.
 *
 *   "Week of July 13, 2026: 38 of 45 hours accepted; paid at straight
 *    time because the accepted week is not over 40."
 *
 * Where the week holds paid leave the count of hours worked is said
 * too, because the line is judged on hours worked and the acceptance on
 * every hour paid. `personName`, where given, opens the sentence — for
 * a note read away from the row that names the person.
 */
export function straightTimeSays(w: PayWeek, line: number | null, personName?: string | null): string {
  const accepted = r2(w.regular + w.leave + w.over)
  const filed = r2(w.filedWorked + w.filedLeave)
  const week = personName ? `${personName}, week of ${longDay(w.weekOf)}` : `Week of ${longDay(w.weekOf)}`
  const head = `${week}: ${accepted} of ${filed} hours accepted`
  if (w.leave > 0) {
    const worked = r2(w.regular + w.over)
    return (
      `${head}, ${w.leave} of them paid leave; paid at straight time because the ${worked} ${worked === 1 ? 'hour' : 'hours'} ` +
      `worked in the accepted week ${worked === 1 ? 'is' : 'are'} not over ${line}.`
    )
  }
  return `${head}; paid at straight time because the accepted week is not over ${line}.`
}

/** Each week of a cut paid at straight time because it was accepted at or under the line. */
export function straightTimeWeeks(cut: PayCut): Array<{
  weekOf: string
  /** Every hour accepted in the week, paid leave included. */
  accepted: number
  /** Every hour filed in the week, paid leave included. */
  filed: number
  /** Hours worked in the week as accepted — what was judged against the line. */
  worked: number
  line: number
  says: string
}> {
  if (cut.line == null) return []
  return cut.weeks
    .filter((w) => w.underTheLine)
    .map((w) => ({
      weekOf: w.weekOf,
      accepted: r2(w.regular + w.leave + w.over),
      filed: r2(w.filedWorked + w.filedLeave),
      worked: r2(w.regular + w.over),
      line: cut.line!,
      says: straightTimeSays(w, cut.line),
    }))
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
