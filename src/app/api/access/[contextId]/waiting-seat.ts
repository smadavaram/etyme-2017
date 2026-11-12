/**
 * The waiting seat "Send the invitation again" and "Copy invitation" act
 * on, read once and judged by the one verdict the register draws from
 * (`resendVerdict` in ../../row-acts), so a press is taken only where the
 * row offered it. A refusal's row is written before it is returned.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { recordRefusal } from '@/lib/access-log'
import { hasSignedIn, OWNER_DESK } from '@/lib/access-grant'
import { realPersonId, type CallerContext } from '@/lib/api-context'
import { resendVerdict } from '../row-acts'

export interface WaitingSeat {
  id: string
  person: { id: string; name: string; primaryEmail: string; passwordHash: string | null }
  roleName: string | null
  company: { id: string; name: string }
  actorId: string
}

export async function waitingSeatFor(
  caller: CallerContext,
  contextId: string,
  doing: string,
): Promise<{ seat: WaitingSeat; refused: null } | { seat: null; refused: NextResponse }> {
  const refuse = async (status: number, code: string, message: string, personId: string | null) => {
    if (personId) {
      await recordRefusal([personId], {
        actorPersonId: caller.person.id,
        actorCompanyId: caller.company?.id,
        action: 'INVITATION_SEND_AGAIN',
        reason: `${doing}: ${message}`,
      })
    }
    return { seat: null, refused: NextResponse.json({ error: { code, message } }, { status }) }
  }

  if (!caller.company) return refuse(403, 'NO_COMPANY', 'An invitation comes from a company, and you are not signed in at one.', null)
  const ctx = await prisma.context.findFirst({
    where: { id: contextId, companyId: caller.company.id },
    select: {
      id: true, personId: true, invitedAt: true, lastUsedAt: true, suspendedAt: true, revokedAt: true, roleId: true,
      role: { select: { name: true, permissions: true } },
      person: {
        select: {
          id: true, name: true, primaryEmail: true, passwordHash: true,
          credentials: { where: { lastUsedAt: { not: null } }, select: { id: true }, take: 1 },
        },
      },
    },
  })
  // Who may, before whether the seat exists, so a seat id is never confirmed to a reader who may not act.
  if (!hasPermission(caller.permissions, 'team.manage')) {
    return refuse(403, 'FORBIDDEN', askTheDesk({
      doing, needs: 'team.manage', kind: caller.company.kind, companyName: caller.company.name,
    }), ctx?.personId ?? null)
  }
  if (!ctx) return refuse(404, 'NOT_FOUND', 'That invitation is not at this company.', null)
  const actorId = realPersonId(caller)
  if (!actorId) return refuse(403, 'PERSON_REQUIRED', 'An integration cannot do this. A person has to.', ctx.personId)

  const mine = await prisma.context.findUnique({ where: { id: caller.context.id }, select: { role: { select: { name: true } }, suspendedAt: true } })
  const verdict = resendVerdict({
    contextId: ctx.id,
    personId: ctx.personId,
    hasSignedIn: hasSignedIn({ invitedAt: ctx.invitedAt, lastUsedAt: ctx.lastUsedAt, everSignedIn: ctx.person.credentials.length > 0 }),
    roleId: ctx.roleId,
    rolePermissions: ctx.role?.permissions ?? [],
    suspendedAt: ctx.suspendedAt,
    revokedAt: ctx.revokedAt,
    isOwner: ctx.role?.name === OWNER_DESK,
    invited: ctx.invitedAt !== null,
  }, { isOwner: mine?.role?.name === OWNER_DESK && !mine?.suspendedAt, personId: caller.person.id })
  if (!verdict.allowed) return refuse(422, 'NOT_WAITING', verdict.reason, ctx.personId)

  return {
    refused: null,
    seat: {
      id: ctx.id,
      // Only the address on the person's record, never one from the request.
      person: { id: ctx.person.id, name: ctx.person.name, primaryEmail: ctx.person.primaryEmail, passwordHash: ctx.person.passwordHash },
      roleName: ctx.role?.name ?? null,
      company: { id: caller.company.id, name: caller.company.name },
      actorId,
    },
  }
}
