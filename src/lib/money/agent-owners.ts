/**
 * Who owes the decision an agent opens about money (record 112).
 *
 * The seat that keeps the book the decision is about, else the Owner. A
 * working seat only (`seatAtFirm`): never a bench seat, a paused one or one
 * ended by its date. Where two seats hold the role the one named first by
 * person id is taken, so the same answer comes back every day. Pure over
 * the seats it is given; `ownerForRoles` reads them.
 */

import { prisma } from '@/lib/db'
import { firmSeats, seatAtFirm, type FirmSeat } from '@/lib/decision-items'
import { OWNER_ROLE } from '@/lib/owner-rules'

export const RECEIVABLES_ROLES = ['Accounts Receivable', 'Finance'] as const
export const PAYROLL_ROLES = ['AP & Payroll'] as const

/** The person who owes it: the first role in the list that has a working seat, else the Owner; null where nobody does. Pure. */
export function pickOwner(seats: readonly FirmSeat[], roles: readonly string[], now: Date): string | null {
  const working = seats.filter((s) => seatAtFirm(s, seats, now) !== null)
  for (const role of [...roles, OWNER_ROLE]) {
    const hit = working.filter((s) => s.roleName === role).map((s) => s.personId).sort()
    if (hit.length > 0) return hit[0]
  }
  return null
}

export async function ownerForRoles(companyId: string, roles: readonly string[], now: Date = new Date()): Promise<string | null> {
  return pickOwner(await firmSeats(companyId, prisma), roles, now)
}
