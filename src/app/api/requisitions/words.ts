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
  /**
   * What tells this job apart from the client's other jobs of the same
   * title, from `jobApart`: " in Tualatin, starting Nov 3". Empty where
   * the title alone says which job it is.
   */
  apart?: string
}

// ── Telling jobs of one title apart ───────────────────────────────────
//
// The handoffs rerun on the generated world (2026-10-22) read 1,124
// notices titled "Tessaract Software sent you the Scrum master job" that
// were about different jobs: a client hires the same role in several
// places and quarters, and one title for different news is a list nobody
// can read. So a title names what differs from the client's other jobs
// of that title, in the order a recruiter says it: the place, then the
// start, and the job number only where nothing else does.

/** One job of a title, as `jobApart` compares it. */
export interface SameTitleJob {
  id: string
  location: string | null | undefined
  startDate: Date | null | undefined
}

/** "Nov 3": the day a job starts, said the way a recruiter says it. */
export function startSays(d: Date): string {
  return formatDay(d, { year: false })
}

/** The job's number as a person reads it off the job's page: the last six of its id. */
export function jobNumber(id: string): string {
  return id.slice(-6).toUpperCase()
}

const sameDay = (a: Date | null | undefined, b: Date | null | undefined) =>
  !!a && !!b && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
const samePlace = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()

/**
 * What tells `job` apart from `others` (the client's other jobs of the
 * same title): nothing where there are none; the place where that
 * settles it; the start as well where two share a place; the job number
 * only where neither does. Each part is added only if it removes at
 * least one job from the set still sharing the words so far.
 */
export function jobApart(job: SameTitleJob, others: readonly SameTitleJob[]): string {
  let left = others.filter((o) => o.id !== job.id)
  if (left.length === 0) return ''
  let place = ''
  let start = ''
  if (job.location && left.some((o) => !samePlace(o.location, job.location))) {
    place = ` in ${job.location}`
    left = left.filter((o) => samePlace(o.location, job.location))
  }
  if (left.length > 0 && job.startDate && left.some((o) => !sameDay(o.startDate, job.startDate))) {
    start = `${place ? ',' : ''} starting ${startSays(job.startDate)}`
    left = left.filter((o) => sameDay(o.startDate, job.startDate))
  }
  const number = left.length > 0 ? ` (job ${jobNumber(job.id)})` : ''
  return `${place}${start}${number}`
}

/**
 * What a supplier's people read when a job is sent to them: the job and
 * who sent it in the title, the size, the place and the day answers
 * close in the body. Never a rate band — each supplier reads its own on
 * the invitation, and a notice is not where a number belongs.
 */
export function jobSentNotice(f: JobSentFacts): { title: string; body: string } {
  return {
    title: `${f.clientName} sent you the ${f.title} job${f.apart ?? ''}`,
    body: `${jobLine(f)} ${tail(f)}`,
  }
}

/** "Java developer: 1 position in Tualatin. Answers close Nov 3, 2026." */
function jobLine(f: Pick<JobSentFacts, 'title' | 'headcount' | 'location' | 'closesAt' | 'apart'>): string {
  const where = f.location ? ` in ${f.location}` : ''
  const which = (f.apart ?? '').match(/\(job [A-Z0-9]+\)$/)?.[0]
  return `${f.title}${which ? ` ${which}` : ''}: ${positionsSays(f.headcount)}${where}. Answers close ${closesSays(f.closesAt)}.`
}

function tail(f: Pick<JobSentFacts, 'clientName'>): string {
  return `Put somebody forward from the job, or write to ${f.clientName} on its thread.`
}

/** How long after one job is sent another from the same client joins its notice rather than writing a new one. */
export const JOB_BATCH_MS = 60_000

/**
 * One notice for several jobs one client sent in the same minute: "Northbend
 * Athletic sent you 3 jobs: Java developer in Tualatin, Data engineer and
 * Scrum master", each job a line of the body. Three jobs are named in the
 * title and the rest counted, so the title stays a title. One job reads
 * exactly as `jobSentNotice` does.
 */
export function jobsSentNotice(jobs: readonly JobSentFacts[]): { title: string; body: string } {
  if (jobs.length === 1) return jobSentNotice(jobs[0])
  const client = jobs[0].clientName
  const named = jobs.map((j) => `${j.title}${j.apart ?? ''}`)
  const shown = named.length > 3 ? [...named.slice(0, 3), `${named.length - 3} more`] : named
  const list = `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
  return {
    title: `${client} sent you ${countInWords(jobs.length)} jobs: ${list}`,
    body: `${jobs.map((j) => jobLine(j)).join('\n')}\n${tail({ clientName: client })}`,
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
