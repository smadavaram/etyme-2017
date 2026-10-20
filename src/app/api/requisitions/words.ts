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

import { formatDay } from '@/lib/format-date'

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
  const who = [...named, ...(unnamed ? ['an approver nobody has named yet'] : [])]
  const list = who.length <= 1 ? who[0] : `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}`
  return `Waiting on ${list}`
}

// ── A job sent to a supplier ────────────────────────────────────────────
//
// The simulation of 2026-10-20 read 297 notices titled "New requirement
// from Northbend Athletic" to nine people — one supplier's account
// manager had 33 of them, each the same title for a different job — and
// the body said "1 position(s)". The title names the job now, so a list
// of them reads as a list of jobs, and the count is said the way a
// person says it.

/** "1 position", "4 positions". */
export function positionsSays(headcount: number | null | undefined): string {
  const n = headcount != null && Number.isFinite(headcount) && headcount > 0 ? Math.floor(headcount) : 1
  return `${n} ${n === 1 ? 'position' : 'positions'}`
}

/** "Oct 30, 2026", through the one formatter, which reads every day in UTC. */
function closesSays(at: Date): string {
  return formatDay(at)
}

export interface JobSentFacts {
  /** The firm that sent it, as the supplier knows it. */
  clientName: string
  /** The job's own title. */
  title: string
  headcount: number | null | undefined
  location: string | null | undefined
  closesAt: Date
}

/**
 * What a supplier's people read when a job is sent to them: the job and
 * who sent it in the title, the size, the place and the day answers
 * close in the body. Never a rate band — each supplier reads its own on
 * the invitation, and a notice is not where a number belongs.
 */
export function jobSentNotice(f: JobSentFacts): { title: string; body: string } {
  const where = f.location ? ` in ${f.location}` : ''
  return {
    title: `${f.clientName} sent you the ${f.title} job`,
    body:
      `${f.title}: ${positionsSays(f.headcount)}${where}. Answers close ${closesSays(f.closesAt)}. ` +
      `Put somebody forward from the job, or write to ${f.clientName} on its thread.`,
  }
}

/**
 * The first line on the thread a sent job opens with one supplier: what
 * was sent and by when, and the sender's own note to that supplier where
 * there was one. The thread is this supplier's and the client's alone,
 * so the note never reaches another supplier; the band is never said.
 */
export function jobSentThreadLine(f: JobSentFacts & { note?: string | null }): string {
  const where = f.location ? ` in ${f.location}` : ''
  const note = f.note && f.note.trim() ? ` ${f.note.trim()}` : ''
  return `${f.clientName} sent you the ${f.title} job: ${positionsSays(f.headcount)}${where}. Answers close ${closesSays(f.closesAt)}.${note}`
}

/** How many people at one supplier hear that a job was sent to it. */
export const SEATS_TOLD_PER_FIRM = 10

/**
 * The seats told, at most `perFirm` at each firm, in the order given.
 * One cap across every firm let the first firm's seats crowd the others
 * out; a cap per firm keeps every firm told.
 */
export function toldPerFirm<T extends { companyId: string | null }>(seats: readonly T[], perFirm: number): T[] {
  const n = new Map<string | null, number>()
  const out: T[] = []
  for (const s of seats) {
    const k = n.get(s.companyId) ?? 0
    if (k >= perFirm) continue
    n.set(s.companyId, k + 1)
    out.push(s)
  }
  return out
}
