/**
 * A firm seated in a client's program, on that client's threads with its
 * suppliers.
 *
 * The coordinator's call, 2026-11-02, after the screen walk found Aptiva
 * in Cavanaugh Glassworks' program offered "Message <supplier>" and
 * refused nine times in nine: a seated firm is in that program for the
 * whole session and acts under the client's rules (2026-10-26), so it
 * writes to the client's suppliers as the client's program does, under
 * the permission the client's own program manager holds for it
 * (`PROGRAM_WRITES` in lib/threads). The thread is the client's, and
 * every read is logged as the seat's, with the seat named.
 *
 * Only threads across a deal: the client's own notes (Discussion) stay
 * the client's, and no seat reads them here.
 */
import type { CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { logBulkAccess } from '@/lib/access-log'
import { seatFor, seatsHeldBy, seatTrail, type LiveSeat } from '@/lib/program-seat'
import { seatWritesFor } from '@/lib/threads'

export interface ProgramSide {
  seat: LiveSeat
  /** The seat's role holds what the client's program manager writes to a supplier under. */
  writes: boolean
}

/** The seat the caller's firm holds in this client's program, and whether it writes for it; null for a firm with none. */
export async function programSideFor(caller: CallerContext, clientCompanyId: string): Promise<ProgramSide | null> {
  if (!caller.company || caller.company.id === clientCompanyId || caller.company.kind === 'CLIENT') return null
  const seat = await seatFor(caller, clientCompanyId)
  if (!seat) return null
  return { seat, writes: seatWritesFor({ clientCompanyId: seat.clientCompany.id, permissions: seat.role.permissions }, clientCompanyId) }
}

/** Every client whose threads with its suppliers this caller's firm writes for, by seat. */
export async function programsWrittenFor(caller: CallerContext): Promise<LiveSeat[]> {
  if (!caller.company || caller.company.kind === 'CLIENT') return []
  const seats = await seatsHeldBy(caller.company.id)
  return seats.filter((s) => seatWritesFor({ clientCompanyId: s.clientCompany.id, permissions: s.role.permissions }, s.clientCompany.id))
}

/**
 * Log a seat's read of the client's threads: one row per person a thread
 * is about (a thread about a candidate is about that person), with the
 * seat named in the reason. A thread about a job names nobody, so it
 * leaves no row.
 */
export async function noteSeatThreadRead(
  caller: CallerContext,
  seats: readonly LiveSeat[],
  threads: readonly { companyId: string; topic: string | null; topicId: string | null; title: string | null }[],
): Promise<void> {
  const byClient = new Map(seats.map((s) => [s.clientCompany.id, s]))
  const asked = threads.filter((t) => t.topic === 'SUBMISSION' && t.topicId && byClient.has(t.companyId))
  if (asked.length === 0) return
  const subs = await prisma.submission.findMany({
    where: { id: { in: [...new Set(asked.map((t) => t.topicId!))] } },
    select: { id: true, personId: true },
  })
  const personOf = new Map(subs.map((s) => [s.id, s.personId]))
  for (const seat of seats) {
    const people = [...new Set(asked.filter((t) => t.companyId === seat.clientCompany.id).map((t) => personOf.get(t.topicId!)).filter((p): p is string => !!p))]
    if (people.length === 0) continue
    logBulkAccess(people, {
      actorPersonId: caller.person.id,
      actorCompanyId: caller.company?.id ?? undefined,
      action: 'PROGRAM_READ',
      reason: seatTrail(seat, 'Read the program’s conversations with its suppliers'),
    })
  }
}
