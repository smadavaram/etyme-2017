/**
 * Whether a seat reads its firm's weeks, or only the weeks that name its
 * holder.
 *
 * Karthik Menon is Teleworld's own W2 engineer. His seat holds the two
 * reads every delivery engineer holds — the work he is on and his own
 * hours — and no desk that administers anybody. He opened Timesheets and
 * read every colleague's week, and `personId=` asking for a colleague
 * was ignored, because the list was scoped to the firm and nothing asked
 * whose hours they were (architect's walk, 2026-10-08).
 *
 * A week is read at a firm by the desks that act on it, and by nobody
 * else:
 *
 *   - whoever signs it (`timesheets.approve`) — a client's hiring
 *     manager, a supplier's AP & Payroll or Finance;
 *   - whoever accepts and pays it (`payroll.read`);
 *   - whoever bills or matches it (`invoices.read`) — Accounts
 *     Receivable, an AP clerk, an account manager, a program manager;
 *   - whoever runs the placement (`assignments.write`) — resource,
 *     account, contract and delivery managers;
 *   - the people desks (`consultants.read`) — recruiter, HR, compliance,
 *     and the team lead named approver on a project's lines;
 *   - the demand desks (`requirements.read`) — a client's read-only
 *     viewer of its own program.
 *
 * Everybody else is somebody the weeks are about: they read the weeks
 * that name them, and are refused anybody else's by name. This is the
 * same line `ownLinesOnly` in lib/money/own-lines draws for contracts,
 * drawn for hours with the hours' own desks.
 *
 * Pure: no database.
 */

import { hasPermission, type Permission } from '@/lib/permissions'
import { noDeskYet } from '@/lib/no-desk'

/** Any one of these is a desk that reads the firm's weeks. */
export const READS_THE_FIRMS_WEEKS: readonly Permission[] = [
  'timesheets.approve', 'payroll.read', 'invoices.read',
  'assignments.write', 'consultants.read', 'requirements.read',
]

/** True when this seat reads only the weeks that name its holder. */
export function ownWeeksOnly(permissions: readonly string[]): boolean {
  return !READS_THE_FIRMS_WEEKS.some((p) => hasPermission(permissions, p))
}

export type WhoseWeeks =
  | { ok: true; personId: string | null }
  | { ok: false; refusedPersonId: string }

/**
 * Whose weeks a list is narrowed to.
 *
 * A seat that reads the firm's weeks may narrow to anybody (`personId=`
 * is a filter, and the scope still decides what exists). A seat that
 * reads only its own is narrowed to its holder, `personId=` naming the
 * holder is honored, and `personId=` naming anybody else is refused.
 */
export function whoseWeeks(input: {
  ownOnly: boolean
  callerPersonId: string
  askedPersonId: string | null
}): WhoseWeeks {
  const asked = input.askedPersonId?.trim() || null
  if (!input.ownOnly) return { ok: true, personId: asked }
  if (asked === null || asked === input.callerPersonId) return { ok: true, personId: input.callerPersonId }
  return { ok: false, refusedPersonId: asked }
}

/**
 * The sentence a seat that reads only its own weeks is given when it asks
 * for a colleague's. Names the colleague only where the caller passes a
 * name — which the route does only for somebody seated at the reader's
 * own company (round five, problem 8) — and never a permission key.
 */
export function colleaguesWeeksRefused(name: string | null | undefined, company: string | null | undefined): string {
  const who = name?.trim() ? `${name.trim()}’s timesheet` : 'That timesheet'
  return noDeskYet(who, company)
}
