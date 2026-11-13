import { prisma } from '@/lib/db'
import { renameNameSays, renameVerdict } from '../row-acts'

/**
 * Renaming the person on a seat (founder, 2026-11-12: a seat made for a
 * shared mailbox read "Timesheets" in the people list, as if a role were a
 * teammate). The Owner, or an Admin, types the name of the person who uses
 * the seat.
 *
 * A name is the person's own wherever their record reaches past this
 * company, so the company renames only a person it alone knows: no live
 * seat anywhere else (another company's, or the person's own with no
 * company), no page of their own as a worker, and no work with their name
 * on it. Anybody else changes their own name under Your data.
 *
 * The write and its log row are here, not in the seat route, so the route's
 * first automation-log row stays the pause, put-back or end it always was.
 */

/** Why a person's name is not this company's to change: a seat elsewhere, or their own work record. */
export type Beyond = 'SEAT' | 'WORK'

/** The people in `personIds` whose record reaches past this company, and how. */
export async function knownBeyond(personIds: readonly string[], companyId: string): Promise<Map<string, Beyond>> {
  const out = new Map<string, Beyond>()
  if (personIds.length === 0) return out
  const ids = [...new Set(personIds)]
  const [seats, people] = await Promise.all([
    prisma.context.findMany({
      where: {
        personId: { in: ids },
        revokedAt: null,
        OR: [{ companyId: null }, { companyId: { not: companyId } }],
      },
      select: { personId: true },
    }),
    prisma.person.findMany({
      where: {
        id: { in: ids },
        OR: [
          { consultant: { isNot: null } },
          { sellContracts: { some: {} } },
          { submissions: { some: {} } },
          { buyCandidacies: { some: {} } },
        ],
      },
      select: { id: true },
    }),
  ])
  for (const p of people) out.set(p.id, 'WORK')
  for (const s of seats) out.set(s.personId, 'SEAT')
  return out
}

export type RenameOutcome =
  | { kind: 'REFUSED'; message: string }
  | { kind: 'WRONG_NAME'; message: string }
  | { kind: 'RENAMED'; name: string }

export async function renameSeat(input: {
  contextId: string
  personId: string
  typed: unknown
  company: { id: string; name: string; kind: string }
  actor: { personId: string; name: string }
  actorIsOwner: boolean
  targetIsOwner: boolean
  /** Live seats at the company, the target's included. */
  liveSeats: number
}): Promise<RenameOutcome> {
  const { company, actor } = input
  const [beyond, roles, person] = await Promise.all([
    knownBeyond([input.personId], company.id),
    prisma.role.findMany({ where: { companyId: company.id }, select: { name: true } }),
    prisma.person.findUnique({ where: { id: input.personId }, select: { name: true } }),
  ])
  const verdict = renameVerdict({
    mayManage: true,
    actorIsOwner: input.actorIsOwner,
    targetIsOwner: input.targetIsOwner,
    seatElsewhere: beyond.get(input.personId) === 'SEAT',
    ownRecord: beyond.get(input.personId) === 'WORK',
    onlyPersonOfOneFirm: company.kind === 'CONSULTANT_CORP' && input.liveSeats <= 1,
  })
  if (!verdict.allowed) return { kind: 'REFUSED', message: verdict.reason }

  const wrong = renameNameSays(input.typed, company.name, roles.map((r) => r.name))
  if (wrong) return { kind: 'WRONG_NAME', message: wrong }

  const name = String(input.typed).trim().replace(/\s+/g, ' ')
  const before = person?.name ?? ''
  await prisma.$transaction([
    prisma.person.update({ where: { id: input.personId }, data: { name } }),
    prisma.automationLog.create({
      data: {
        companyId: company.id,
        action: 'PERSON_RENAMED',
        summary: `${actor.name} renamed ${before || 'a seat'} to ${name}`,
        reason: 'Renamed on Users & permissions. The old name is kept here, so it can be put back.',
        payload: { contextId: input.contextId, personId: input.personId, from: before, to: name, byPersonId: actor.personId },
        reversible: true,
      },
    }),
  ])
  return { kind: 'RENAMED', name }
}
