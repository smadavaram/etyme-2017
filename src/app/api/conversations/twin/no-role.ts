import { prisma } from '@/lib/db'
import { canGiveDesks, MEMBER_DESK } from '@/lib/access-grant'
import { readCompanySeats, peopleOf, type CompanySeat } from '@/lib/company-seats'
import { seatedSays } from '@/lib/money/who-raises-bills'

/**
 * Who gives a seat with no role its role (fix list, layer 4, people and
 * access, 2026-11-15).
 *
 * A person invited with no role opened Ask Etyme and read that nothing of
 * the firm's was addressed to her, or that nothing on the record was
 * about her as a worker. Both were true, and neither said what to do. So
 * a seat with no role, or only the Member role (which every screen calls
 * "No role yet"), is told in one more sentence who gives her one:
 *
 *  1. the person who invited her, by name, while that person holds a
 *     live seat here whose role may give roles (`canGiveDesks`). Live is
 *     what the people lists read (`readCompanySeats`: signed in, not
 *     paused, not withdrawn or ended), and one more thing they do not
 *     read: a seat past its own end date (`Context.expiresAt`) has ended
 *     too, so an inviter whose seat ran out is never named;
 *  2. else the roles of the live seats here that may give roles, in the
 *     words Users & permissions uses (`seatedSays`);
 *  3. else "an Owner or Admin" of the firm.
 *
 * She reads those names and nothing else of the firm's. A seat that holds
 * a role reads exactly what it read before.
 */

/** What decides the sentence, read once per greeting. */
export interface WhoGivesRoles {
  /** The inviter's name, only while the inviter holds a live seat here that may give roles. */
  inviter: string | null
  /** The roles of the live seats here that may give roles, the reader's own excluded. */
  roles: readonly string[]
}

/** A seat with no role, or only the Member role, holds no role. Pure. */
export function holdsNoRole(roleName: string | null | undefined): boolean {
  const n = (roleName ?? '').trim()
  return !n || n === MEMBER_DESK
}

/**
 * "Nobody has given you a role here yet. Ask Dana Reyes, who invited you,
 * to give you one." Pure; every branch is under twenty-five words a
 * sentence.
 */
export function noRoleYetSays(who: WhoGivesRoles, firmName: string): string {
  const lead = 'Nobody has given you a role here yet.'
  if (who.inviter) return `${lead} Ask ${who.inviter}, who invited you, to give you one.`
  const roles = seatedSays('Giving roles', who.roles)
  if (roles) return `${lead} ${roles}`
  return `${lead} Ask an Owner or Admin of ${firmName} to give you one.`
}

/** A seat as the people lists read it, with its end date beside it. */
export type GiverSeat = Pick<CompanySeat, 'contextId' | 'personId' | 'name' | 'roleName' | 'state'> & {
  /** The role may give roles (`canGiveDesks` on its permissions). */
  mayGive: boolean
  /** The seat's own end date, or null where it has none. */
  endsAt: Date | null
}

/** A seat past its end date has ended, whatever else it says. Pure. */
export function seatHasEnded(endsAt: Date | null, now: Date): boolean {
  return endsAt !== null && endsAt.getTime() <= now.getTime()
}

/**
 * Who gives this seat its role, from the company's seats. Pure: the
 * inviter is named only while she holds a live seat here that may give
 * roles, and the roles are those of every such seat but the reader's own.
 */
export function whoGivesRoles(
  seats: readonly GiverSeat[],
  me: { contextId: string; personId: string; invitedById: string | null },
  now: Date,
): WhoGivesRoles {
  const givers = seats.filter((s) =>
    s.state === 'WITH_ACCESS' && s.contextId !== me.contextId && s.mayGive && !seatHasEnded(s.endsAt, now))
  const inviter = me.invitedById && me.invitedById !== me.personId
    ? givers.find((s) => s.personId === me.invitedById)?.name ?? null
    : null
  return { inviter, roles: givers.map((s) => s.roleName ?? '') }
}

type Seat = { person: { id: string }; context: { id: string; type: string }; company: { id: string; name: string } | null }

/**
 * The sentence for this seat, or null where it holds a role, is a
 * consultant's own seat, or sits at no company. Reads the seat, then,
 * only for a seat with no role, the company's seats through the one
 * reader every screen counts from (`readCompanySeats`).
 */
export async function noRoleLineFor(caller: Seat): Promise<string | null> {
  if (!caller.company || caller.context.type === 'CONSULTANT') return null
  const mine = await prisma.context.findUnique({
    where: { id: caller.context.id },
    select: { invitedById: true, role: { select: { name: true } } },
  })
  if (!mine || !holdsNoRole(mine.role?.name)) return null
  const live = peopleOf(await readCompanySeats(caller.company.id))
    .filter((s) => s.state === 'WITH_ACCESS' && s.contextId !== caller.context.id && s.roleId)
  const ids = Array.from(new Set(live.map((s) => s.roleId!)))
  const [roles, ends] = await Promise.all([
    ids.length ? prisma.role.findMany({ where: { id: { in: ids } }, select: { id: true, permissions: true } }) : [],
    live.length ? prisma.context.findMany({ where: { id: { in: live.map((s) => s.contextId) } }, select: { id: true, expiresAt: true } }) : [],
  ])
  const perms = new Map(roles.map((r) => [r.id, r.permissions as string[]]))
  const endsAt = new Map(ends.map((c) => [c.id, c.expiresAt]))
  const who = whoGivesRoles(
    live.map((s) => ({ ...s, mayGive: canGiveDesks(perms.get(s.roleId!) ?? []), endsAt: endsAt.get(s.contextId) ?? null })),
    { contextId: caller.context.id, personId: caller.person.id, invitedById: mine.invitedById },
    new Date(),
  )
  return noRoleYetSays(who, caller.company.name)
}
