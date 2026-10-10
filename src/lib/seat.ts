/**
 * Staff, or the person the record is about.
 *
 * A consultant on an agency's bench gets a Context pointing at that agency,
 * because that is the true fact: they are listed there. Every scope helper
 * in the build then read that company id as "I work here", and handed a
 * contractor the agency's entire book — nine contracts, nine timesheets, the
 * rate history of six other people, the automation log, the role definitions,
 * the settings. Probed on a running server, not imagined.
 *
 * The company id is not wrong. Reading it as employment is.
 *
 * Two seats, and the difference is the whole point:
 *
 *   **Staff** — hired by the company, holds a role, holds permissions.
 *   The book is theirs to work.
 *
 *   **Consultant** — the subject of the records, not an employee of the
 *   company holding them. Their own contract, their own hours, their own
 *   rate. Nobody else's.
 *
 * A consultant seat carries no role at all, which is why permission checks
 * never caught this: the routes that leaked never asked for a permission.
 * So the guard is the seat itself, checked at the top of the route, and it
 * says what it is refusing rather than "insufficient privileges".
 */

import { NextResponse } from 'next/server'
import type { CallerContext } from '@/lib/api-context'

/**
 * Is this person sitting on somebody's bench rather than working there?
 *
 * The context type, and only the context type. A missing company is a
 * different fault with a different answer — an employee whose company did
 * not resolve is entitled to nothing, not to their own records — and the
 * null-company guard further down each scope already says so. Folding the
 * two together here would quietly promote a broken session into a valid
 * self-scope, which is the wrong direction to fail in.
 *
 * A consultant who has joined no bench yet still has this type, so they
 * still get their own records and never anybody else's.
 */
export function isConsultantSeat(caller: CallerContext): boolean {
  return caller.context.type === 'CONSULTANT'
}

/**
 * Guard for a company-book surface: settings, roles, the automation log,
 * the client directory, the rolloff board, the access register.
 *
 * Returns a refusal to hand straight back, or null to carry on.
 *
 * The message names the surface so the sentence reads like an answer
 * instead of a wall — a consultant who lands on the agency's settings page
 * from a stale link deserves to be told which page is theirs.
 */
export function staffOnly(
  caller: CallerContext,
  surface: string
): NextResponse | null {
  if (!isConsultantSeat(caller)) return null
  return NextResponse.json(
    { error: { code: 'NOT_STAFF', message: notStaffSays(caller, surface) } },
    { status: 403 }
  )
}

/**
 * The sentence a consultant seat is refused a company-book surface with.
 *
 * Two different people hold a consultant seat, and one sentence served
 * both. Round six of the sign-up walk (2026-10-08, problem 8): Nina
 * signed up as a candidate, is on nobody's bench, and was told on twenty
 * pages that "Users & permissions belongs to this agency. You are on
 * their bench" — an agency that does not exist and a bench she is not on.
 *
 *  - **No company on the seat**: a candidate signed in as herself. Say
 *    that, and where her own work is.
 *  - **A company on the seat**: the context points at the firm because
 *    she is listed there — which is how a firm's bench reaches a
 *    consultant's seat (see the note at the top). The bench sentence is
 *    true for her, and names the firm.
 */
export function notStaffSays(caller: CallerContext, surface: string): string {
  const name = caller.company?.name?.trim()
  if (!caller.context.companyId || !name) {
    return 'You are not signed in at a company. Your own work is under Your work.'
  }
  // Company names routinely end in a full stop — "Techpeple Inc." — and a
  // refusal reading "Techpeple Inc.. You are" looks like the bug it is.
  const where = name.replace(/\.$/, '')
  return `${surface} belongs to ${where}. You are on their bench, not on their staff — your own work is under Your work.`
}

/**
 * Narrow a query to the caller themselves.
 *
 * For the surfaces a consultant genuinely has business on — their contract,
 * their hours, their rate history, their documents. Returns null for staff,
 * meaning "do not narrow, use the ordinary company scope".
 */
export function ownRecordsOnly(
  caller: CallerContext
): { personId: string } | null {
  return isConsultantSeat(caller) ? { personId: caller.person.id } : null
}
