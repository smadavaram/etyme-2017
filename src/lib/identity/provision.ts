import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { MEMBER_ROLE } from '@/lib/company-defaults'
import { domainOfEmail } from '@/lib/company-domains'
import { recordIdentityEvent, type Surface } from '@/lib/identity/ledger'
import { companyPolicy } from '@/lib/identity/read'
import type { EffectiveMode } from '@/lib/identity/policy'

/**
 * Seats a company's directory makes and takes away (founder, 2026-11-11):
 * "Provisioning is SCIM 2.0 first, just-in-time on a first sign-in only
 * where the Owner or Admin enabled it; a directory group maps to an Etyme
 * role by tenant setting. Deprovisioning is the sale: a person removed or
 * disabled in the directory loses the seat at once, live sessions die and a
 * ledger entry is written."
 *
 * One file for both doors (SCIM and the directory sign-in) so a seat made
 * either way is the same seat, and a seat taken away either way is taken
 * away the same way.
 *
 * ── The Owner rules hold here too ─────────────────────────────────────
 *
 * "An Admin never acts on an Owner, so a directory deprovision of an Owner
 * follows the Owner rules (another Owner's yes, never the last Owner)."
 * The card for another Owner's yes is not built in pass 1, so a directory
 * never suspends an Owner's seat: the last Owner is refused outright and
 * nothing changes; any other Owner's directory identity is turned off and
 * their sessions end (so they cannot sign in through the directory), the
 * seat is kept, and the answer says another Owner removes it.
 *
 * A directory group never makes anybody an Owner, and never moves an
 * Owner's seat to another role.
 */

/** What a seat's suspension says when the directory made it, so restoring the person restores only those. */
export const DIRECTORY_SUSPEND_REASON = 'Turned off in the company’s directory.'

type Db = Prisma.TransactionClient | typeof prisma

/** Every verified domain a company holds: its own and the ones it proved. */
export async function verifiedDomainsOf(companyId: string, db: Db = prisma): Promise<string[]> {
  const c = await db.company.findUnique({
    where: { id: companyId },
    select: { domain: true, domainVerified: true, claimedDomains: { where: { verifiedAt: { not: null } }, select: { domain: true } } },
  })
  if (!c) return []
  const out = new Set<string>()
  if (c.domain && c.domainVerified) out.add(c.domain.toLowerCase())
  for (const d of c.claimedDomains) out.add(d.domain.toLowerCase())
  return [...out]
}

/** Whether an address is on one of the company's verified domains: a directory vouches for its own people only. */
export function onVerifiedDomain(email: string, domains: readonly string[]): boolean {
  const d = domainOfEmail(email)
  return Boolean(d) && domains.includes(d!.toLowerCase())
}

async function roleFor(companyId: string, groups: readonly string[], db: Db): Promise<{ id: string; name: string; group: string | null } | null> {
  if (groups.length > 0) {
    const mapped = await db.directoryGroupRole.findMany({
      where: { companyId, groupId: { in: [...groups] } },
      select: { groupId: true, groupName: true, role: { select: { id: true, name: true } } },
      orderBy: { setAt: 'asc' },
    })
    const usable = mapped.find((m) => m.role.name !== 'Owner')
    if (usable) return { id: usable.role.id, name: usable.role.name, group: usable.groupName ?? usable.groupId }
  }
  const member = await db.role.findFirst({ where: { companyId, name: MEMBER_ROLE }, select: { id: true, name: true } })
  return member ? { ...member, group: null } : null
}

export interface ProvisionArgs {
  companyId: string
  identityProviderId: string | null
  issuer: string
  subject: string
  email: string
  name: string | null
  groups?: readonly string[]
  source: 'SCIM' | 'JIT'
  surface: Surface
}

/**
 * Make, or find, the person, their directory identity and their seat at
 * the company, and write USER_PROVISIONED. An existing live seat at the
 * company is linked to the identity rather than doubled. Refuses an address
 * off the company's verified domains, because a directory that could vouch
 * for another company's address could sign somebody in as anybody.
 */
export async function provision(a: ProvisionArgs): Promise<
  | { ok: true; externalIdentityId: string; personId: string; contextId: string; created: boolean }
  | { ok: false; status: number; says: string }
> {
  const email = a.email.trim().toLowerCase()
  const [domains, company] = await Promise.all([
    verifiedDomainsOf(a.companyId),
    prisma.company.findUniqueOrThrow({ where: { id: a.companyId }, select: { name: true } }),
  ])
  if (!onVerifiedDomain(email, domains)) {
    return { ok: false, status: 400, says: `${email} is not on one of ${company.name}'s verified domains, so its directory cannot seat it.` }
  }
  const policy = (await companyPolicy(a.companyId)).effective

  return prisma.$transaction(async (tx) => {
    const already = await tx.externalIdentity.findUnique({ where: { issuer_subject: { issuer: a.issuer, subject: a.subject } }, select: { id: true, companyId: true } })
    if (already && already.companyId !== a.companyId) {
      return { ok: false as const, status: 409, says: 'That directory identity already belongs to another company on Etyme.' }
    }
    const person = (await tx.person.findUnique({ where: { primaryEmail: email }, select: { id: true, name: true } }))
      ?? (await tx.person.create({ data: { primaryEmail: email, name: a.name || email.split('@')[0], emailVerifiedAt: new Date() }, select: { id: true, name: true } }))

    const ei = already
      ? await tx.externalIdentity.update({ where: { id: already.id }, data: { email, personId: person.id }, select: { id: true } })
      : await tx.externalIdentity.create({
          data: { personId: person.id, companyId: a.companyId, identityProviderId: a.identityProviderId, issuer: a.issuer, subject: a.subject, email },
          select: { id: true },
        })

    const role = await roleFor(a.companyId, a.groups ?? [], tx)
    let seat = await tx.context.findFirst({
      where: { personId: person.id, companyId: a.companyId, revokedAt: null },
      orderBy: { grantedAt: 'asc' },
      select: { id: true, externalIdentityId: true },
    })
    let created = false
    if (seat) {
      if (!seat.externalIdentityId) await tx.context.update({ where: { id: seat.id }, data: { externalIdentityId: ei.id } })
    } else {
      seat = await tx.context.create({
        data: {
          personId: person.id, companyId: a.companyId, type: 'EMPLOYEE', roleId: role?.id ?? null,
          source: a.source, externalIdentityId: ei.id,
          grantReason: a.source === 'SCIM' ? `Provisioned by ${company.name}'s directory (SCIM).` : `Seated on first sign-in through ${company.name}'s directory.`,
        },
        select: { id: true, externalIdentityId: true },
      })
      created = true
    }

    await recordIdentityEvent({
      event: 'USER_PROVISIONED', companyId: a.companyId, actorPersonId: a.source === 'JIT' ? person.id : null,
      subject: { personId: person.id }, policy, surface: a.surface,
      says: created
        ? `${company.name}'s directory seated ${email}${role ? ` as ${role.name}` : ''}${role?.group ? ` through the group ${role.group}` : ''} (${a.source === 'SCIM' ? 'SCIM' : 'on first sign-in'}).`
        : `${company.name}'s directory linked ${email} to the seat they already held.`,
    }, tx)
    return { ok: true as const, externalIdentityId: ei.id, personId: person.id, contextId: seat.id, created }
  })
}

/** Live Owner seats at a company. */
async function ownerSeats(companyId: string, db: Db): Promise<{ id: string; personId: string }[]> {
  return db.context.findMany({
    where: { companyId, revokedAt: null, suspendedAt: null, role: { name: 'Owner' } },
    select: { id: true, personId: true },
  })
}

/**
 * The directory turned a person off. Their directory identity is marked
 * off, every seat they hold at the company is paused, every live session
 * they hold ends on its next request, and USER_DEPROVISIONED is written —
 * all in one transaction. The Owner rules above decide an Owner's seat.
 */
export async function deprovision(a: { externalIdentityId: string; surface: Surface; actorPersonId?: string | null; why?: string }): Promise<
  | { ok: true; says: string }
  | { ok: false; status: number; says: string }
> {
  const ei = await prisma.externalIdentity.findUnique({
    where: { id: a.externalIdentityId },
    select: { id: true, personId: true, companyId: true, email: true, disabledAt: true, company: { select: { name: true } } },
  })
  if (!ei) return { ok: false, status: 404, says: 'No such person at this directory.' }
  const policy: EffectiveMode = (await companyPolicy(ei.companyId)).effective
  const seats = await prisma.context.findMany({
    where: { personId: ei.personId, companyId: ei.companyId, revokedAt: null },
    select: { id: true, suspendedAt: true, role: { select: { name: true } } },
  })
  const owners = await ownerSeats(ei.companyId, prisma)
  const holdsOwner = seats.some((s) => s.role?.name === 'Owner' && !s.suspendedAt)
  const otherOwners = owners.filter((o) => o.personId !== ei.personId)

  if (holdsOwner && otherOwners.length === 0) {
    const says = `${ei.email} is the last Owner of ${ei.company.name}. The directory cannot remove the last Owner; another Owner must be named first.`
    await recordIdentityEvent({ event: 'USER_DEPROVISIONED', refused: true, companyId: ei.companyId, actorPersonId: a.actorPersonId ?? null, subject: { personId: ei.personId }, policy, surface: a.surface, says })
    return { ok: false, status: 409, says }
  }

  const now = new Date()
  const ownerKept = holdsOwner
  await prisma.$transaction(async (tx) => {
    await tx.externalIdentity.update({ where: { id: ei.id }, data: { disabledAt: now } })
    const pausable = seats.filter((s) => !s.suspendedAt && s.role?.name !== 'Owner').map((s) => s.id)
    if (pausable.length) {
      await tx.context.updateMany({ where: { id: { in: pausable } }, data: { suspendedAt: now, suspendedById: a.actorPersonId ?? null, suspendReason: DIRECTORY_SUSPEND_REASON } })
    }
    await tx.person.update({ where: { id: ei.personId }, data: { sessionVersion: { increment: 1 }, sessionsEndedAt: now, sessionsEndedById: a.actorPersonId ?? null } })
    await recordIdentityEvent({
      event: 'USER_DEPROVISIONED', companyId: ei.companyId, actorPersonId: a.actorPersonId ?? null, subject: { personId: ei.personId }, policy, surface: a.surface,
      says: ownerKept
        ? `${ei.company.name}'s directory turned ${ei.email} off${a.why ? ` (${a.why})` : ''}: their directory sign-in and every live session ended. They are an Owner, so the seat stays until another Owner removes it.`
        : `${ei.company.name}'s directory turned ${ei.email} off${a.why ? ` (${a.why})` : ''}: their seat is paused and every live session ended.`,
    }, tx)
  })
  return ownerKept
    ? { ok: false, status: 409, says: `${ei.email} is an Owner of ${ei.company.name}. Their directory sign-in and sessions are ended, but a directory never removes an Owner's seat: another Owner removes it in Etyme.` }
    : { ok: true, says: `${ei.email}'s seat at ${ei.company.name} is paused and every live session ended.` }
}

/** The directory turned a person back on: the identity on, and only the seats the directory paused restored. */
export async function reprovision(a: { externalIdentityId: string; surface: Surface; actorPersonId?: string | null }): Promise<{ ok: true; says: string } | { ok: false; status: number; says: string }> {
  const ei = await prisma.externalIdentity.findUnique({ where: { id: a.externalIdentityId }, select: { id: true, personId: true, companyId: true, email: true, company: { select: { name: true } } } })
  if (!ei) return { ok: false, status: 404, says: 'No such person at this directory.' }
  const policy = (await companyPolicy(ei.companyId)).effective
  await prisma.$transaction(async (tx) => {
    await tx.externalIdentity.update({ where: { id: ei.id }, data: { disabledAt: null } })
    await tx.context.updateMany({
      where: { personId: ei.personId, companyId: ei.companyId, revokedAt: null, suspendReason: DIRECTORY_SUSPEND_REASON },
      data: { suspendedAt: null, suspendedById: null, suspendReason: null },
    })
    await recordIdentityEvent({
      event: 'USER_PROVISIONED', companyId: ei.companyId, actorPersonId: a.actorPersonId ?? null, subject: { personId: ei.personId }, policy, surface: a.surface,
      says: `${ei.company.name}'s directory turned ${ei.email} back on; the seat it had paused is restored.`,
    }, tx)
  })
  return { ok: true, says: `${ei.email} is back on at ${ei.company.name}.` }
}

/**
 * A directory group's role applied to one person's seat: the group's role
 * where they joined it, Member where they left it and still held its role.
 * Never an Owner's seat, never to Owner.
 */
export async function applyGroupRole(a: { companyId: string; externalIdentityId: string; groupId: string; joined: boolean; surface: Surface }): Promise<string> {
  const [map, ei] = await Promise.all([
    prisma.directoryGroupRole.findUnique({ where: { companyId_groupId: { companyId: a.companyId, groupId: a.groupId } }, select: { groupName: true, role: { select: { id: true, name: true } } } }),
    prisma.externalIdentity.findFirst({ where: { id: a.externalIdentityId, companyId: a.companyId }, select: { personId: true, email: true } }),
  ])
  if (!ei) return 'No such person at this directory.'
  if (!map) return `The group ${a.groupId} is not mapped to a role at this company, so nothing changed.`
  if (map.role.name === 'Owner') return 'A directory group never makes anybody an Owner.'
  const seats = await prisma.context.findMany({ where: { personId: ei.personId, companyId: a.companyId, revokedAt: null }, select: { id: true, roleId: true, role: { select: { name: true } } } })
  const member = a.joined ? null : await prisma.role.findFirst({ where: { companyId: a.companyId, name: MEMBER_ROLE }, select: { id: true } })
  const policy = (await companyPolicy(a.companyId)).effective
  const changed: string[] = []
  await prisma.$transaction(async (tx) => {
    for (const s of seats) {
      if (s.role?.name === 'Owner') continue
      if (a.joined && s.roleId !== map.role.id) {
        await tx.context.update({ where: { id: s.id }, data: { roleId: map.role.id } })
        changed.push(s.id)
      } else if (!a.joined && s.roleId === map.role.id) {
        await tx.context.update({ where: { id: s.id }, data: { roleId: member?.id ?? null } })
        changed.push(s.id)
      }
    }
    if (changed.length) {
      await recordIdentityEvent({
        event: 'USER_PROVISIONED', companyId: a.companyId, actorPersonId: null, subject: { personId: ei.personId }, policy, surface: a.surface,
        says: a.joined
          ? `${ei.email} joined the directory group ${map.groupName ?? a.groupId}, so their seat is now ${map.role.name}.`
          : `${ei.email} left the directory group ${map.groupName ?? a.groupId}, so their seat is now ${MEMBER_ROLE}.`,
      }, tx)
    }
  })
  return changed.length ? `${ei.email}'s seat changed.` : 'Nothing changed.'
}
