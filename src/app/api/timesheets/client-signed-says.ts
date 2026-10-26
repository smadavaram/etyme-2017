import { amount } from '@/lib/money-display'

/**
 * What the client is told when it signs a week, in its own words.
 *
 * The client pays for the week; it does not bill it. "Approved 40h —
 * $5,800.00 billable" is the supplier's word on the payer's screen (the
 * walk, 2026-10-22, on Helena Marsh's week at Northbend Athletic). So the
 * sentence says what happened and who bills the client for it: "Approved
 * Helena Marsh’s 40 hours for Oct 11–17. Computer Systems Inc bills you
 * $5,800.00 for them." The firm named is the one the client pays — the
 * contract it signed on — never a firm below it.
 *
 * Where the week carries no figure the second sentence is left out; a
 * guessed number is worse than none.
 *
 * Pure: no database.
 */
export function clientSignedSays(p: {
  personName: string
  hours: number
  /** The week as a person names it: "Oct 11–17" (`weekSays`). */
  week: string
  /** The firm that bills this client for the week, or null where unknown. */
  billedBy: string | null
  /** What that firm bills for it, in minor units; null where there is no figure. */
  worthCents: number | null
  currency?: string
}): string {
  const hours = Number.isInteger(p.hours) ? String(p.hours) : String(Math.round(p.hours * 100) / 100)
  const signed = `Approved ${p.personName}’s ${hours} ${p.hours === 1 ? 'hour' : 'hours'} for ${p.week}.`
  if (p.worthCents == null) return signed
  const who = p.billedBy ?? 'Your supplier'
  return `${signed} ${who} bills you ${amount(p.worthCents, p.currency ?? 'USD')} for ${p.hours === 1 ? 'it' : 'them'}.`
}
