/**
 * An exception is a week that does not fit the contract it is billed
 * to: more hours than the role runs, or days after the contract's last
 * day. Checked against the terms, so the person signing does not have
 * to notice it. WARN, never BLOCK — the client may approve anyway, with
 * a reason written down (Addendum E).
 */
export function timesheetFlag(input: {
  hours: number
  hoursPerWeek: number | null
  periodEnd: Date
  contractEnd: Date | null
}): string | null {
  const cap = input.hoursPerWeek ?? 40
  if (input.hours > cap) return `${input.hours}h claimed on a ${cap}h-a-week job.`
  if (input.contractEnd && input.periodEnd > input.contractEnd) {
    return `The week runs past the contract's last day, ${shortDate(input.contractEnd)}.`
  }
  return null
}

/** "Sep 3" — the way a person says a date. */
export function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** "Aug 30 – Sep 3" */
export function periodWord(from: Date, to: Date): string {
  return `${shortDate(from)} – ${shortDate(to)}`
}

/**
 * What is wrong with a week, if anything, in one sentence: the contract's
 * exception first (over the role's hours, past the last day), else the
 * anomaly the door recorded when the week was filed (a day over twelve
 * hours, a week over sixty). Null where the week is plain.
 */
export function weekFlag(input: {
  hours: number
  hoursPerWeek: number | null
  periodEnd: Date
  contractEnd: Date | null
  anomalyScore: number | null
  anomalyReason: string | null
}): string | null {
  return (
    timesheetFlag(input) ??
    (input.anomalyScore != null && input.anomalyScore > 0 ? input.anomalyReason ?? 'Flagged when it was filed.' : null)
  )
}

/**
 * What a signer is told when they press sign on a flagged week with no
 * reason: the flag, then what to do. The same sentence on every door,
 * because the approval route is the one that says it.
 */
export function flaggedWeekSays(flag: string): string {
  return `${flag} Say why this week is right before you sign it. The reason goes on your signature.`
}

/**
 * The order a list of weeks is read in: every flagged week before every
 * plain one, newest first within each.
 *
 * The client's timesheet page says "Flagged entries are shown first"
 * (`lib/page-framing`) and the list was ordered by date alone, so
 * Northbend's 44-hour week sat third behind two plain ones. Across the
 * whole list, not within a page: a flagged week on page two is exactly
 * the one nobody reads.
 */
export function flaggedFirst<T extends { id: string; periodStart: Date; flag: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if ((a.flag !== null) !== (b.flag !== null)) return a.flag !== null ? -1 : 1
    const d = b.periodStart.getTime() - a.periodStart.getTime()
    return d !== 0 ? d : a.id.localeCompare(b.id)
  })
}
