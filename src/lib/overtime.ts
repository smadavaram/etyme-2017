/**
 * A week over the line is worth more than a week under it.
 *
 * ── Why a week, and not a timesheet ──────────────────────────────────
 *
 * Overtime is a weekly fact. Forty-five hours in one week is five hours
 * of overtime; forty-five hours spread over two weeks is none. A
 * timesheet in this product is usually a week, so "per timesheet" looks
 * equivalent — right up to the semi-monthly client, where a period
 * holds two and a bit weeks and the same arithmetic quietly pays
 * overtime on hours nobody worked overtime for.
 *
 * So this reads the daily hours a timesheet already carries and groups
 * them into real weeks. A period that straddles a week boundary is
 * split at the boundary, not at the period edge, and each week is
 * judged on its own.
 *
 * ── Where the week starts ────────────────────────────────────────────
 *
 * Monday. The Fair Labor Standards Act lets an employer pick any fixed
 * seven-day workweek and most US staffing runs Monday to Sunday, which
 * is also what the cycle engine already assumes for a weekly period.
 * One default, consistently, rather than a setting nobody will set —
 * and the day is named here so the first client who needs Sunday has
 * one line to change instead of a search.
 *
 * ── Straight time is the default ─────────────────────────────────────
 *
 * `afterHours: null` means no overtime, and it is what a contract gets
 * unless somebody says otherwise. Most corp-to-corp work is straight
 * time, and a rate that multiplies itself because nobody filled in a
 * field is the kind of error that reaches an invoice before anybody
 * notices.
 */

export interface OvertimePolicy {
  /** Hours in a week past which overtime applies. Null is straight time. */
  afterHours: number | null
  /** Basis points of the rate. 15000 is time and a half. */
  multiplierBps: number
}

export const STRAIGHT_TIME: OvertimePolicy = { afterHours: null, multiplierBps: 15_000 }

export interface Split {
  regularHours: number
  overtimeHours: number
  /** Week beginning (Monday, ISO date) → hours in it. For the record. */
  weeks: { weekOf: string; hours: number; overtimeHours: number }[]
}

/** The Monday on or before this day. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  // getUTCDay: 0 Sunday … 6 Saturday. Monday is the start, so Sunday
  // belongs to the week that began six days earlier.
  const back = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - back)
  return d.toISOString().slice(0, 10)
}

/**
 * Split a timesheet's daily hours into regular and overtime.
 *
 * `days` is the map the timesheet already stores: ISO date → hours.
 */
export function splitWeeks(days: Record<string, number>, policy: OvertimePolicy): Split {
  const byWeek = new Map<string, number>()
  for (const [day, hours] of Object.entries(days ?? {})) {
    const n = Number(hours)
    if (!Number.isFinite(n) || n <= 0) continue
    const week = weekStart(day)
    byWeek.set(week, (byWeek.get(week) ?? 0) + n)
  }

  const weeks = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekOf, hours]) => ({
      weekOf,
      hours,
      overtimeHours: policy.afterHours == null ? 0 : Math.max(0, hours - policy.afterHours),
    }))

  const overtimeHours = weeks.reduce((n, w) => n + w.overtimeHours, 0)
  const regularHours = weeks.reduce((n, w) => n + w.hours, 0) - overtimeHours
  return { regularHours, overtimeHours, weeks }
}

/**
 * What a split is worth at a rate, in cents.
 *
 * Rounded once, at the end of each band, rather than per day — rounding
 * forty times and adding it up is how a line disagrees with the invoice
 * it is on by a few cents, which nobody can explain and everybody has
 * to reconcile.
 */
export function valueOf(split: Split, rateCents: number, policy: OvertimePolicy): {
  regularCents: number
  overtimeCents: number
  totalCents: number
} {
  const regularCents = Math.round(split.regularHours * rateCents)
  const overtimeCents = Math.round(split.overtimeHours * rateCents * (policy.multiplierBps / 10_000))
  return { regularCents, overtimeCents, totalCents: regularCents + overtimeCents }
}

/**
 * The whole job in one call: hours in, money out.
 *
 * Every place that turns a timesheet into money goes through this, so
 * an invoice, a budget and a three-way match cannot disagree about what
 * a week was worth.
 */
export function valueOfWeek(
  days: Record<string, number>,
  rateCents: number,
  policy: OvertimePolicy
): { split: Split; regularCents: number; overtimeCents: number; totalCents: number } {
  const split = splitWeeks(days, policy)
  return { split, ...valueOf(split, rateCents, policy) }
}

/** The policy a contract or requirement carries, read safely. */
export function policyOf(row: {
  overtimeAfterHours?: number | null
  overtimeMultiplierBps?: number | null
} | null | undefined): OvertimePolicy {
  return {
    afterHours: row?.overtimeAfterHours ?? null,
    multiplierBps: row?.overtimeMultiplierBps ?? 15_000,
  }
}

/** What the terms say, for a screen. */
export function says(policy: OvertimePolicy): string {
  if (policy.afterHours == null) return 'Straight time — every hour at the same rate.'
  const x = policy.multiplierBps / 10_000
  const word = x === 1.5 ? 'time and a half' : x === 2 ? 'double time' : `${x}×`
  return `Over ${policy.afterHours} hours in a week is ${word}.`
}
