/**
 * Which hours of one week are overtime and what each is worth, on the
 * line that bills it: the one answer the bill and the order's posting
 * both read.
 *
 * Found by the second screen walk, 2026-11-03: Northbend signed Lucía
 * Fernández's 44-hour week with the overtime at a premium. Pinnacle's bill
 * came out right, $4,508 (40 × $98 + 4 × $147), and the posting written at
 * the client's signature said $4,312 (44 × $98), because the posting
 * priced the hours at straight time and never read the decision. The
 * order's drawn figure and the bill disagreed by $196. Both now take the
 * week's terms from here, and its money from `billableInPeriod`.
 *
 * At the top of a chain, and on every direct placement, the answer is the
 * one given on this line's own leg at the multiplier chosen there. Below
 * the top it is the client's answer at this line's own multiplier
 * (`carriedOvertime`, the founder, 2026-10-19). Pure.
 */

import { lineFor, type Decision, type OvertimePolicy } from '@/lib/overtime'
import { carriedOvertime, type DecisionRow, type TopLeg } from '@/lib/money/client-overtime'
import { billableInPeriod, type AcceptedCut } from '@/lib/periods'

export interface WeekOvertimeTerms<R extends DecisionRow> {
  /** Where a rung below the top cannot read the client's answer: the sentence, and the week is not priced. */
  unreadable: string | null
  policy: OvertimePolicy
  decisions: Decision[]
  /** The decision rows that answered, for marking them billed. */
  answering: R[]
}

export function weekOvertimeTerms<R extends DecisionRow>(i: {
  rows: readonly R[]
  /** The line being billed. */
  line: { id: string; overtimeAfterHours?: number | null; overtimeMultiplierBps: number }
  requirement: { hoursPerWeek?: number | null } | null | undefined
  top: TopLeg | null
  /** True where this line is below the top of the chain over the hours. */
  belowTop: boolean
  personName: string
}): WeekOvertimeTerms<R> {
  const carried = i.belowTop ? carriedOvertime(i.rows, i.top, i.line.overtimeMultiplierBps, i.personName) : null
  const unreadable = carried && !carried.ok ? carried.says : null
  const ownLeg = i.rows.filter((d) => d.sellContractId === i.line.id)
  const answering = (carried?.ok ? (carried.rows as R[]) : ownLeg.length > 0 ? ownLeg : [...i.rows])
  // The line the week was decided against: the contract's own, else —
  // where somebody decided the week — the job's hours, the same line the
  // approval asked the question on.
  const policy = carried
    ? carried.ok ? carried.policy : { afterHours: null, multiplierBps: i.line.overtimeMultiplierBps }
    : lineFor(i.line, i.requirement, { stillToSign: false, decided: answering.length > 0 })
  const decisions: Decision[] = carried
    ? carried.ok ? carried.decisions : []
    : answering.map((d) => ({
        weekOf: d.weekOf.toISOString().slice(0, 10),
        treatment: d.treatment as Decision['treatment'],
        // The price comes from what was applied when somebody decided,
        // never from the contract's multiplier as it stands today.
        appliedBps: d.appliedBps,
        overtimeHours: Number(d.overtimeHours),
        accrualBps: d.accrualBps ?? undefined,
      }))
  return { unreadable, policy, decisions, answering }
}

/**
 * What the overtime adds to a signed week's straight time, on the line
 * that bills it: the difference between the week as its bill prices it
 * (`billableInPeriod`, the bill's own call, at the week's own terms) and
 * the same billed hours at the usual rate.
 *
 * The order's posting at a signature prices the hours signed at straight
 * time, day by day at the rate in force (`priceSheets`), and adds this,
 * so the drawn figure is the bill's figure: 44 hours with four at a
 * premium of 1.5 on a $98 line post $4,508, not $4,312. A week decided at
 * the same rate adds nothing; a week whose overtime was banked takes the
 * banked hours off, because they are billed later as leave and never
 * now. Hours over the line nobody has answered stay at straight time, as
 * they always posted; the bill leaves them off until somebody answers.
 * Pure.
 */
export function overtimeOnSignedWeek(i: {
  sheet: {
    periodStart: Date
    periodEnd: Date
    days: Record<string, number>
    leaveDays: Record<string, number>
    totalHours: number
  }
  /** The rate in force on the week's last day, in cents an hour. */
  rateCents: number
  terms: Pick<WeekOvertimeTerms<DecisionRow>, 'policy' | 'decisions'>
  /** What the signer took, where it is not every hour worked. */
  accepted: AcceptedCut | null
}): { addsCents: number; overtimeHours: number; bankedHours: number; multiplierBps: number | null } {
  const none = { addsCents: 0, overtimeHours: 0, bankedHours: 0, multiplierBps: null }
  if (i.rateCents <= 0 || i.terms.decisions.length === 0) return none
  const billed = billableInPeriod(
    { id: 'week', ...i.sheet },
    { start: i.sheet.periodStart, end: i.sheet.periodEnd, label: '' },
    'START',
    i.rateCents,
    i.terms.policy,
    i.terms.decisions,
    i.accepted
  )
  if (!billed) return none
  const s = billed.split
  const atStraight = Math.round((s.regularHours + s.leaveHours + s.overtimeHours + s.bankedHours) * i.rateCents)
  const bps = [...new Set(s.weeks.filter((w) => w.overtimeHours > 0 && w.appliedBps != null).map((w) => w.appliedBps!))]
  return {
    addsCents: billed.value.totalCents - atStraight,
    overtimeHours: s.overtimeHours,
    bankedHours: s.bankedHours,
    multiplierBps: bps.length === 1 ? bps[0] : null,
  }
}
