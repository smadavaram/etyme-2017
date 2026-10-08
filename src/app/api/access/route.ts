import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import { hasPermission, askTheDesk, type Permission } from '@/lib/permissions'
import {
  assessGrant, reviewAccess, sensitivityOf, deskLine, waitingLine,
  assessDeskChange, canGiveDesks, OWNER_DESK,
  hasSignedIn, seatPlace, deskChangedNotice, needsDecisionCount,
} from '@/lib/access-grant'
import { consoleHome, type CompanyKind } from '@/lib/console-home'

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
      person: {
        select: {
          id: true, name: true, primaryEmail: true,
          // Any sign-in anywhere on Etyme. The seat's own use date is
          // cleared by a desk change, so it cannot answer this alone.
          credentials: { where: { lastUsedAt: { not: null } }, select: { id: true }, take: 1 },
        },
      },
      role: { select: { id: true, name: true, permissions: true } },
    },
    orderBy: { grantedAt: 'desc' },
  })

  const now = new Date()

  // An invitation is not access, whatever desk it carries. A seat with no
  // desk, or whose person has never signed in, waits; the rest have access.
  const signedInOf = (c: (typeof contexts)[number]) => hasSignedIn({
    invitedAt: c.invitedAt,
    lastUsedAt: c.lastUsedAt,
    everSignedIn: c.person.credentials.length > 0,
  })
  const withAccess = contexts.filter(c => seatPlace({ roleName: c.role?.name ?? null, signedIn: signedInOf(c) }) === 'WITH_ACCESS')
  const waiting = contexts.filter(c => seatPlace({ roleName: c.role?.name ?? null, signedIn: signedInOf(c) }) === 'WAITING')
  const personOf = (c: (typeof contexts)[number]) => ({ id: c.person.id, name: c.person.name, primaryEmail: c.person.primaryEmail })

  const review = reviewAccess(
    withAccess
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

  // Whether the reader holds Owner, so the desk picker offers Owner only
  // to an Owner. The route refuses the same thing on POST.
  const mine = contexts.find(c => c.id === caller.context.id)
  const actorIsOwner = mine?.role?.name === OWNER_DESK

  return NextResponse.json({
    data: {
      // People who joined on the domain and have no desk yet. This is
      // the queue that matters — somebody is sitting there unable to work.
      //
      // An invitation is not a sign-in: somebody invited who never came
      // in reads "Invited today, not yet signed in", and "joined" is said
      // only of a seat that has been used. Signed in is the rule the
      // withdraw route already uses: never invited, or used since.
      waitingForAccess: waiting.map(c => {
        // Counted from the invitation where there was one: a desk given
        // before they came in moves grantedAt, not the day they were asked.
        const since = c.invitedAt ?? c.grantedAt
        const waitingDays = Math.floor((now.getTime() - since.getTime()) / 86_400_000)
        const invited = c.invitedAt !== null
        const signedIn = signedInOf(c)
        return {
          contextId: c.id,
          person: personOf(c),
          joinedAt: c.grantedAt.toISOString(),
          waitingDays,
          invited,
          signedIn,
          // The desk they will have when they come in, or null.
          role: c.role?.name ?? null,
          roleId: c.role?.id ?? null,
          said: waitingLine({ invited, signedIn, days: waitingDays, desk: c.role?.name ?? null }),
        }
      }),
      people: withAccess.map(c => ({
        contextId: c.id,
        person: personOf(c),
        role: c.role!.name,
        roleId: c.role!.id,
        // "Member · give them a desk" for the seat everybody arrives on.
        line: deskLine(c.role!.name),
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
      actorIsOwner,
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
        withAccess: withAccess.length,
        // Every review finding plus every Member waiting for a desk: a
        // Member reads "give them a desk" on the list, so it is counted.
        needsAttention: needsDecisionCount(
          review,
          withAccess.map(c => ({ contextId: c.id, roleName: c.role!.name })),
        ),
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
    where: { id: contextId, companyId: caller.company.id, revokedAt: null },
    include: {
      person: { select: { id: true, name: true } },
      role: { select: { name: true, permissions: true } },
    },
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

  // ── Changing a desk, not only giving a first one ──
  // The same POST gives a waiting person their first desk and moves a
  // seated person to another, so the rules for moving sit here too: Owner
  // only by an Owner, an Owner's desk changed only by an Owner, and never
  // the last person who can give desks moved off it.
  const actor = await prisma.context.findUnique({
    where: { id: caller.context.id },
    select: { role: { select: { name: true } } },
  })
  const othersWhoCanGiveDesks = await prisma.context.count({
    where: {
      companyId: caller.company.id,
      revokedAt: null,
      suspendedAt: null,
      id: { not: target.id },
      role: { permissions: { hasSome: ['*', 'settings.manage'] } },
    },
  })
  const move = assessDeskChange({
    fromRole: target.role?.name ?? null,
    toRole: role.name,
    actorIsOwner: actor?.role?.name === OWNER_DESK,
    fromCanGiveDesks: canGiveDesks(target.role?.permissions ?? []),
    toCanGiveDesks: canGiveDesks(role.permissions),
    othersWhoCanGiveDesks,
    personName: target.person.name,
  })
  if (!move.allowed) {
    return NextResponse.json(
      { error: { code: 'DESK_REFUSED', message: move.says } },
      { status: 422 }
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
      summary: `${caller.person.name} gave ${target.person.name} ${role.name}${target.role ? ` (was ${target.role.name})` : ''}${expiresAt ? ` until ${expiresAt.toISOString().slice(0, 10)}` : ''}`,
      reason: String(reason).trim(),
      payload: {
        contextId: target.id,
        roleId: role.id,
        sensitivity: decision.sensitivity,
        expiresAt: expiresAt?.toISOString() ?? null,
        fromRole: target.role?.name ?? null,
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
  //
  // Email as well as in the app (round two of the sign-up walk, 14): a
  // Member waiting on a desk is not sitting in the app refreshing it. One
  // notice on the normal path, so the in-app row and the email are the
  // same words, and the link opens the page the new desk lands on.
  const notice = deskChangedNotice({
    roleName: role.name,
    companyName: caller.company.name,
    expiresAt,
    landing: consoleHome({
      kind: (caller.company.kind ?? null) as CompanyKind | null,
      permissions: role.permissions,
    }).href,
  })
  void notify({
    personId: target.person.id,
    companyId: caller.company.id,
    type: 'SYSTEM',
    channel: 'EMAIL',
    title: notice.title,
    body: notice.body,
    entityId: target.id,
    data: { href: notice.href },
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
