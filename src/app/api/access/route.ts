import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import { hasPermission } from '@/lib/permissions'
import { assessGrant, reviewAccess, sensitivityOf } from '@/lib/access-grant'

/**
 * GET  /api/access — who has what here, and what is worth attention
 * POST /api/access — grant somebody a role
 *
 * The path a joiner is waiting on. Someone signed in on a verified company
 * domain, got a seat and no permissions, and this is where a colleague
 * decides what they may do.
 *
 * Every grant ends on a date. Renewing is a click, forgetting is safe.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'The access register')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Access belongs to a company' } },
      { status: 403 }
    )
  }

  const contexts = await prisma.context.findMany({
    where: { companyId: caller.company.id, revokedAt: null },
    include: {
      person: { select: { id: true, name: true, primaryEmail: true } },
      role: { select: { id: true, name: true, permissions: true } },
    },
    orderBy: { grantedAt: 'desc' },
  })

  const now = new Date()
  const review = reviewAccess(
    contexts
      .filter(c => c.role)
      .map(c => ({
        contextId: c.id,
        personName: c.person.name,
        roleName: c.role!.name,
        permissions: c.role!.permissions,
        grantedAt: c.grantedAt,
        expiresAt: c.expiresAt,
        lastUsedAt: c.lastUsedAt,
      })),
    now
  )

  const waiting = contexts.filter(c => !c.roleId)

  return NextResponse.json({
    data: {
      // People who joined on the domain and can see nothing yet. This is
      // the queue that matters — somebody is sitting there unable to work.
      waitingForAccess: waiting.map(c => ({
        contextId: c.id,
        person: c.person,
        joinedAt: c.grantedAt.toISOString(),
        waitingDays: Math.floor((now.getTime() - c.grantedAt.getTime()) / 86_400_000),
      })),
      people: contexts.filter(c => c.role).map(c => ({
        contextId: c.id,
        person: c.person,
        role: c.role!.name,
        sensitivity: sensitivityOf(c.role!.permissions),
        grantedAt: c.grantedAt.toISOString(),
        expiresAt: c.expiresAt?.toISOString() ?? null,
        lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
        reason: c.grantReason,
      })),
      // Only what needs a decision. A review that lists everybody is a
      // review nobody reads.
      review,
      summary: {
        waiting: waiting.length,
        withAccess: contexts.filter(c => c.role).length,
        needsAttention: review.length,
        expired: review.filter(r => r.finding === 'EXPIRED').length,
        dormant: review.filter(r => r.finding === 'DORMANT').length,
      },
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Access belongs to a company' } },
      { status: 403 }
    )
  }

  if (!hasPermission(caller.permissions, 'settings.manage')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Only somebody who manages settings can grant access' } },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { contextId, roleId, days, reason } = body

  const target = await prisma.context.findFirst({
    where: { id: contextId, companyId: caller.company.id },
    include: { person: { select: { id: true, name: true } } },
  })
  if (!target) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That person is not at this company' } },
      { status: 404 }
    )
  }

  const role = await prisma.role.findFirst({
    where: { id: roleId, companyId: caller.company.id },
    select: { id: true, name: true, permissions: true },
  })
  if (!role) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such role at this company' } },
      { status: 404 }
    )
  }

  // How many other live accounts here could grant access, if this one went.
  const otherCritical = await prisma.context.count({
    where: {
      companyId: caller.company.id,
      revokedAt: null,
      id: { not: target.id },
      role: { permissions: { hasSome: ['*', 'settings.manage'] } },
    },
  })

  const decision = assessGrant({
    roleName: role.name,
    permissions: role.permissions,
    requestedDays: days === null || days === undefined ? null : Number(days),
    reason: String(reason ?? ''),
    selfGranted: target.personId === caller.person.id,
    otherHoldersOfCritical: otherCritical,
  })

  if (!decision.allowed) {
    return NextResponse.json(
      {
        error: {
          code: 'GRANT_REFUSED',
          message: decision.summary,
          checks: decision.checks.filter(c => c.outcome === 'BLOCK'),
        },
      },
      { status: 422 }
    )
  }

  const expiresAt = decision.expiresInDays === null
    ? null
    : new Date(Date.now() + decision.expiresInDays * 86_400_000)

  await prisma.context.update({
    where: { id: target.id },
    data: {
      roleId: role.id,
      grantedById: caller.person.id,
      grantedAt: new Date(),
      expiresAt,
      grantReason: String(reason).trim(),
      // Reset on every grant. A renewal that inherits the old usage date
      // would report the access as active when nobody has touched it.
      lastUsedAt: null,
    },
  })

  await prisma.automationLog.create({
    data: {
      companyId: caller.company.id,
      action: 'ACCESS_GRANTED',
      summary: `${caller.person.name} gave ${target.person.name} ${role.name}${expiresAt ? ` until ${expiresAt.toISOString().slice(0, 10)}` : ''}`,
      reason: String(reason).trim(),
      payload: {
        contextId: target.id,
        roleId: role.id,
        sensitivity: decision.sensitivity,
        expiresAt: expiresAt?.toISOString() ?? null,
        notes: decision.checks.filter(c => c.outcome === 'WARN').map(c => c.reason),
      },
      reversible: true,
    },
  })

  void emit({
    type: 'access.granted',
    companyId: caller.company.id,
    subjectType: 'Context',
    subjectId: target.id,
    actorPersonId: caller.person.id,
    payload: {
      personId: target.person.id,
      roleId: role.id,
      roleName: role.name,
      sensitivity: decision.sensitivity,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  })

  // The other half of the join notification. Somebody has been waiting,
  // and an access grant they are never told about is one they find by
  // trying the page again on a hunch.
  void notify({
    personId: target.person.id,
    companyId: caller.company.id,
    type: 'SYSTEM',
    title: `You can now work as ${role.name}`,
    body: expiresAt
      ? `${caller.person.name} gave you ${role.name} at ${caller.company.name}. It runs until ${expiresAt.toISOString().slice(0, 10)}.`
      : `${caller.person.name} gave you ${role.name} at ${caller.company.name}.`,
    entityId: target.id,
  })

  return NextResponse.json(
    {
      data: {
        contextId: target.id,
        person: target.person.name,
        role: role.name,
        sensitivity: decision.sensitivity,
        expiresAt: expiresAt?.toISOString().slice(0, 10) ?? null,
        notes: decision.checks.filter(c => c.outcome === 'WARN').map(c => c.reason),
        message: expiresAt
          ? `${target.person.name} can now work as ${role.name}. This ends on ${expiresAt.toISOString().slice(0, 10)} unless renewed.`
          : `${target.person.name} has read-only access with no end date.`,
      },
    },
    { status: 201 }
  )
}
