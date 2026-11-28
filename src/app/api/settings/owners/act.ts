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
import { OWNER_ROLE, movedAfterPassSays, type AskerAfter } from '@/lib/owner-rules'
import {
  passDoneForNewOwner, passDoneForAsker, passDoneTitleForAsker, passDoneForOthers, saidNoTitle, saidNoBody,
  type PassFacts, type NoFacts,
} from '@/lib/notify/owner-words'
import { notify } from '@/lib/notify'
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

/**
 * What a landed pass says, to each reader in their own words (the Owner
 * walk, 2026-11-12, lib/notify/owner-words): the person who took over reads
 * the answer in the second person, the Owner who passed it reads the notice
 * in the second person, and the log reads plain third person.
 */
export function passLandedWords(f: PassFacts): { forNewOwner: string; forAsker: { title: string; body: string }; forRecord: string } {
  return {
    forNewOwner: passDoneForNewOwner(f),
    forAsker: { title: passDoneTitleForAsker(f), body: passDoneForAsker(f) },
    forRecord: passDoneForOthers(f),
  }
}

/** The notice the Owner who asked reads when the answer is no. */
export function saidNoNotice(f: NoFacts): { title: string; body: string } {
  return { title: saidNoTitle(f), body: saidNoBody(f) }
}

/** Both changes of a pass in one step: the subject is an Owner, the asker what they chose. */
export async function landPass(l: Landing & { after: AskerAfter }): Promise<ReturnType<typeof passLandedWords>> {
  const words = passLandedWords({ askerName: l.asker.name, subjectName: l.subject.name, companyName: l.company.name, after: l.after })
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
        summary: words.forRecord,
        reason: l.reason,
        payload: { requestId: l.requestId, from: l.asker.personId, to: l.subject.personId, after: l.after, at: now.toISOString() },
        reversible: true,
      },
    })
  })
  return words
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

/** The people whose pass of ownership to this seat was accepted. */
export async function passedToSeatBy(companyId: string, contextId: string): Promise<string[]> {
  const rows = await prisma.ownershipRequest.findMany({
    where: { companyId, kind: 'PASS', state: 'ACCEPTED', subjectContextId: contextId },
    select: { askedById: true },
  })
  return [...new Set(rows.map((r) => r.askedById))]
}

/**
 * The Owner who took over by a pass moves the previous Owner to Admin
 * alone (lib/owner-rules `movesAloneAfterPass` decides; this writes). One
 * transaction: the seat moved and the log row, with who and when; then
 * the previous Owner is told.
 */
export async function landMoveAfterPass(l: {
  company: { id: string; name: string }
  actor: { personId: string; name: string }
  subject: { personId: string; name: string; contextId: string }
  reason: string
}): Promise<string> {
  const now = new Date()
  const says = movedAfterPassSays({ actorName: l.actor.name, subjectName: l.subject.name, companyName: l.company.name })
  await prisma.$transaction(async (tx) => {
    await tx.context.update({
      where: { id: l.subject.contextId },
      data: { roleId: await adminRoleId(tx, l.company.id), grantedById: l.actor.personId, grantedAt: now, grantReason: `Moved to Admin after passing ownership: ${l.reason}` },
    })
    await tx.automationLog.create({
      data: {
        companyId: l.company.id,
        action: 'OWNER_MOVED',
        summary: says,
        reason: l.reason,
        payload: { subject: l.subject.personId, by: l.actor.personId, toRole: ADMIN_ROLE, afterPass: true, at: now.toISOString() },
        reversible: true,
      },
    })
  })
  void notify({
    personId: l.subject.personId,
    companyId: l.company.id,
    type: 'SYSTEM',
    title: `You are now an Admin at ${l.company.name}`,
    body: `${says} Reason: ${l.reason}`,
    channel: 'EMAIL',
    data: { href: '/dashboard/settings/owners' },
  })
  return says
}
