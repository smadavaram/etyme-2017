/**
 * What rate was in force on a given day.
 *
 * The contract is the authority on price. An invoice that disagrees with it
 * is wrong, not merely unusual — which is only true if the contract can
 * express the thing that actually happens: rates change mid-engagement.
 *
 * Without effective dating there are two bad options and no good one. Update
 * the contract rate and every past invoice retroactively disagrees with it.
 * Leave it and every future invoice fails. The waiver that was reached for
 * instead — "AP said this one is fine" — records the new rate in a free-text
 * note, so next month's invoice fails identically and gets waived again, and
 * the real price of the engagement lives nowhere a system can read.
 *
 * So the rate is resolved as of the work date, from APPROVED amendments
 * only. A proposed change does not bill until somebody with authority has
 * agreed to it, which is what makes the invoice check enforceable rather
 * than advisory.
 */

import { DEFAULT_CURRENCY, compact, rate } from '@/lib/money-display'

export interface RatePeriod {
  id: string
  rateCents: number
  fromDate: Date
  /** null means open-ended — in force until something supersedes it. */
  toDate: Date | null
  approvalState: string
}

export interface RateResolution {
  rateCents: number
  /** Which amendment supplied it, or null when it came from the contract. */
  periodId: string | null
  source: 'AMENDMENT' | 'CONTRACT'
}

/**
 * The rate in force on `asOf`.
 *
 * Falls back to the contract's own rate when no amendment covers that date,
 * which is the ordinary case: most engagements never change price.
 *
 * Where amendments overlap — they should not, but data is data — the one
 * starting latest wins, on the reasoning that the most recent agreement
 * about a period is the operative one.
 */
export function rateInForce(
  contractRateCents: number,
  periods: RatePeriod[],
  asOf: Date
): RateResolution {
  const applicable = periods
    .filter(p => p.approvalState === 'APPROVED')
    .filter(p => p.fromDate <= asOf)
    .filter(p => p.toDate === null || p.toDate >= asOf)
    .sort((a, b) => b.fromDate.getTime() - a.fromDate.getTime())

  const winner = applicable[0]
  return winner
    ? { rateCents: winner.rateCents, periodId: winner.id, source: 'AMENDMENT' }
    : { rateCents: contractRateCents, periodId: null, source: 'CONTRACT' }
}

/**
 * A timesheet covers a period, and a rate change can land in the middle of
 * one. Billing the whole week at either rate is wrong; whichever way it goes
 * somebody is short.
 *
 * Rather than pretending this cannot happen, it is detected and named, so
 * the timesheet can be split at the boundary before it is billed.
 */
export function spansRateChange(
  periods: RatePeriod[],
  periodStart: Date,
  periodEnd: Date
): { spans: boolean; changeDate: Date | null } {
  const boundary = periods
    .filter(p => p.approvalState === 'APPROVED')
    .map(p => p.fromDate)
    .filter(d => d > periodStart && d <= periodEnd)
    .sort((a, b) => a.getTime() - b.getTime())[0]

  return { spans: Boolean(boundary), changeDate: boundary ?? null }
}

/**
 * Whether a proposed change needs somebody senior, and who.
 *
 * The same shape as requisition approval, and for the same reason: a rate
 * moving by a few percent at renewal is routine, and one moving by a third
 * is a different agreement wearing the same contract number.
 */
export interface RateChangeAssessment {
  changePercent: number
  direction: 'INCREASE' | 'DECREASE' | 'NONE'
  needsApproval: boolean
  reason: string
}

/** Beyond this, a human looks at it. */
const AUTO_APPROVE_PERCENT = 5

export function assessRateChange(
  fromCents: number,
  toCents: number,
  /**
   * The contract's own, where the caller has it.
   *
   * These sentences printed a hard `$` in front of a rounded
   * `cents / 100`, so a contract in rupees read as dollars and
   * $145.50/hr read as $146/hr. `DEFAULT_CURRENCY` is the documented,
   * greppable gap for a caller that does not yet carry one — not a
   * decision that everything is dollars.
   */
  currency: string = DEFAULT_CURRENCY
): RateChangeAssessment {
  if (fromCents === toCents) {
    return { changePercent: 0, direction: 'NONE', needsApproval: false, reason: 'No change' }
  }

  const changePercent = fromCents === 0
    ? 100
    : Math.round(((toCents - fromCents) / fromCents) * 1000) / 10
  const direction = toCents > fromCents ? 'INCREASE' : 'DECREASE'
  const magnitude = Math.abs(changePercent)

  // A decrease costs the client nothing and needs no gate; the vendor
  // agreeing to it is the approval.
  if (direction === 'DECREASE') {
    return {
      changePercent, direction, needsApproval: false,
      reason: `Rate falls ${magnitude}% to ${rate(toCents, currency)}`,
    }
  }

  return {
    changePercent,
    direction,
    needsApproval: magnitude > AUTO_APPROVE_PERCENT,
    reason: magnitude > AUTO_APPROVE_PERCENT
      ? `Rate rises ${magnitude}% from ${compact(fromCents, currency)} to ${rate(toCents, currency)} — above the ${AUTO_APPROVE_PERCENT}% threshold`
      : `Rate rises ${magnitude}% to ${rate(toCents, currency)} — within the ${AUTO_APPROVE_PERCENT}% threshold`,
  }
}

// ── Every hour at the rate in force on the day it was worked ──────────
//
// `rateInForce` answers for one day. Everything that pays or prices a
// week asked it once, for the week's first day, so a rise effective on
// a Wednesday paid Wednesday to Friday at the old rate — and payroll's
// own run skipped the question entirely and paid every hour ever worked
// at today's rate. This is the one place a set of days becomes money.

/** A rate row as it is stored, for callers reading `RateHistory` directly. */
export interface RateRow {
  id: string
  rate: number
  fromDate: Date
  toDate: Date | null
  approvalState: string
}

export function ratePeriods(rows: RateRow[]): RatePeriod[] {
  return rows.map((r) => ({
    id: r.id,
    rateCents: r.rate,
    fromDate: r.fromDate,
    toDate: r.toDate,
    approvalState: r.approvalState,
  }))
}

/** One day's hours, and what each is worth. */
export interface PricedDay {
  day: string
  hours: number
  rateCents: number
  /** Which approved change supplied the rate, or null for the line's own. */
  periodId: string | null
}

/** A run of consecutive priced days at one rate. */
export interface RateSegment {
  from: string
  to: string
  hours: number
  rateCents: number
  cents: number
}

export interface DayPricing {
  hours: number
  /** Rounded once per rate, never per day. */
  cents: number
  days: PricedDay[]
  segments: RateSegment[]
  /** True where the days priced run across an approved change. */
  straddles: boolean
  /** The rate on the first day priced — what a single-rate reader shows. */
  firstRateCents: number
  /** Something true of the figure that the figure cannot say itself. */
  note: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100
const iso = (d: Date) => d.toISOString().slice(0, 10)
const dayDate = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`)

/**
 * Price a week (or any set of days) at the rate in force on each day.
 *
 * `days` is the sheet's daily hours. Where the hours to pay differ from
 * what the days add up to — an employer accepting thirty-eight of forty —
 * the cut comes off the latest days first, the same way the founder's
 * rule of 2026-09-29 takes a cut off the later bill first.
 *
 * That is the BILL's shape, and pay is cut the other way: ordinary hours
 * first, so the worker keeps their overtime (founder, 2026-09-29). The
 * payroll run, the payroll screen, the payroll file and back pay cut the
 * days in lib/money/pay-hours and hand this function the days already
 * cut, never `hours` beside daily hours. `within`
 * narrows the days to a pay period after the cut, so a week crossing
 * two periods is cut once and each period gets its own days of what is
 * left.
 *
 * A sheet with no daily hours cannot be split. It is priced at the rate
 * on its first day, and where that week crosses a change the note says
 * so rather than the figure pretending to be exact.
 */
export function priceByDay(input: {
  contractRateCents: number
  periods: RatePeriod[]
  days: Record<string, number> | null | undefined
  /** Hours to pay where they differ from the days' sum. */
  hours?: number | null
  within?: { start: Date; end: Date } | null
  /** The sheet's own bounds — used only where there are no daily hours. */
  periodStart?: Date | null
  periodEnd?: Date | null
}): DayPricing {
  const daily = Object.entries(input.days ?? {})
    .map(([day, h]) => ({ day: day.slice(0, 10), hours: Number(h) || 0 }))
    .filter((d) => d.hours > 0)
    .sort((a, b) => a.day.localeCompare(b.day))

  let priced: PricedDay[]
  let note: string | null = null

  if (daily.length === 0) {
    const hours = Number(input.hours ?? 0)
    const on = input.periodStart ?? input.within?.start ?? null
    if (!on || hours <= 0) return empty(input.contractRateCents)
    const r = rateInForce(input.contractRateCents, input.periods, on)
    priced = [{ day: iso(on), hours, rateCents: r.rateCents, periodId: r.periodId }]
    if (input.periodEnd && spansRateChange(input.periods, on, input.periodEnd).spans) {
      note =
        `No daily hours were recorded for the week of ${iso(on)}, and the rate changed inside it, ` +
        `so the whole week is priced at the rate on its first day.`
    }
  } else {
    // The cut, latest day first.
    const filed = daily.reduce((n, d) => n + d.hours, 0)
    let cut = input.hours != null ? round2(filed - Number(input.hours)) : 0
    const kept = daily.map((d) => ({ ...d }))
    for (let i = kept.length - 1; i >= 0 && cut > 0; i--) {
      const off = Math.min(cut, kept[i].hours)
      kept[i].hours = round2(kept[i].hours - off)
      cut = round2(cut - off)
    }

    priced = kept
      .filter((d) => d.hours > 0)
      .filter((d) => {
        if (!input.within) return true
        const at = dayDate(d.day)
        return at >= input.within.start && at <= input.within.end
      })
      .map((d) => {
        const r = rateInForce(input.contractRateCents, input.periods, dayDate(d.day))
        return { day: d.day, hours: d.hours, rateCents: r.rateCents, periodId: r.periodId }
      })
  }

  if (priced.length === 0) return empty(input.contractRateCents)

  const segments: RateSegment[] = []
  for (const d of priced) {
    const last = segments[segments.length - 1]
    if (last && last.rateCents === d.rateCents) {
      last.to = d.day
      last.hours = round2(last.hours + d.hours)
    } else {
      segments.push({ from: d.day, to: d.day, hours: d.hours, rateCents: d.rateCents, cents: 0 })
    }
  }

  // Rounded once per rate. Rounding every day and adding them is how a
  // pay line disagrees with its own hours × rate by a cent nobody can
  // explain.
  const byRate = new Map<number, number>()
  for (const d of priced) byRate.set(d.rateCents, (byRate.get(d.rateCents) ?? 0) + d.hours)
  const cents = [...byRate.entries()].reduce((n, [rate, h]) => n + Math.round(round2(h) * rate), 0)
  for (const s of segments) s.cents = Math.round(s.hours * s.rateCents)

  return {
    hours: round2(priced.reduce((n, d) => n + d.hours, 0)),
    cents,
    days: priced,
    segments,
    straddles: new Set(priced.map((d) => d.rateCents)).size > 1,
    firstRateCents: priced[0].rateCents,
    note,
  }
}

function empty(rateCents: number): DayPricing {
  return { hours: 0, cents: 0, days: [], segments: [], straddles: false, firstRateCents: rateCents, note: null }
}

/**
 * The rates a set of priced days was paid at, in a sentence.
 *
 * "16 hours at $66.00/hr to 30 June, then 24 hours at $70.00/hr from
 * 1 July." Only said where there was more than one rate — a single rate
 * is already on the row.
 */
export function segmentsSay(segments: RateSegment[], currency: string = DEFAULT_CURRENCY): string | null {
  if (segments.length < 2) return null
  const parts = segments.map(
    (s) => `${s.hours} hour${s.hours === 1 ? '' : 's'} at ${rate(s.rateCents, currency)} from ${s.from} to ${s.to}`
  )
  return `The rate changed inside these days: ${parts.join(', then ')}.`
}
