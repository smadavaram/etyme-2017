/**
 * Dates for seeded worlds, counted in whole days from now.
 *
 * Shared by the world seed and the programme seed so the two cannot
 * disagree about what "today" is — a timesheet written by one and looked
 * up by the other has to land on the same midnight.
 */

/**
 * Whole days, anchored to midnight UTC.
 *
 * This was `Date.now() + n * 86_400_000`, which made every date carry the
 * time of day the seed happened to run at. A second run computed
 * different timestamps, so the "does this timesheet already exist" lookup
 * missed, fresh weeks were written, and their invoice collided with the
 * first run's number. The seed claimed to be idempotent and was not —
 * which only showed up on the second call.
 *
 * Normalised, a re-run on the same day is a true no-op, and a re-run
 * later adds that period rather than colliding with it.
 */
export const day = (n: number): Date => {
  const d = new Date(Date.now() + n * 86_400_000)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

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

/** An hour on a working day, absolute. Same normalisation as `day`. */
export const at = (n: number, hourUtc: number): Date =>
  new Date(weekday(day(n), n < 0).getTime() + hourUtc * 3_600_000)
