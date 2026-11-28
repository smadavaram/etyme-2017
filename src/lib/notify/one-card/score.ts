/**
 * The order of the queue, for the one-card screen (record 130).
 *
 *   score = urgency × value × confidence
 *
 * Pure: no database, no clock. The day is passed in.
 *
 * - urgency is 1 over the days left, never more than 1 for a card due
 *   today, and 2 for a card past due. A decision item has no due date
 *   (the lead's ruling, 2026-11-26), so it falls back to the days it has
 *   been open: it counts as due OPEN_LIMIT_DAYS after the day it opened.
 * - value is the money at stake over the role's median; 1 until known.
 * - confidence is the skill checker's pass rate; 1 until a skill is graded.
 */

export const OPEN_LIMIT_DAYS = 7
export const LATE_URGENCY = 2

export interface Scorable {
  key: string
  /** The day it is owed, where the record has one. */
  dueOn: string | null
  /** The day it appeared, where the record has one. */
  openedOn: string | null
  /** The money at stake, in the row's own units; only its ratio to the median is used. */
  amount: number | null
  /** The skill checker's pass rate, 0 to 1; null until graded. */
  confidence: number | null
}

const DAY_MS = 86_400_000

/** A day as a whole number, from an ISO date or time; null where it is not one. */
export function dayNumber(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(t) ? null : Math.floor(t / DAY_MS)
}

/** Whole days from a moment's own UTC day, as `dayNumber`. */
export function today(now: Date): number {
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / DAY_MS)
}

/**
 * Days until it is owed: negative when past due. The due date where the
 * record has one, else the day it opened plus OPEN_LIMIT_DAYS. Null where
 * the row has neither.
 */
export function daysToDue(c: Pick<Scorable, 'dueOn' | 'openedOn'>, now: Date): number | null {
  const due = dayNumber(c.dueOn)
  if (due !== null) return due - today(now)
  const opened = dayNumber(c.openedOn)
  if (opened !== null) return opened + OPEN_LIMIT_DAYS - today(now)
  return null
}

/** Whole days a row has been open; null where it has no opening day. */
export function daysOpen(c: Pick<Scorable, 'openedOn'>, now: Date): number | null {
  const opened = dayNumber(c.openedOn)
  return opened === null ? null : Math.max(0, today(now) - opened)
}

export function urgencyOf(c: Pick<Scorable, 'dueOn' | 'openedOn'>, now: Date): number {
  const d = daysToDue(c, now)
  if (d === null) return 1
  if (d < 0) return LATE_URGENCY
  return 1 / Math.max(1, d)
}

/** The role's median amount among the cards that state one; null where none does. */
export function medianAmount(amounts: ReadonlyArray<number | null>): number | null {
  const known = amounts.filter((a): a is number => typeof a === 'number' && Number.isFinite(a) && a > 0).sort((a, b) => a - b)
  if (known.length === 0) return null
  const mid = Math.floor(known.length / 2)
  return known.length % 2 ? known[mid] : (known[mid - 1] + known[mid]) / 2
}

export function valueOf(c: Pick<Scorable, 'amount'>, median: number | null): number {
  if (median === null || median <= 0) return 1
  if (typeof c.amount !== 'number' || !Number.isFinite(c.amount) || c.amount <= 0) return 1
  return c.amount / median
}

export function confidenceOf(c: Pick<Scorable, 'confidence'>): number {
  const x = c.confidence
  return typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= 1 ? x : 1
}

export function scoreOf(c: Scorable, median: number | null, now: Date): number {
  return urgencyOf(c, now) * valueOf(c, median) * confidenceOf(c)
}

/** The queue, the card in focus first; a tie goes to the card open longest, then to its key. */
export function inOrder<T extends Scorable>(cards: readonly T[], now: Date): T[] {
  const median = medianAmount(cards.map((c) => c.amount))
  return cards
    .map((c) => ({ c, s: scoreOf(c, median, now), open: daysOpen(c, now) ?? 0 }))
    .sort((a, b) => b.s - a.s || b.open - a.open || a.c.key.localeCompare(b.c.key))
    .map((x) => x.c)
}
