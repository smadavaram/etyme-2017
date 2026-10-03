/**
 * What a requisition's approval says out loud.
 *
 * The route said "Approved. 1 further approval(s) required." — which is
 * a printf, not a sentence. CLAUDE.md: "Explain in a sentence, not a
 * code", and the whole point of the approval chain is that the person
 * who just signed knows whether anything is still holding the role up.
 * A bracketed plural tells them the system could not be bothered to
 * work out which of the two cases they are in.
 *
 * This lives beside the route rather than in src/lib because a new file
 * under src/lib needs an owner adding in src/lib/domains.ts, which is
 * the architect's call. Everything here is plain arithmetic over a
 * count, with no database and no clock, so the tests run it directly.
 */

const SMALL = [
  'no', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
]

/**
 * A small count in words, the way somebody says it.
 *
 * Words to twelve and figures above, which is the ordinary newspaper
 * rule and reads right in both directions: "two more approvals" and
 * "17 more approvals". An approval chain above twelve desks is a
 * governance problem and not a typography one.
 */
export function countInWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n)
  const whole = Math.floor(n)
  return whole < SMALL.length ? SMALL[whole] : String(whole)
}

/** The same, with its first letter up, for the start of a sentence. */
export function upperFirst(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}

/**
 * What is left of the chain, as a whole sentence with its full stop.
 *
 * Zero is a real answer rather than a case that cannot happen: a route
 * that has just cleared the last rank says so, instead of printing
 * "0 further approval(s)".
 */
export function approvalsToGo(remaining: number): string {
  const n = Math.max(0, Math.floor(Number.isFinite(remaining) ? remaining : 0))
  if (n === 0) return 'Nothing further is needed — it is open to your suppliers.'
  if (n === 1) return 'One more approval to go.'
  return `${upperFirst(countInWords(n))} more approvals to go.`
}

/**
 * Who a job request is waiting on — one sentence, from one place.
 *
 * The list card and the job request's own page each took "the first
 * pending row" of a list they had ordered differently, so one job
 * request said "Waiting on Dana Whitfield" on its card and "Waiting on
 * Camille Whitford" on its page (2026-09-30). Both were waiting: the
 * two sign alongside at one rank. The rule is the approval engine's —
 * the lowest undecided rank is the one in play — and every desk at it
 * is named, in rank order and then by name, so the card and the page
 * print the same words because the route computed them once.
 *
 * Null where nothing is pending.
 */
export function waitingOnSays(
  approvals: { rank: number; outcome: string; approver: { name: string } | null }[]
): string | null {
  const pending = approvals.filter((a) => String(a.outcome).toUpperCase() === 'PENDING')
  if (pending.length === 0) return null
  const lowest = Math.min(...pending.map((a) => a.rank))
  const atLowest = pending.filter((a) => a.rank === lowest)
  const named = [...new Set(atLowest.map((a) => a.approver?.name).filter((n): n is string => !!n))].sort((a, b) =>
    a.localeCompare(b)
  )
  const unnamed = atLowest.some((a) => !a.approver)
  const who = [...named, ...(unnamed ? ['a desk nobody is named for'] : [])]
  const list = who.length <= 1 ? who[0] : `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}`
  return `Waiting on ${list}`
}
