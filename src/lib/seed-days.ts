/**
 * Dates for seeded worlds, counted in whole days from the day the world
 * was born.
 *
 * Shared by the world seed and the program seed so the two cannot
 * disagree about what "today" is — a timesheet written by one and looked
 * up by the other has to land on the same midnight.
 */

import { DEFAULT_DAYS_OFF, DEFAULT_WEEK_DUE, deadlinesFor, isDayOff, type WeekDue } from '@/lib/days-off'
import { weekStart, weekEnd } from '@/lib/overtime'

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
 * delete a company somebody has been using. Dropping it is
 * `POST /api/seed-world/rebuild` (lib/seed-rebuild): the secret, a typed
 * phrase, and a refusal whenever anything real is tied to the world.
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
 * The plan year a seeded budget is written for: the year the world was
 * born, never a literal.
 *
 * It was the literal '2026' in the world seed, which is right for a world
 * born in 2026 and wrong for one rebuilt on 2 January 2027 — its weeks
 * are 2027's and its plan would have been last year's. The birthday is
 * what every other seeded date counts from, so the plan follows it.
 *
 * Why not also the year after, so a world born in September still reads
 * a budget in January: `/api/program/budget` reads the plan for the
 * current calendar year and sums every signed week ever, not the plan
 * year's. A next-year plan seeded today would, from 1 January, be read
 * against the whole of this year's work — a plausible wrong number where
 * "no budget" is at least a true blank. Rebuilding the world
 * (`/api/seed-world/rebuild`) gives it a new birthday and a plan for the
 * new year.
 */
export const seedPlanYear = (): string => String(seedToday().getUTCFullYear())

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
 *
 * Off the company's days off where the caller has them (`lib/days-off`);
 * Saturday and Sunday where it does not, which is every seeded firm today.
 */
export const weekday = (d: Date, back: boolean, daysOff: readonly number[] = DEFAULT_DAYS_OFF): Date => {
  // Seven days off is refused at the door; a week with none working is
  // read as the default rather than walked forever.
  const off = daysOff.length >= 7 ? DEFAULT_DAYS_OFF : daysOff
  let t = d.getTime()
  while (isDayOff(new Date(t), off)) t += back ? -86_400_000 : 86_400_000
  return t === d.getTime() ? d : new Date(t)
}

/** An hour on a working day, absolute. Same normalization as `day`. */
export const at = (n: number, hourUtc: number): Date =>
  new Date(weekday(day(n), n < 0).getTime() + hourUtc * 3_600_000)

// ── The seeded week ───────────────────────────────────────────────────

const isoOf = (d: Date): string => d.toISOString().slice(0, 10)
const atMidnight = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`)

/**
 * The Sunday-to-Saturday week `back` weeks ago, with its hours on Monday
 * to Friday.
 *
 * The week runs Sunday to Saturday (founder, 2026-09-30), and the edges
 * come from `weekStart` and `weekEnd` in lib/overtime — the one door the
 * overtime line, the filing week and this seed all read, so none of the
 * three can carry a week rule of its own. Saturday and Sunday are the
 * default days off, so the hours sit on the five weekdays inside it.
 *
 * Counted back from the week holding yesterday, not today. A world born
 * on a Sunday has a week that ended last night whose hours are not due
 * until tomorrow, and a seed that called that "last week" would sign it
 * before anybody could have filed it. Counting from yesterday, `back = 1`
 * is the latest week whose Saturday has passed by at least a day, on
 * every day the world can be born — the same five weekdays the seed
 * filed when its weeks ran Monday to Friday, so no figure moves.
 */
export function seedWeek(back: number, hours: number): { start: Date; end: Date; days: Record<string, number> } {
  const sunday = atMidnight(weekStart(isoOf(day(-1))))
  const start = new Date(sunday.getTime() - 7 * back * 86_400_000)
  const end = atMidnight(weekEnd(isoOf(start)))
  const each = spreadHours(hours, 5)
  const days: Record<string, number> = {}
  for (let d = 0; d < 5; d++) days[isoOf(new Date(start.getTime() + (d + 1) * 86_400_000))] = each[d]
  return { start, end, days }
}

/**
 * `hours` across `n` days, the odd hours on the later ones. Forty-four
 * over five days is 8, 9, 9, 9, 9 — never four eights and a twelve.
 */
export function spreadHours(hours: number, n: number): number[] {
  const each = Math.floor(hours / n)
  const out = Array.from({ length: n }, () => each)
  for (let i = n - 1, over = hours - each * n; over > 0; i--, over--) out[i] += 1
  return out
}

/**
 * When the week holding `anyDay` has its hours due and must be approved,
 * by the company's own answers (`weekDueFor` in lib/days-off) or the
 * defaults: due the Monday after the Saturday it ends on, approved by the
 * Wednesday. A seed that hand-added days would disagree with the setting
 * the first time a company changed it.
 */
export function weekDeadlines(anyDay: Date, due: WeekDue = DEFAULT_WEEK_DUE): { hoursDueOn: Date; approveByOn: Date } {
  return deadlinesFor(atMidnight(weekStart(isoOf(anyDay))), due)
}

/**
 * When each signature on a week lands, from the company's own week
 * settings (`deadlinesFor` in lib/days-off): the hours are due on
 * `hoursDueOn` — the Monday after the Saturday the week ends, by default
 * — and approved by `approveByOn`, the Wednesday.
 *
 * Every signature lands on the day the hours are due: the client first,
 * each firm below it an hour after the one above, the employer last. On
 * that day rather than the day after, because a world born on a Monday
 * has last week's hours due today, and an acceptance dated tomorrow is a
 * signature nobody has given yet.
 */
export function signingDays(anyDay: Date, due: WeekDue = DEFAULT_WEEK_DUE) {
  const { hoursDueOn, approveByOn } = weekDeadlines(anyDay, due)
  return {
    hoursDueOn,
    approveByOn,
    /** Step 0 is the client; each firm below it an hour later; the employer last. */
    signedAt: (step: number) => new Date(hoursDueOn.getTime() + step * 3_600_000),
  }
}
