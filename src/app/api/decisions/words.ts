/**
 * The queue's units, said in words.
 *
 * The queue wrote "Rolloff in 18d", "40h · through Brightmoor" and "3d
 * since submitted", and every reader reworded them on its own: the Today
 * page through `plainUnits`, Ask Etyme through a pattern on the title.
 * Two readers rewording one text is two texts the day one of them
 * changes. So the queue says it once, the way a person says it, and the
 * readers print what it wrote (simulation, 2026-10-20).
 *
 * No database and no clock in here, so the tests run it directly.
 */

/** "1 day", "18 days". */
export function daysSays(n: number): string {
  const d = Math.max(0, Math.floor(n))
  return `${d} ${d === 1 ? 'day' : 'days'}`
}

/** "1 hour", "40 hours", "37.5 hours". */
export function hoursSays(h: number | string | { toString(): string }): string {
  const n = Number(h)
  const shown = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
  return `${shown} ${n === 1 ? 'hour' : 'hours'}`
}

/** "today", "yesterday", "3 days ago" — how long since something happened. */
export function agoSays(days: number): string {
  const d = Math.max(0, Math.floor(days))
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${daysSays(d)} ago`
}

/**
 * A roll-off's title: "Rolls off in 18 days — Felix Brenner", or today
 * and tomorrow said as such. The name stays after the dash, where every
 * reader of the queue looks for it.
 */
export function rollsOffTitle(daysLeft: number, personName: string): string {
  const d = Math.max(0, Math.ceil(daysLeft))
  const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${daysSays(d)}`
  return `Rolls off ${when} — ${personName}`
}
