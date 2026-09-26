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
  if (input.hours > cap) return `${input.hours}h claimed on a ${cap}h-a-week role.`
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
