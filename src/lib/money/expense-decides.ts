/**
 * Who at a firm may accept or send back an expense it pays for, and what
 * the screen says to everybody else.
 *
 * One answer, read by the route that records the decision
 * (`POST /api/expenses/:id/accept`) and by the list that draws the
 * Accept and Send back buttons (`GET /api/expenses`), so a button the
 * route will refuse is never drawn. The screen walk, 2026-11-02: a
 * client's program manager was offered "Accept $234.00", pressed it, and
 * the route refused ("… is done by Hiring Manager or AP Clerk") with
 * nothing reaching the screen. Now the row says who accepts it instead.
 */

import { hasAnyPermission, askTheDesk, type Permission } from '@/lib/permissions'
import { seatedRefusal } from '@/lib/money/seated-books'
import type { ActingDesk } from '@/lib/program-seat'

/** What lets a seat decide an expense its firm pays for. */
export const EXPENSE_DECIDES: readonly Permission[] = ['timesheets.approve', 'payments.record']

/**
 * Null where this desk may decide; else the sentence the route refuses
 * with, which the row says in place of the buttons.
 */
export function expenseDecideRefusal(
  desk: Pick<ActingDesk, 'permissions' | 'seat' | 'companyName'>,
  kind: string | null | undefined
): string | null {
  if (hasAnyPermission(desk.permissions, [...EXPENSE_DECIDES])) return null
  return desk.seat
    ? seatedRefusal(desk.seat, 'Accepting an expense')
    : askTheDesk({ doing: 'Accepting an expense before it is paid', needs: [...EXPENSE_DECIDES], kind, companyName: desk.companyName })
}
