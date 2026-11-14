/**
 * The weeks her own page shows as held, read the way Payroll reads them.
 *
 * Found on a phone, 2026-11-14 (walker tpe, item 3): while Payroll held a
 * W2 worker's 46-hour week because nobody had recorded whether she is
 * exempt from overtime, her page read "Owed to you … 46 hours, none of
 * them overtime … $2,070.00", 46 x $45 at the usual rate. Payroll was
 * holding the week, and once the answer was recorded it paid $2,205.00
 * (40 x 45 + 6 x 67.50). A plausible wrong figure shown to a worker.
 *
 * So her page asks the same reader Payroll asks (`heldForExemption` in
 * lib/money/pay-line), on the same inputs: the pay line, the days filed
 * on it, the employer's acceptance cut by `paySheet`, and the line's own
 * rule for a week accepted short. And it lets a week go, as Payroll does
 * (src/app/api/payroll/route.ts), where an earlier run already paid every
 * day of it: that week was paid, and is not held.
 *
 * No database here: the caller passes what was paid.
 */
import { heldForExemption, type HeldWeek, type PayLine } from '@/lib/money/pay-line'
import { paySheet } from '@/lib/money/pay-hours'
import type { AcceptedCut } from '@/lib/periods'
import type { CutOvertime } from '@/lib/cut-overtime-choice'
import { weekStart } from '@/lib/overtime'

export interface HeldSheet {
  id: string
  /** The whole sheet's days. */
  allDays: Record<string, number>
  /** The days filed on this pay line. */
  days: Record<string, number>
  leaveDays: Record<string, number> | null | undefined
  /** The employer's acceptance as payroll reads it (`acceptanceForPay`). */
  accepted: AcceptedCut | null | 'MANY'
}

/**
 * Every week Payroll holds off pay on these sheets, newest last. A sheet
 * with more than one acceptance standing is priced by nobody, and is
 * never called held here: its own sentence says why it has no figure.
 */
export function heldWeeksFor(i: {
  line: PayLine
  sheets: readonly HeldSheet[]
  cutOvertime: CutOvertime
  /** Hours an earlier run paid on a day of a sheet; 0 where none. */
  paidHours: (sheetId: string, day: string) => number
}): HeldWeek[] {
  const out = new Map<string, HeldWeek>()
  for (const s of i.sheets) {
    if (s.accepted === 'MANY') continue
    const pay = paySheet({
      all: s.allDays, mine: s.days, leaveDays: s.leaveDays ?? {}, afterHours: i.line.afterHours,
      accepted: s.accepted, cutOvertime: i.cutOvertime,
    })
    const held = heldForExemption({
      line: i.line, days: s.days, leaveDays: s.leaveDays ?? {}, accepted: pay.accepted, cutOvertime: i.cutOvertime,
    }).filter((w) => !Object.entries(pay.days).every(([day, h]) =>
      weekStart(day.slice(0, 10)) !== w.weekOf || i.paidHours(s.id, day.slice(0, 10)) + 0.005 >= Number(h)))
    for (const w of held) {
      const was = out.get(w.weekOf)
      out.set(w.weekOf, was
        ? { weekOf: w.weekOf, workedHours: was.workedHours + w.workedHours, overHours: was.overHours + w.overHours }
        : w)
    }
  }
  return [...out.values()].sort((a, b) => a.weekOf.localeCompare(b.weekOf))
}

/**
 * Her words for a held week: who holds it, until what, and what happens
 * next. No amount and no pay day, because neither is known yet.
 * "Exempt" is the payroll person's word; she reads whether she is paid
 * overtime, which is what it decides.
 */
export function heldWeekSays(employer: string, hours: number, line: number): string {
  const h = Math.round(hours * 100) / 100
  return (
    `${employer} is holding this week, ${h} hour${h === 1 ? '' : 's'}, until it records whether you are paid overtime for hours over ${line}. ` +
    `It is then paid once, with any overtime owed.`
  )
}

/**
 * The line under "What you are owed" for held weeks, given each week's
 * Sunday already printed ("Oct 18"). Null where none is held.
 */
export function heldWeeksNote(employer: string, days: readonly string[], line: number): string | null {
  if (days.length === 0) return null
  const which = days.length === 1 ? `Your week of ${days[0]} is` : `${days.length} weeks are`
  return `${which} held until ${employer} records whether you are paid overtime for hours over ${line}.`
}
