import { formatDay } from '@/lib/format-date'

/**
 * The words the Submissions page uses for a row — never the column's code.
 *
 * The client tester read "NOT_SELECTED" on the row of a candidate who had
 * just been turned down, "BENCH", "INTERNAL" and "NETWORK" under a column
 * headed Kind, and "6d ago" in one row beside "9/19/2026" in the next.
 * Three codes and two date styles on the page a hiring manager decides
 * from. The codes stay the machine's; this is what a person reads.
 *
 * Beside the page, with no database and no clock of its own, so the
 * tests read it directly.
 */

const STATUS: Record<string, string> = {
  SUBMITTED: 'Submitted',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW: 'Interviewing',
  OFFERED: 'Offered',
  PLACED: 'Placed',
  REJECTED: 'Turned down',
  WITHDRAWN: 'Withdrawn',
  // Stood down by somebody else's award. Not a judgment of the person.
  NOT_SELECTED: 'Not chosen',
}

/** "Not chosen", never NOT_SELECTED. */
export function submissionStatusWord(status: string): string {
  const key = String(status ?? '').toUpperCase()
  return STATUS[key] ?? key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' ')
}

/**
 * How the person came to this job, said from where the reader sits.
 *
 * The same row reads differently to the firm that sent it and the firm
 * that received it: "our own employee" to the integrator that put
 * Karthik forward, "the supplier's own employee" to the client. Neither
 * names a firm below the one the client pays — the column says a person
 * came through another firm, never which.
 *
 * ── Read off the chain, not off the stored kind ──────────────────────
 *
 * The audit of 2026-10-05 found both sides of Marisol Quintero's row
 * reading "through a partner firm" when there was no partner: Brightmoor
 * held her listing and sent her straight to Northbend. The stored kind
 * said NETWORK because her listing was a marketing one rather than a
 * retained one, and the words trusted the kind. So where the row says
 * which hop it came up — `came` — the words follow the chain: our own
 * employee, our own bench, or through a named supplier, and the supplier
 * is named only to the firm that bought from it.
 */
export interface Came {
  /** The row was forwarded up from a submission another firm made. */
  chained: boolean
  /** That firm's name — given only to the firm that bought from it. */
  through: string | null
}

export function submissionKindWord(
  kind: string,
  direction: 'sent' | 'received' | null | undefined,
  came?: Came | null
): string {
  const ours = direction === 'sent'
  const k = String(kind ?? '').toUpperCase()
  if (k === 'INTERNAL') return ours ? 'Our own employee' : 'Supplier’s own employee'
  if (came) {
    if (came.chained) {
      return ours
        ? came.through ? `Through ${came.through}` : 'Through a supplier of ours'
        : 'Through the supplier’s own supplier'
    }
    return ours ? 'From our bench' : 'From the supplier’s bench'
  }
  switch (k) {
    case 'BENCH':    return ours ? 'From our bench' : 'From the supplier’s bench'
    case 'NETWORK':  return ours ? 'Through a partner firm' : 'Through another firm'
    default:         return 'Not stated'
  }
}

/** The column's heading — a question a recruiter would ask. */
export const KIND_HEADING = 'How they came'

/** "Sep 27, 2026" — one date style on every row, never "6d ago" beside "9/19/2026". */
export function submittedOn(iso: string | null | undefined): string {
  if (!iso) return 'Not recorded'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Not recorded'
  return formatDay(d)
}

/**
 * The jobs a firm may put somebody forward to: somebody else's.
 *
 * An integrator holds two rows for one client job — the client's own,
 * and its resold copy that its sub-vendors answer. The dialog offered
 * both under identical words, and picking the copy was refused with
 * "Teleworld Solutions is not among" the suppliers Teleworld chose: the
 * firm told it is not a supplier to itself. A firm never submits to its
 * own job request, so the copy is not offered.
 */
export function jobsToSubmitTo<T extends { company: { id: string } }>(jobs: T[], myCompanyId: string): T[] {
  return jobs.filter((j) => j.company.id !== myCompanyId)
}
