import { rateInForce, ratePeriods, type RateRow } from '@/lib/contract-rate'
import { rate, compact, DEFAULT_CURRENCY } from '@/lib/money-display'
import { formatDayLong } from '@/lib/format-date'

/**
 * The rate a placement's card shows: the one in force today, and — where
 * an approved change put it there — a line saying since when and what it
 * was before.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The placement page showed the rate stored on the line. A change is not
 * written onto the line; it is an approved `RateHistory` row, and every
 * reader that pays or bills resolves the rate from those rows
 * (`rateInForce` in lib/contract-rate). So Rosa Delgado's pay line read
 * $66 an hour two months after her $70 had been approved and paid — the
 * one screen that described her placement disagreed with the payroll run
 * that paid it.
 *
 * This is not a second reader. It asks lib/contract-rate for today's
 * rate and for the rate the day before the change started, and turns
 * the two into a sentence.
 */

export interface RateToday {
  /** Minor units per hour, in force today. */
  cents: number
  /** The day the change behind it took effect, or null where the line's own rate stands. */
  since: string | null
  /** Minor units per hour in force the day before `since`, or null. */
  wasCents: number | null
  /** "$70/hr since July 29, 2026 — was $66", or null where nothing changed. */
  says: string | null
}

const DAY_MS = 86_400_000

function longDay(d: Date): string {
  return formatDayLong(d)
}

export function rateToday(
  lineRateCents: number,
  rows: RateRow[],
  today: Date,
  currency: string = DEFAULT_CURRENCY,
): RateToday {
  const periods = ratePeriods(rows)
  const now = rateInForce(lineRateCents, periods, today)
  const winner = now.periodId ? periods.find((p) => p.id === now.periodId) ?? null : null
  if (!winner) return { cents: now.rateCents, since: null, wasCents: null, says: null }

  // What was in force the day before, through the same reader. The
  // opening row a change writes behind itself starts on the line's first
  // day and has nothing before it but the line's own rate — the same
  // number — so it says nothing, which is right: nothing changed.
  const before = rateInForce(lineRateCents, periods, new Date(winner.fromDate.getTime() - DAY_MS))
  if (before.rateCents === now.rateCents) {
    return { cents: now.rateCents, since: null, wasCents: null, says: null }
  }
  return {
    cents: now.rateCents,
    since: winner.fromDate.toISOString().slice(0, 10),
    wasCents: before.rateCents,
    says: `${rate(now.rateCents, currency)} since ${longDay(winner.fromDate)} — was ${compact(before.rateCents, currency)}`,
  }
}
