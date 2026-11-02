/**
 * A day as a person reads it, and nothing else.
 *
 * Moved out of `lib/consultant-portfolio` on 2026-09-30, which still
 * re-exports both. That module reaches the AI SDK (it loads it lazily
 * for one reader), and three regulatory libraries imported `plainDate`
 * from it — one of them, `lib/data-request`, is imported by a page the
 * browser loads, so `node:fs` landed in a client bundle and the
 * production build failed. A formatter a browser page needs must import
 * nothing a browser cannot run, so this file imports nothing at all.
 */

/**
 * The two formats, built once. `toLocaleDateString` builds a formatter on
 * every call, and a worker's page prints hundreds of days (the
 * page-timing pass, 2026-11-02); a formatter built once prints the same
 * words.
 */
const WITH_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const NO_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** "Jun 1, 2026", read in UTC because every stored day is midnight UTC. */
function plainDay(iso: string, withYear: boolean): string {
  return (withYear ? WITH_YEAR : NO_YEAR).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
}

/**
 * One day as a person reads it: "Jun 1, 2026". Null stays null, so a
 * missing date is never printed as a made-up one.
 */
export function plainDate(iso: string): string
export function plainDate(iso: string | null | undefined): string | null
export function plainDate(iso: string | null | undefined): string | null {
  return iso ? plainDay(iso, true) : null
}

/**
 * Two days as a person reads them: "Jun 1 – Jun 7, 2026", both years
 * named where they differ ("Dec 28, 2026 – Jan 3, 2027"), and one day
 * alone where the two are the same. Used for a week of hours as much as
 * for a placement, so every span on the worker's pages reads one way.
 */
export function daySpan(startIso: string, endIso: string): string {
  const start = startIso.slice(0, 10)
  const end = endIso.slice(0, 10)
  if (start === end) return plainDay(start, true)
  if (start.slice(0, 4) === end.slice(0, 4)) return `${plainDay(start, false)} – ${plainDay(end, true)}`
  return `${plainDay(start, true)} – ${plainDay(end, true)}`
}
