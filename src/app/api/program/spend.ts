/**
 * What a contingent program costs a month, and a year.
 *
 * ── Why this is one function and not four copies ─────────────────────
 *
 * The same assumption — an hourly bill rate times a flat 160-hour month
 * — was written out by hand in four places: the program dashboard's
 * headline spend, the same dashboard's per-supplier spend, the org
 * view's annualization, and the census page. Four copies of one guess is
 * four places for the guess to drift, and the census page's own comment
 * already named this file's arithmetic as the thing it had to agree
 * with. It now imports it instead.
 *
 * ── The assumption, said out loud ────────────────────────────────────
 *
 * 160 hours is four 40-hour weeks. It is a *stated assumption*, not a
 * measurement: a twenty-hour validation seat priced at 160 hours is
 * twice its real cost, and a program with overtime is under it. Nothing
 * here pretends otherwise — `basisSays` is exported beside the numbers
 * so a screen that prints a figure can print what it rests on, and
 * `monthlyHours` takes the real hours a week where a requirement stated
 * them.
 *
 * Where the true hours are known — a signed timesheet — this function is
 * the wrong one to call. Use the hours. This answers the forward-looking
 * question ("what will this program cost") where no week has been signed
 * yet, and that question has no exact answer.
 *
 * Minor units in, minor units out. Every rate in this system is cents;
 * a function that took cents and returned dollars is how the client
 * dashboard once divided by a hundred twice.
 *
 * ── Where this file should live ──────────────────────────────────────
 *
 * `src/lib/program-spend.ts`, beside every other piece of pure
 * arithmetic. It is here because `src/lib/domains.ts` carries no needle
 * for that path and that file is the architect's; a file under `src/`
 * with no owning domain fails
 * `__tests__/invariants/domain-ownership.test.ts` on the commit that
 * adds it. One line in DEMAND's `owns` list — `'lib/program-spend'` —
 * and this becomes a `git mv`. Flagged rather than done, because a
 * green suite matters more than a tidy path.
 */

/** Weeks in a month, for the purpose of a forward estimate. */
export const WEEKS_PER_MONTH = 4

/** Hours a full-time seat is assumed to work in a week. */
export const FULL_TIME_WEEK = 40

/**
 * The flat month every screen in the program has always used.
 *
 * Exported as a named constant so a reader grepping for 160 finds the
 * reason rather than four bare literals.
 */
export const HOURS_PER_MONTH = FULL_TIME_WEEK * WEEKS_PER_MONTH

export const MONTHS_PER_YEAR = 12

/**
 * Hours a month for one seat.
 *
 * Null or a nonsense number means nobody stated the hours, and a
 * full-time week is assumed — which is what every caller did before this
 * existed, with no way to tell that it had.
 */
export function monthlyHours(hoursPerWeek?: number | null): number {
  const week = hoursPerWeek && hoursPerWeek > 0 ? hoursPerWeek : FULL_TIME_WEEK
  return week * WEEKS_PER_MONTH
}

/**
 * What one seat costs a month, in minor units.
 *
 * Returns null where there is no rate to multiply. A zero rate is not a
 * price — the importer writes zero because the column is not nullable —
 * and a zero on a CFO's page reads as a free contractor rather than as a
 * blank.
 */
export function monthlySpendMinor(
  rateMinorPerHour: number | null | undefined,
  hoursPerWeek?: number | null
): number | null {
  if (rateMinorPerHour === null || rateMinorPerHour === undefined) return null
  if (rateMinorPerHour <= 0) return null
  return Math.round(rateMinorPerHour * monthlyHours(hoursPerWeek))
}

/**
 * What one seat costs a year, in minor units.
 *
 * `months` caps at twelve, so a three-year placement does not read as
 * three years of one year's budget. Null for the same reason as above.
 */
export function annualSpendMinor(
  rateMinorPerHour: number | null | undefined,
  opts?: { hoursPerWeek?: number | null; months?: number | null }
): number | null {
  const monthly = monthlySpendMinor(rateMinorPerHour, opts?.hoursPerWeek)
  if (monthly === null) return null
  const months = Math.min(opts?.months ?? MONTHS_PER_YEAR, MONTHS_PER_YEAR)
  return Math.round(monthly * months)
}

/**
 * What a list of seats costs a month, in minor units.
 *
 * A seat with no rate contributes nothing and is counted in `unpriced`
 * instead, so a total is never quietly the total of the priced ones
 * presented as the total of all of them.
 */
export function programMonthlySpend(
  seats: { rateMinorPerHour: number | null; hoursPerWeek?: number | null }[]
): { totalMinor: number; priced: number; unpriced: number } {
  let totalMinor = 0
  let priced = 0
  let unpriced = 0
  for (const s of seats) {
    const one = monthlySpendMinor(s.rateMinorPerHour, s.hoursPerWeek)
    if (one === null) {
      unpriced++
      continue
    }
    totalMinor += one
    priced++
  }
  return { totalMinor, priced, unpriced }
}

/** What the figure rests on, in a sentence a screen can print beside it. */
export function basisSays(what: string): string {
  return (
    `${what} at ${HOURS_PER_MONTH} hours a month — ${WEEKS_PER_MONTH} weeks of ${FULL_TIME_WEEK} hours — ` +
    `where nobody stated the hours for the seat. It is an estimate, not signed time.`
  )
}
