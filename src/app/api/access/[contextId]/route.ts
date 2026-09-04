import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import {
  stateOf,
  canSuspend,
  canReinstate,
  canRevoke,
  canDeleteOutright,
  type AccessRow,
} from '@/lib/account-lifecycle'

/**
 * POST   /api/access/:contextId   { action: 'suspend' | 'reinstate' | 'revoke', reason }
 * DELETE /api/access/:contextId   — remove somebody invited who never arrived
 *
 * Taking access away, which could not be done at all.
 *
 * An API key could be revoked, a document share could be revoked, a bench
 * listing could be revoked — a person could not. Somebody left and their
 * seat stayed live until a database edit. It also made the rest of the
 * system dishonest: the access screen reported dormant grants and the
 * watcher chased them, and neither offered any way to act on it.
 *
 * Suspension and revocation are deliberately different. Suspension is for
 * somebody coming back — a leave of absence, a lapsed visa — and keeps
 * their history and their role. Revocation ends it. Using one for the
 * other either loses the thread or leaves a live-looking seat.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contextId: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Access belongs to a company' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'team.manage')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Changing somebody’s access needs team.manage' } },
      { status: 403 }
    )
  }

  const { contextId } = await params
  const body = await request.json().catch(() => ({}))
  const action = String(body.action ?? '')
  const reason = String(body.reason ?? '').trim()

  if (!['suspend', 'reinstate', 'revoke'].includes(action)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: "action is 'suspend', 'reinstate' or 'revoke'", field: 'action' } },
      { status: 422 }
    )
  }

  // Everybody's seat at this company, because the lockout check needs to
  // know who else could let people in.
  const all = await loadAll(caller.company.id)
  const target = all.find((r) => r.contextId === contextId)
  if (!target) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Nobody here with that seat' } },
      { status: 404 }
    )
  }

  const person = await prisma.context.findUnique({
    where: { id: contextId },
    select: { person: { select: { id: true, name: true, primaryEmail: true } }, role: { select: { name: true } } },
  })
  if (!person) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Nobody here with that seat' } },
      { status: 404 }
    )
  }

  // Ending or pausing somebody's access is not a thing to do without
  // saying why. The reviewer in six months is rarely the person who did it.
  if (action !== 'reinstate' && !reason) {
    return NextResponse.json(
      {
        error: {
          code: 'REASON_REQUIRED',
          message: action === 'suspend'
            ? 'Say why they are being paused. They can be told, and somebody will ask later.'
            : 'Say why their access is ending. It goes on the record with your name.',
          field: 'reason',
        },
      },
      { status: 422 }
    )
  }

  const verdict =
    action === 'suspend' ? canSuspend(target, all)
      : action === 'reinstate' ? canReinstate(target)
        : canRevoke(target, all)

  if (!verdict.allowed) {
    return NextResponse.json(
      { error: { code: 'REFUSED', message: verdict.reason } },
      { status: 409 }
    )
  }

  const now = new Date()
  const actorId = realPersonId(caller)

  await prisma.context.update({
    where: { id: contextId },
    data:
      action === 'suspend'
        ? { suspendedAt: now, suspendedById: actorId, suspendReason: reason }
        : action === 'reinstate'
          ? { suspendedAt: null, suspendedById: null, suspendReason: null }
          : {
              revokedAt: now,
              revokedById: actorId,
              revokeReason: reason,
              // A revoked seat that is also suspended reads as two states
              // at once. Ending it clears the pause.
              suspendedAt: null,
            },
  })

  const said =
    action === 'suspend' ? `paused ${person.person.name}'s access`
      : action === 'reinstate' ? `put ${person.person.name} back`
        : `ended ${person.person.name}'s access`

  await prisma.automationLog.create({
    data: {
      companyId: caller.company.id,
      action: `ACCESS_${action.toUpperCase()}D`,
      summary: `${caller.person.name} ${said}${person.role ? ` (${person.role.name})` : ''}`,
      reason: reason || 'Suspension lifted',
      payload: { contextId, personId: person.person.id, action },
      // A pause can be lifted. An ending is a new seat, not an undo.
      reversible: action !== 'revoke',
    },
  })

  void emit({
    type: action === 'reinstate' ? 'access.granted' : 'access.revoked',
    companyId: caller.company.id,
    subjectType: 'Context',
    subjectId: contextId,
    actorPersonId: actorId,
    payload: { action, personId: person.person.id, reason: reason || null },
  })

  // Told, rather than left to discover it by being locked out. A person
  // suspended without explanation assumes it is a fault and files a ticket.
  if (action !== 'revoke') {
    void notify({
      personId: person.person.id,
      companyId: caller.company.id,
      type: 'SYSTEM',
      title: action === 'suspend'
        ? `Your access at ${caller.company.name} is paused`
        : `Your access at ${caller.company.name} is back`,
      body: action === 'suspend'
        ? `${caller.person.name} paused it: ${reason}. Nothing you have done is lost, and lifting it puts you back exactly where you were.`
        : `${caller.person.name} lifted the pause. You are back with the role you had.`,
      entityId: contextId,
      channel: 'EMAIL',
    })
  }

  return NextResponse.json({
    data: {
      contextId,
      state: action === 'suspend' ? 'SUSPENDED' : action === 'revoke' ? 'REVOKED' : 'ACTIVE',
      person: person.person.name,
      consequences: verdict.consequences,
      message:
        action === 'suspend'
          ? `${person.person.name} is paused. They have been told why, and lifting it puts them back with the same role.`
          : action === 'reinstate'
            ? `${person.person.name} is back, with the role they had.`
            : `${person.person.name} cannot sign in here again. Everything they did stays on the record with their name on it.`,
    },
  })
}

/**
 * DELETE — remove somebody invited who never arrived.
 *
 * Almost never allowed. A person who approved a timesheet or was placed on
 * a contract is part of how those are explained, and deleting them leaves
 * an approval signed by nobody.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ contextId: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company || !hasPermission(caller.permissions, 'team.manage')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Removing somebody needs team.manage' } },
      { status: 403 }
    )
  }

  const { contextId } = await params
  const ctx = await prisma.context.findFirst({
    where: { id: contextId, companyId: caller.company.id },
    select: { id: true, personId: true, lastUsedAt: true, invitedAt: true, person: { select: { name: true, primaryEmail: true } } },
  })
  if (!ctx) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Nobody here with that seat' } },
      { status: 404 }
    )
  }

  const [approvals, submissions, contracts, timesheets, otherCompanies] = await Promise.all([
    prisma.requirementApproval.count({ where: { approverId: ctx.personId } }),
    prisma.submission.count({ where: { personId: ctx.personId } }),
    prisma.sellContract.count({ where: { personId: ctx.personId } }),
    prisma.timesheet.count({ where: { personId: ctx.personId } }),
    prisma.context.count({ where: { personId: ctx.personId, companyId: { not: caller.company.id } } }),
  ])

  const verdict = canDeleteOutright({
    // An invitation nobody accepted has never been used.
    hasSignedIn: ctx.lastUsedAt !== null || ctx.invitedAt === null,
    approvals,
    submissions,
    contracts,
    timesheets,
    otherCompanies,
  })

  if (!verdict.allowed) {
    return NextResponse.json(
      { error: { code: 'HAS_HISTORY', message: verdict.reason } },
      { status: 409 }
    )
  }

  await prisma.$transaction([
    prisma.context.delete({ where: { id: contextId } }),
    // The person row goes too, but only because they exist solely as this
    // unaccepted invitation.
    prisma.person.deleteMany({ where: { id: ctx.personId, contexts: { none: {} } } }),
  ])

  await prisma.automationLog.create({
    data: {
      companyId: caller.company.id,
      action: 'INVITATION_WITHDRAWN',
      summary: `${caller.person.name} withdrew the invitation to ${ctx.person.primaryEmail}`,
      reason: 'They never signed in and nothing was attached to them',
      payload: { email: ctx.person.primaryEmail },
      reversible: false,
    },
  })

  return NextResponse.json({
    data: {
      removed: ctx.person.primaryEmail,
      message: `The invitation to ${ctx.person.primaryEmail} is gone. If they were meant to be here, invite them again.`,
    },
  })
}

async function loadAll(companyId: string): Promise<AccessRow[]> {
  const rows = await prisma.context.findMany({
    where: { companyId },
    select: {
      id: true, personId: true, roleId: true, lastUsedAt: true, invitedAt: true,
      suspendedAt: true, revokedAt: true,
      role: { select: { permissions: true } },
    },
  })

  return rows.map((r) => ({
    contextId: r.id,
    personId: r.personId,
    // Somebody invited who has never done anything has never arrived.
    hasSignedIn: r.invitedAt === null || r.lastUsedAt !== null,
    roleId: r.roleId,
    rolePermissions: r.role?.permissions ?? [],
    suspendedAt: r.suspendedAt,
    revokedAt: r.revokedAt,
  }))
}
