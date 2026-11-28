import { acceptanceOf, whatTheRungBills, type Signature } from '@/lib/money/rung-billing'
import { billableInPeriod } from '@/lib/periods'
import { splitWeeks, valueOf, type Decision, type OvertimePolicy, type Split } from '@/lib/overtime'

/**
 * What one week is worth on one line, read on the hours that line's payer
 * accepted, the way the bill on that line will price it.
 *
 * Walk 8, 9 November 2026: Computer Systems accepted 38 of Helena Marsh's
 * 40 hours, and its Timesheets list went on reading the week as
 * "40.0 · $118/hr · $4,720", and the approve route's reply said
 * `billAmount` 4,720. At 38 × $118 it is $4,484. The founder's rule
 * (2026-09-28): a firm bills only the hours the firm above it accepted,
 * and the cut comes off overtime first, and off the later bill first.
 *
 * Nothing is priced here. The reading of the payer's signature is
 * money's (`acceptanceOf`, `whatTheRungBills` in lib/money/rung-billing),
 * and the days are priced by money's `billableInPeriod` in lib/periods,
 * the one call the bill generator and the three-way check make, over the
 * week's own dates, the same whole-week call `lib/money/week-overtime-terms`
 * makes for the order's posting. A week the payer has not signed, or
 * signed whole, is valued as filed, exactly as before.
 *
 * Where money's reading leaves a week off the bill rather than guess (two
 * acceptances on one week; more hours accepted than were worked over the
 * line or across a bill's edge), the value is null and money's own
 * sentence says why: a number nobody can stand behind is a blank. Pure.
 */

export interface WeekToPrice {
  periodStart: Date
  periodEnd: Date
  /** Hours filed: what was worked. */
  totalHours: number
  days: Record<string, number>
  leaveDays: Record<string, number>
  personName: string
  /** The line the hours are filed on, as money's reading of a signature needs it. */
  hoursContract: { companyId: string; clientCompanyId: string; endClientCompanyId: string | null }
  /** Every live signature on the week. Only the payer's is read. */
  assertions: Signature[]
}

export interface WeekWorth {
  /** The hours the payer's acceptance stands for, or the hours filed where it has none, or one of every hour. */
  hours: number
  /** The hours filed. */
  filed: number
  /** True where the payer accepted a number other than every hour filed. */
  differs: boolean
  /** What the week is worth at the rate, in its minor units. Null where there is no rate, or no figure to stand behind. */
  cents: number | null
  /** The bands the figure came from: the days as filed, or with the cut off them. */
  split: Split
  /** Money's sentence where the week is cut or left unpriced; null where it is priced as filed. */
  says: string | null
}

export function acceptedWorth(i: {
  week: WeekToPrice
  /** The firm that pays on the line being valued: its acceptance decides the hours. Null values the week as filed. */
  payer: { id: string; name: string } | null
  /** The line's rate in minor units; null where the reader is owed none. */
  rateCents: number | null
  policy: OvertimePolicy
  decisions: Decision[]
}): WeekWorth {
  const { week } = i
  const asWorked = splitWeeks(week.days, i.policy, { leaveDays: week.leaveDays, decisions: i.decisions })
  const filedValue = i.rateCents == null ? null : valueOf(asWorked, i.rateCents).totalCents
  const asFiled: WeekWorth = {
    hours: week.totalHours, filed: week.totalHours, differs: false, cents: filedValue, split: asWorked, says: null,
  }
  if (!i.payer) return asFiled

  const rungWeek = {
    periodStart: week.periodStart,
    periodEnd: week.periodEnd,
    totalHours: week.totalHours,
    days: week.days,
    personName: week.personName,
    hoursContract: week.hoursContract,
    assertions: week.assertions,
  }
  const signed = acceptanceOf(i.payer.id, rungWeek)
  const rung = whatTheRungBills({
    payerCompanyId: i.payer.id,
    payerName: i.payer.name,
    week: rungWeek,
    worked: {
      partial: false,
      overtimeHours: asWorked.overtimeHours,
      pendingHours: asWorked.pendingHours,
      bankedHours: asWorked.bankedHours,
    },
    afterHours: i.policy.afterHours,
  })

  switch (rung.kind) {
    case 'AS_WORKED':
    case 'WAITING':
      return asFiled
    case 'CUT': {
      const billed = billableInPeriod(
        { id: 'week', periodStart: week.periodStart, periodEnd: week.periodEnd, days: week.days, leaveDays: week.leaveDays, totalHours: week.totalHours },
        { start: week.periodStart, end: week.periodEnd, label: '' },
        'START',
        i.rateCents ?? 0,
        i.policy,
        i.decisions,
        rung.accepted
      )
      if (!billed) return { ...asFiled, hours: rung.accepted.hours, differs: true, cents: null, says: rung.says }
      return {
        hours: rung.accepted.hours, filed: week.totalHours, differs: true,
        cents: i.rateCents == null ? null : billed.value.totalCents, split: billed.split, says: rung.says,
      }
    }
    case 'STRAIGHT':
      // More accepted than worked on a straight, whole week: the hours
      // straight, rounded once, exactly as the bill prices it.
      return {
        hours: rung.hours, filed: week.totalHours, differs: true,
        cents: i.rateCents == null ? null : Math.round(rung.hours * i.rateCents), split: asWorked, says: rung.says,
      }
    case 'HELD': {
      const hours =
        signed.kind === 'CUT' || signed.kind === 'MORE_ON_SOME_DAYS' ? signed.accepted.hours
        : signed.kind === 'STRAIGHT' || signed.kind === 'WHOLE' ? signed.hours
        : week.totalHours
      return { hours, filed: week.totalHours, differs: Math.abs(hours - week.totalHours) >= 0.005, cents: null, split: asWorked, says: rung.says }
    }
  }
}

/**
 * The line under the hours on a row its payer accepted fewer of:
 * "You accepted 38 of the 40 hours filed: <the reason>." to the payer, and
 * "Computer Systems Inc accepted 38 of the 40 hours filed: <the reason>."
 * to the firm it pays, who bills on those hours. Where money left the
 * week unpriced, its sentence follows, so the blank value says why.
 */
export function acceptedRowSays(i: {
  byReader: boolean
  payerName: string
  hours: number
  filed: number
  note: string | null
  held: string | null
}): string {
  const who = i.byReader ? 'You' : i.payerName
  const why = i.note?.trim() ? `: ${i.note.trim().replace(/[.\s]+$/, '')}.` : '.'
  return `${who} accepted ${i.hours} of the ${i.filed} hours filed${why}` + (i.held ? ` ${i.held}` : '')
}
