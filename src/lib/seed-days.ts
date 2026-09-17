/**
 * Dates for seeded worlds, counted in whole days from the day the world
 * was born.
 *
 * Shared by the world seed and the program seed so the two cannot
 * disagree about what "today" is — a timesheet written by one and looked
 * up by the other has to land on the same midnight.
 */

/**
 * The day this world counts from, as milliseconds at midnight UTC.
 *
 * ── Why a world has a birthday ────────────────────────────────────────
 *
 * Every seeded date is "n days from today", and for a world seeded once
 * that is right: the demo is always four weeks of hours ending last
 * week. Re-seed the same world a week later, though, and today has
 * moved. Every week the seed looks for is a day or seven off the week it
 * wrote the first time, so every "does this already exist" lookup misses
 * and the seed writes a second copy of the lot — four more timesheets
 * per placement, a second invoice, a second payment. Exactly seven days
 * later it is worse than a duplicate: the weeks line up one step over,
 * the timesheets are found and the invoice is not, and the run dies on
 * `Unique constraint failed on (timesheetId, sellContractId)` halfway
 * through, leaving the world half rewritten.
 *
 * That is not a hypothetical. The founder seeds production once and
 * re-seeds whenever a name or a story changes, and the second seed is
 * on a different day by definition.
 *
 * So a world keeps the day it was born. `seedWorld` reads it off the
 * first company it ever wrote and every date is counted from there, so
 * the second run computes the same midnights as the first and finds
 * everything it would otherwise write again. The cost is that a world
 * seeded in March still reads as March; the fix for that is to drop the
 * world and seed it again, which is what the re-seed button on `/ready`
 * does not do and deliberately so — a re-seed must never be able to
 * delete a company somebody has been using.
 *
 * `__integration__/reseed-across-days.test.ts` is the sentence.
 */
let birthday: number | null = null

/** Midnight UTC of whatever day this date falls on. */
const midnight = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

/**
 * Count from this day rather than from today.
 *
 * Called once at the top of a seed with the day the world was first
 * written, or with nothing at all for a world that does not exist yet.
 */
export function anchorSeed(born?: Date | null): void {
  birthday = midnight(born ?? new Date())
}

/** Back to counting from today. For a test that wants a fresh world. */
export function forgetSeedAnchor(): void {
  birthday = null
}

/** The day this world calls today, for anything that has to say it. */
export function seedToday(): Date {
  return new Date(birthday ?? midnight(new Date()))
}

/**
 * Whole days from this world's birthday, at midnight UTC.
 *
 * This was `Date.now() + n * 86_400_000`, which made every date carry the
 * time of day the seed happened to run at. A second run computed
 * different timestamps, so the "does this timesheet already exist" lookup
 * missed, fresh weeks were written, and their invoice collided with the
 * first run's number. Normalizing to midnight made a re-run on the same
 * day a true no-op; the birthday above makes a re-run on any later day
 * one too.
 *
 * Midnight UTC plus a whole number of days is always midnight UTC —
 * there is no daylight saving in UTC — so the arithmetic stays exact.
 */
export const day = (n: number): Date =>
  new Date((birthday ?? midnight(new Date())) + n * 86_400_000)

/**
 * Onto a working day.
 *
 * The offsets are counted in whole days from whenever the seed runs, so
 * a screen booked "three days out" landed on a Saturday one run in seven,
 * and a screen recorded as held landed on a Sunday just as often. Nobody
 * interviews at the weekend, and a demo that says they did is one more
 * thing the founder has to explain away.
 *
 * Forward for a round still ahead, backward for one already held —
 * nudging a past round forward would move it into the future, where it
 * would read as upcoming.
 */
export const weekday = (d: Date, back: boolean): Date => {
  const g = d.getUTCDay()
  if (g !== 0 && g !== 6) return d
  const days = g === 6 ? (back ? 1 : 2) : back ? 2 : 1
  return new Date(d.getTime() + days * (back ? -86_400_000 : 86_400_000))
}

/** An hour on a working day, absolute. Same normalization as `day`. */
export const at = (n: number, hourUtc: number): Date =>
  new Date(weekday(day(n), n < 0).getTime() + hourUtc * 3_600_000)
