import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import { hasPermission, askTheDesk, type Permission } from '@/lib/permissions'
import { assessGrant, reviewAccess, sensitivityOf } from '@/lib/access-grant'

/**
 * Who may read the access register.
 *
 * ── Why this gate exists ─────────────────────────────────────────────
 *
 * It did not, until a release walk signed the demo cookie for a
 * Validation Engineer at a systems integrator — a seat holding exactly
 * `assignments.read` and `timesheets.read`, somebody who files a
 * timesheet and reads the contract they are on — and asked for this
 * route. It answered 200 with the firm's whole staff list: every
 * colleague by name and work email, the role each holds, and the
 * sensitivity of that role. The same seat was correctly refused by
 * `/api/consultants`, `/api/invoices`, `/api/purchase-orders` and
 * `/api/profitability`. POST here has asked for `settings.manage` since
 * the day it was written. Only the read was open, which is the shape
 * `etyme-money` found across nine AR and AP routes and `desks.ts` found
 * on the do-not-return list: a gate written on the write and never on
 * the read beside it.
 *
 * ── Why `governance.read` and not `settings.manage` ──────────────────
 *
 * Because a list exists to be read by more people than may change it,
 * and because who holds what IS the governance picture — it is the only
 * screen in the product that shows a segregation-of-duties problem
 * before it becomes one. Gating the read on `settings.manage` would
 * leave the Compliance Officer, whose whole job is to be able to answer
 * "who could have done this", locked out of the one page that says so;
 * at a client it would leave the Program Manager, who runs the program,
 * unable to see who is waiting for a seat in it.
 *
 * `governance.read` is held by the desks that audit rather than
 * administer: HR and the Compliance Officer at a supplier; the Program
 * Manager, the Approver, HR and Procurement at a client. Granting stays
 * where it was, on `settings.manage`, which only the Owner and the
 * Admin hold. Read the register, ask somebody else to change it.
 *
 * Named as a constant rather than spelled inline so that the nav item
 * pointing here can be checked against it — `__tests__/invariants/
 * sidebar-nav.test.ts` reads the gate back out of this handler.
 */
const TO_READ: Permission = 'governance.read'

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

  if (!hasPermission(caller.permissions, TO_READ)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Reading who holds which seat here',
            needs: TO_READ,
            kind: caller.company.kind,
            companyName: caller.company.name,
          }),
        },
      },
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
      // What this reader may actually do here, so the screen does not
      // offer a form the route will refuse. Reading opened up on
      // governance.read; granting and inviting did not move.
      canGrant: hasPermission(caller.permissions, 'settings.manage'),
      canInvite: hasPermission(caller.permissions, 'team.manage'),
      whyNotGrant: hasPermission(caller.permissions, 'settings.manage') ? null : askTheDesk({
        doing: 'Giving somebody a seat here',
        needs: 'settings.manage',
        kind: caller.company.kind,
        companyName: caller.company.name,
      }),
      whyNotInvite: hasPermission(caller.permissions, 'team.manage') ? null : askTheDesk({
        doing: 'Inviting a colleague',
        needs: 'team.manage',
        kind: caller.company.kind,
        companyName: caller.company.name,
      }),
      // `/api/why` asks for the same permission, and says why somebody
      // else cannot see something — their role, their account, their
      // company's settings. Its own sentence, because "inviting a
      // colleague" is not what the reader was trying to do.
      whyNotExplain: hasPermission(caller.permissions, 'team.manage') ? null : askTheDesk({
        doing: 'Working out why a colleague cannot see something',
        needs: 'team.manage',
        kind: caller.company.kind,
        companyName: caller.company.name,
      }),
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
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Giving somebody a seat here',
            needs: 'settings.manage',
            kind: caller.company.kind,
            companyName: caller.company.name,
          }),
        },
      },
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
