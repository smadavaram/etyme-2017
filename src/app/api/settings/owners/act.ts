/**
 * The writes behind an Owner ask once its yes lands: pass ownership,
 * remove an Owner, move an Owner to another role. Each lands in one
 * transaction with the ask marked accepted and the row in the log, so a
 * half-passed ownership cannot exist.
 *
 * Nothing about the company moves: the address, the bank check, the signed
 * agreements and every record stay; what a person did stays under their
 * name. Only seats change.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { ADMIN_PERMISSIONS, ADMIN_ROLE } from '@/lib/company-defaults'
import { OWNER_ROLE, passedLine, type AskerAfter } from '@/lib/owner-rules'
import { recordIdentityEvent } from '@/lib/identity/ledger'
import { companyPolicy } from '@/lib/identity/read'

type Tx = Prisma.TransactionClient

/** The company's Admin role, made narrowed where the company has none (a client formed before 2026-11-12). */
export async function adminRoleId(tx: Tx, companyId: string): Promise<string> {
  const have = await tx.role.findFirst({ where: { companyId, name: ADMIN_ROLE }, select: { id: true } })
  if (have) return have.id
  const made = await tx.role.create({ data: { companyId, name: ADMIN_ROLE, permissions: [...ADMIN_PERMISSIONS], isDefault: false }, select: { id: true } })
  return made.id
}

export async function ownerRoleId(tx: Tx, companyId: string): Promise<string> {
  const r = await tx.role.findFirst({ where: { companyId, name: OWNER_ROLE }, select: { id: true } })
  if (!r) throw new Error('This company has no Owner role.')
  return r.id
}

interface Landing {
  requestId: string
  company: { id: string; name: string }
  decider: { personId: string; name: string }
  asker: { personId: string; name: string; contextId: string | null }
  subject: { personId: string; name: string; contextId: string }
  reason: string
}

/** Both changes of a pass in one step: the subject is an Owner, the asker what they chose. */
export async function landPass(l: Landing & { after: AskerAfter }): Promise<string> {
  const now = new Date()
  const policy = l.after === 'LEAVE' ? (await companyPolicy(l.company.id)).effective : null
  await prisma.$transaction(async (tx) => {
    const owner = await ownerRoleId(tx, l.company.id)
    await tx.context.update({
      where: { id: l.subject.contextId },
      data: { roleId: owner, grantedById: l.asker.personId, grantedAt: now, grantReason: `Ownership passed: ${l.reason}`, expiresAt: null },
    })
    if (l.asker.contextId && l.after === 'ADMIN') {
      await tx.context.update({
        where: { id: l.asker.contextId },
        data: { roleId: await adminRoleId(tx, l.company.id), grantedById: l.asker.personId, grantedAt: now, grantReason: 'Passed ownership and stayed as an Admin', expiresAt: null },
      })
    }
    if (l.asker.contextId && l.after === 'LEAVE') {
      await tx.context.update({
        where: { id: l.asker.contextId },
        data: { revokedAt: now, revokedById: l.asker.personId, revokeReason: 'Passed ownership and left', suspendedAt: null },
      })
      await recordIdentityEvent({
        event: 'MEMBERSHIP_REVOKED', companyId: l.company.id, actorPersonId: l.asker.personId,
        subject: { personId: l.asker.personId }, policy: policy!, surface: 'WEB',
        says: `${l.asker.name} passed ${l.company.name}’s ownership to ${l.subject.name} and left.`,
      }, tx)
    }
    await tx.ownershipRequest.update({ where: { id: l.requestId }, data: { state: 'ACCEPTED', decidedById: l.decider.personId, decidedAt: now } })
    await tx.automationLog.create({
      data: {
        companyId: l.company.id,
        action: 'OWNERSHIP_PASSED',
        summary: passedLine({ askerName: l.asker.name, subjectName: l.subject.name, after: l.after }),
        reason: l.reason,
        payload: { requestId: l.requestId, from: l.asker.personId, to: l.subject.personId, after: l.after, at: now.toISOString() },
        reversible: true,
      },
    })
  })
  return passedLine({ askerName: l.asker.name, subjectName: l.subject.name, after: l.after })
}

/** An Owner removed (their seat ended) or moved to another role, on another Owner's yes. */
export async function landOwnerChange(l: Landing & { kind: 'REMOVE' | 'DEMOTE'; toRoleId: string | null; toRoleName: string | null }): Promise<string> {
  const now = new Date()
  const policy = l.kind === 'REMOVE' ? (await companyPolicy(l.company.id)).effective : null
  const says = l.kind === 'REMOVE'
    ? `${l.subject.name} is no longer an Owner of ${l.company.name}. ${l.asker.name} asked and ${l.decider.name} said yes. Everything they did stays under their name.`
    : `${l.subject.name} moved from Owner to ${l.toRoleName} at ${l.company.name}. ${l.asker.name} asked and ${l.decider.name} said yes.`
  await prisma.$transaction(async (tx) => {
    if (l.kind === 'REMOVE') {
      await tx.context.update({
        where: { id: l.subject.contextId },
        data: { revokedAt: now, revokedById: l.asker.personId, revokeReason: l.reason, suspendedAt: null },
      })
      await recordIdentityEvent({
        event: 'MEMBERSHIP_REVOKED', companyId: l.company.id, actorPersonId: l.asker.personId,
        subject: { personId: l.subject.personId }, policy: policy!, surface: 'WEB',
        says: `${l.asker.name} removed ${l.subject.name} as an Owner of ${l.company.name}, with ${l.decider.name}’s yes: ${l.reason}`,
      }, tx)
    } else {
      await tx.context.update({
        where: { id: l.subject.contextId },
        data: { roleId: l.toRoleId, grantedById: l.asker.personId, grantedAt: now, grantReason: l.reason },
      })
    }
    await tx.ownershipRequest.update({ where: { id: l.requestId }, data: { state: 'ACCEPTED', decidedById: l.decider.personId, decidedAt: now } })
    await tx.automationLog.create({
      data: {
        companyId: l.company.id,
        action: l.kind === 'REMOVE' ? 'OWNER_REMOVED' : 'OWNER_MOVED',
        summary: says,
        reason: l.reason,
        payload: { requestId: l.requestId, subject: l.subject.personId, askedBy: l.asker.personId, decidedBy: l.decider.personId, toRole: l.toRoleName, at: now.toISOString() },
        // A move can be moved back by an Owner; an ended seat is a new seat, not an undo.
        reversible: l.kind === 'DEMOTE',
      },
    })
  })
  return says
}
