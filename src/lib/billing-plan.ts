/**
 * What an order bills, and when.
 *
 * Two ways money falls due and most real projects use both: a schedule,
 * and a delivery. A monthly retainer with three milestone payments is
 * ordinary, and flattening them into one list loses which is which the
 * moment somebody asks why this month's invoice is larger.
 *
 * ── Time-based ───────────────────────────────────────────────────────
 *
 * Falls due because a date passed. The period arithmetic already exists
 * in `periods.ts` — nineteen kinds of cycle, five frequencies, anchors,
 * and what to do with a week that crosses a month end. Nothing here
 * reimplements it; this decides which periods an order covers and what
 * each one is worth.
 *
 * ── Milestone ────────────────────────────────────────────────────────
 *
 * Falls due because somebody accepted a thing. Never because a date
 * passed — a milestone whose due date has gone by and which nobody
 * accepted is late, not billable, and the difference is the whole reason
 * to track them.
 *
 * ── Why they are counted apart and shown together ────────────────────
 *
 * A finance team reconciling an invoice needs to see £40,000 of retainer
 * and £15,000 of delivery as two lines. A programme manager watching a
 * ceiling needs one number. Both, from the same function.
 */

import { periodsBetween, iso, type Frequency, type Anchor, type Straddle, type Period } from '@/lib/periods'

export type Basis = 'TIME' | 'MILESTONE' | 'BOTH'

export interface Order {
  basis: Basis
  frequency: Frequency | 'CUSTOM'
  anchor: Anchor
  straddle: Straddle
  /** Explicit period ends, where the frequency is CUSTOM. */
  customDates: Date[]
  startDate: Date
  endDate: Date | null
  /** What it may bill in total, cents. Null = uncapped. */
  ceilingCents: number | null
}

export interface Milestone {
  id: string
  name: string
  amountCents: number
  dueOn: Date | null
  /** The client agreeing it was delivered. Until this, not billable. */
  acceptedAt: Date | null
  status: string
}

export interface Due {
  kind: 'TIME' | 'MILESTONE'
  /** For a period, its end. For a milestone, when it was accepted. */
  on: Date
  label: string
  /** Null for a time period until hours are known. */
  amountCents: number | null
  /** The milestone, where this is one. */
  milestoneId?: string
  periodStart?: Date
  periodEnd?: Date
}

/**
 * Everything billable up to a date.
 *
 * Periods that have closed, and milestones somebody has accepted. A
 * period still running is not billable and a milestone nobody signed off
 * is not billable, however late it is.
 */
export function billableBy(
  order: Order,
  milestones: Milestone[],
  upTo: Date
): Due[] {
  const out: Due[] = []

  if (order.basis === 'TIME' || order.basis === 'BOTH') {
    for (const p of periodsOf(order, upTo)) {
      // Only closed periods. Billing a period that is still running is
      // how a client is invoiced for hours nobody has worked yet.
      if (p.end.getTime() > upTo.getTime()) continue
      out.push({
        kind: 'TIME',
        on: p.end,
        label: `${iso(p.start)} to ${iso(p.end)}`,
        amountCents: null,
        periodStart: p.start,
        periodEnd: p.end,
      })
    }
  }

  if (order.basis === 'MILESTONE' || order.basis === 'BOTH') {
    for (const m of milestones) {
      if (!m.acceptedAt) continue
      if (m.acceptedAt.getTime() > upTo.getTime()) continue
      if (m.status === 'CANCELLED' || m.status === 'INVOICED') continue
      out.push({
        kind: 'MILESTONE',
        on: m.acceptedAt,
        label: m.name,
        amountCents: m.amountCents,
        milestoneId: m.id,
      })
    }
  }

  return out.sort((a, b) => a.on.getTime() - b.on.getTime())
}

/**
 * The periods this order covers.
 *
 * A custom schedule is explicit dates rather than a rule, because some
 * clients bill on the 7th and the 22nd for reasons nobody remembers and
 * a frequency cannot express it.
 */
export function periodsOf(order: Order, upTo: Date): Period[] {
  if (order.frequency === 'CUSTOM') {
    const dates = [...order.customDates].sort((a, b) => a.getTime() - b.getTime())
    const out: Period[] = []
    let from = order.startDate
    for (const d of dates) {
      if (d.getTime() < order.startDate.getTime()) continue
      out.push({ start: from, end: d, label: `${iso(from)} to ${iso(d)}` })
      from = new Date(d.getTime() + 86_400_000)
    }
    return out
  }

  const to = order.endDate && order.endDate < upTo ? order.endDate : upTo
  return periodsBetween(order.startDate, to, {
    frequency: order.frequency,
    anchor: order.anchor,
    straddle: order.straddle,
    startedOn: order.startDate,
  })
}

export interface Position {
  /** What has been accepted or has closed, and may be billed. */
  billableCents: number
  /** Milestones agreed but not yet invoiced. */
  milestoneCents: number
  /** Milestones nobody has accepted yet. */
  outstandingCents: number
  ceilingCents: number | null
  /** What is left under the ceiling. Null where there is none. */
  headroomCents: number | null
  overCeiling: boolean
  says: string
}

/**
 * Where an order stands against its ceiling.
 *
 * Time-based amounts are unknown until hours are approved, so they are
 * passed in rather than guessed. Guessing them is how a ceiling check
 * blocks an invoice that was always going to be fine.
 */
export function position(
  order: Order,
  milestones: Milestone[],
  timeBilledCents: number
): Position {
  const accepted = milestones
    .filter((m) => m.acceptedAt && m.status !== 'CANCELLED')
    .reduce((n, m) => n + m.amountCents, 0)

  const outstanding = milestones
    .filter((m) => !m.acceptedAt && m.status !== 'CANCELLED')
    .reduce((n, m) => n + m.amountCents, 0)

  const billable = timeBilledCents + accepted
  const headroom = order.ceilingCents == null ? null : order.ceilingCents - billable
  const over = headroom != null && headroom < 0

  return {
    billableCents: billable,
    milestoneCents: accepted,
    outstandingCents: outstanding,
    ceilingCents: order.ceilingCents,
    headroomCents: headroom,
    overCeiling: over,
    says: positionSays(order, billable, accepted, outstanding, headroom, over),
  }
}

function positionSays(
  order: Order,
  billable: number,
  accepted: number,
  outstanding: number,
  headroom: number | null,
  over: boolean
): string {
  const m = (c: number) => `$${Math.round(c / 100).toLocaleString('en-US')}`

  if (over) {
    return `${m(billable)} against a ceiling of ${m(order.ceilingCents!)}. ${m(-headroom!)} over — somebody has to raise it or stop the work.`
  }

  const split =
    order.basis === 'BOTH' && accepted > 0
      ? ` ${m(billable - accepted)} on time, ${m(accepted)} on delivery.`
      : ''

  const tail =
    headroom == null
      ? ' No ceiling on this one.'
      : ` ${m(headroom)} left.`

  const waiting = outstanding > 0 ? ` ${m(outstanding)} of milestones nobody has accepted yet.` : ''

  return `${m(billable)} billable.${split}${tail}${waiting}`
}

/**
 * Whether a milestone may be invoiced.
 *
 * The date is not the test. A milestone due last month that nobody
 * signed off is late, and billing it is how a client stops paying
 * anything on time.
 */
export function mayBill(m: Milestone, now: Date): { ok: boolean; says: string } {
  if (m.status === 'CANCELLED') return { ok: false, says: `${m.name} was cancelled.` }
  if (m.status === 'INVOICED') return { ok: false, says: `${m.name} has already been invoiced.` }

  if (!m.acceptedAt) {
    const late = m.dueOn && m.dueOn.getTime() < now.getTime()
    return {
      ok: false,
      says: late
        ? `${m.name} was due ${iso(m.dueOn!)} and nobody has accepted it. Late, not billable.`
        : `${m.name} has not been accepted yet.`,
    }
  }

  return { ok: true, says: `${m.name} was accepted on ${iso(m.acceptedAt)}.` }
}
