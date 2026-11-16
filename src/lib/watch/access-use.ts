/**
 * Whether each watched seat has been used, read from its own firm's
 * access log (2026-11-16). The nightly access watch (`watchAccess` in
 * lib/watch) says "<Name> has never used their access" and "<Name> has
 * not used their access in N days" from this, never from
 * `Context.lastUsedAt` alone, which no code writes today: read alone, it
 * reported every seat granted a month ago as never used, including people
 * who sign in here every day.
 *
 * Signed in is the one predicate every reader of a seat agrees on:
 * `seatHasSignedIn` (lib/access-grant) over `signedInHere`
 * (lib/access-log), this firm's own record, never her account elsewhere.
 * The last use is the latest row this firm's log keeps with her, in
 * person, as the actor at this firm (`signedInHereWhere`): a twin acting
 * on her seat's authority is not her using it, and neither is a sign-in
 * the firm refused. Where the seat's own column holds a later date, that
 * date is kept.
 *
 * One query per thousand seats, so the nightly run stays one read deep.
 */

import { prisma } from '@/lib/db'
import { seatHasSignedIn } from '@/lib/access-grant'
import { NOT_A_SIGN_IN } from '@/lib/access-log'
import type { UsedHere } from '@/lib/watch'

export interface SeatToRead {
  contextId: string
  companyId: string
  personId: string
  invitedAt: Date | null
  lastUsedAt: Date | null
}

const CHUNK = 1000

/** Each seat's use at its own firm, by the seat's id. */
export async function accessUseHere(
  seats: readonly SeatToRead[],
  db: Pick<typeof prisma, 'accessLog'> = prisma,
): Promise<Map<string, UsedHere>> {
  const lastAt = new Map<string, Date>()
  const pair = (companyId: string, personId: string) => `${companyId}\u0000${personId}`
  for (let i = 0; i < seats.length; i += CHUNK) {
    const chunk = seats.slice(i, i + CHUNK)
    const rows = await db.accessLog.groupBy({
      by: ['actorCompanyId', 'actorPersonId'],
      where: {
        actorPersonId: { in: [...new Set(chunk.map((s) => s.personId))] },
        actorCompanyId: { in: [...new Set(chunk.map((s) => s.companyId))] },
        actorKind: 'PERSON',
        action: { notIn: [...NOT_A_SIGN_IN] as string[] },
      },
      _max: { at: true },
    })
    for (const r of rows) {
      if (r.actorCompanyId && r.actorPersonId && r._max.at) lastAt.set(pair(r.actorCompanyId, r.actorPersonId), r._max.at)
    }
  }
  return usedHereOf(seats, lastAt, pair)
}

/** Each seat's use, from the latest row of hers at its firm. Pure. */
export function usedHereOf(
  seats: readonly SeatToRead[],
  lastAt: ReadonlyMap<string, Date>,
  pair: (companyId: string, personId: string) => string,
): Map<string, UsedHere> {
  const out = new Map<string, UsedHere>()
  for (const s of seats) {
    const logged = lastAt.get(pair(s.companyId, s.personId)) ?? null
    const last = s.lastUsedAt && logged ? (s.lastUsedAt > logged ? s.lastUsedAt : logged) : (s.lastUsedAt ?? logged)
    out.set(s.contextId, {
      signedIn: seatHasSignedIn({ invitedAt: s.invitedAt, lastUsedAt: s.lastUsedAt, signedInHere: logged !== null }),
      lastAt: last,
    })
  }
  return out
}
