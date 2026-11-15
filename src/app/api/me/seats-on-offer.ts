import { prisma } from '@/lib/db'
import { hasSignedIn } from '@/lib/access-grant'
import { seatByDate, pastEndDate, MANAGES_ACCESS, type DatedSeat } from '@/lib/account-lifecycle'
import { OWNER_ROLE } from '@/lib/owner-rules'

/**
 * Which of a person's seats the account menu offers (2026-11-15).
 *
 * The one caller check passes over a seat that is paused, removed or past
 * its end date (`seatByDate` in lib/account-lifecycle) and falls back to a
 * seat still usable. The menu listed every seat not removed, so a person
 * could pick a paused or ended seat and land, without a word, on another
 * firm's menu. Now the menu offers only what the caller check would honor:
 * not removed, not paused, and open by its date, so an Owner's seat and the
 * last one that may manage access, which a date never ends, stay offered.
 */

/** The facts of one seat the menu reads. */
export interface SeatOnOffer {
  id: string
  companyId: string | null
  expiresAt: Date | null
  revokedAt: Date | null
  suspendedAt: Date | null
  invitedAt: Date | null
  lastUsedAt: Date | null
  role: { name: string; permissions: unknown } | null
}

/** A seat as `seatByDate` reads it. `everSignedIn` is whether the person ever signed in. */
export function datedSeat(s: SeatOnOffer, everSignedIn: boolean): DatedSeat {
  return {
    contextId: s.id,
    companyId: s.companyId,
    expiresAt: s.expiresAt,
    isOwner: s.role?.name === OWNER_ROLE,
    rolePermissions: (s.role?.permissions as string[] | undefined) ?? [],
    revokedAt: s.revokedAt,
    suspendedAt: s.suspendedAt,
    hasSignedIn: hasSignedIn({ invitedAt: s.invitedAt, lastUsedAt: s.lastUsedAt, everSignedIn }),
  }
}

/**
 * Whether the caller check would let this seat act now. `atCompany` is the
 * seats at its company that may manage access, read only where the seat is
 * past its end date. The person asking is signed in, so her own seat reads
 * as signed in, as the caller check reads it. Pure.
 */
export function usableNow(seat: SeatOnOffer, atCompany: readonly DatedSeat[], now: Date = new Date()): boolean {
  if (seat.revokedAt || seat.suspendedAt) return false
  return seatByDate(datedSeat(seat, true), atCompany, now).open
}

/**
 * The seats to offer, in the order given, and the one in use: the seat
 * asked for where it is still usable, else the first usable one, which is
 * the caller check's own fallback (most recent first). Pure.
 */
export function seatsToOffer<T extends SeatOnOffer>(
  seats: readonly T[],
  atCompany: readonly DatedSeat[],
  requestedId: string | null,
  now: Date = new Date()
): { offered: T[]; active: T | null } {
  const offered = seats.filter((s) => usableNow(s, atCompany, now))
  const active = (requestedId ? offered.find((s) => s.id === requestedId) : undefined) ?? offered[0] ?? null
  return { offered, active }
}

/**
 * The seats that may manage access at the companies where one of these
 * seats is past its end date, read the way the caller check reads them.
 * No query where no seat is past its date, which is nearly always.
 */
export async function managersWherePastDate(seats: readonly SeatOnOffer[], now: Date = new Date()): Promise<DatedSeat[]> {
  const companyIds = [...new Set(
    seats
      .filter((s) => !s.revokedAt && !s.suspendedAt && s.companyId && pastEndDate(s.expiresAt, now))
      .map((s) => s.companyId as string)
  )]
  if (companyIds.length === 0) return []
  const managers = await prisma.context.findMany({
    where: {
      companyId: { in: companyIds }, revokedAt: null, suspendedAt: null,
      role: { permissions: { hasSome: ['*', ...MANAGES_ACCESS] } },
    },
    select: {
      id: true, companyId: true, expiresAt: true, revokedAt: true, suspendedAt: true, invitedAt: true, lastUsedAt: true,
      role: { select: { name: true, permissions: true } },
      person: { select: { credentials: { where: { lastUsedAt: { not: null } }, select: { id: true }, take: 1 } } },
    },
  })
  return managers.map((m) => datedSeat(m, m.person.credentials.length > 0))
}
