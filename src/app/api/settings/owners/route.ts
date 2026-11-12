import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'
import { formatDay } from '@/lib/format-date'
import {
  OWNER_ROLE, ADMIN_ROLE, liveOwners, mayAskAboutOwner, mayAskToPass, decidersFor, expiresFrom, lapsed,
  passCardSays, ownerCardSays, onlyAnOwner, type AskerAfter,
} from '@/lib/owner-rules'
import { ADMIN_PERMISSIONS, isNarrowedAdmin } from '@/lib/company-defaults'
import { needsVerifiedOwnerAt, gateRefusal } from '@/lib/owner-proof'
import { ownersDoor, refused } from './seats'

/**
 * GET  /api/settings/owners — the Owners, the seats that could take over,
 *      and every ask waiting for a yes
 * POST /api/settings/owners — { action: 'pass', contextId, after, reason }
 *                             { action: 'remove', contextId, reason }
 *                             { action: 'demote', contextId, toRoleId, reason }
 *                             { action: 'narrow-admin', reason }
 *
 * Who owns the company (founder, 2026-11-11). Any number of Owners. Only
 * an Owner passes ownership, removes or moves an Owner, and never the last
 * one. Each of those is an ask that waits for a second person's yes: the
 * person taking over for a pass, another Owner for a removal or a move.
 * The yes is POST /api/settings/owners/:id. An Admin reads this screen and
 * acts on none of it.
 */

export async function GET(request: NextRequest) {
  const door = await ownersDoor(request)
  if (door.error) return door.error
  const { company, seats, me, personId } = door.ok
  if (me.roleName !== OWNER_ROLE && me.roleName !== ADMIN_ROLE) {
    return refused(`Who owns ${company.name} is read by its Owners and Admins.`, 403, 'FORBIDDEN')
  }
  const now = new Date()
  const [asks, roles, adminRole] = await Promise.all([
    prisma.ownershipRequest.findMany({
      where: { companyId: company.id, state: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, kind: true, askerAfter: true, reason: true, expiresAt: true, createdAt: true, askedById: true,
        askedBy: { select: { name: true } },
        subjectContextId: true,
        toRole: { select: { name: true } },
      },
    }),
    prisma.role.findMany({ where: { companyId: company.id, NOT: { name: OWNER_ROLE } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.role.findFirst({ where: { companyId: company.id, name: ADMIN_ROLE }, select: { permissions: true } }),
  ])
  const iAmOwner = me.roleName === OWNER_ROLE && me.live
  const bySeat = new Map(seats.map((s) => [s.contextId, s]))
  return NextResponse.json({
    data: {
      company: company.name,
      owners: liveOwners(seats).map((s) => ({ contextId: s.contextId, name: s.name, you: s.personId === personId })),
      others: seats.filter((s) => s.roleName !== OWNER_ROLE && s.live).map((s) => ({ contextId: s.contextId, name: s.name, role: s.roleName })),
      roles,
      iAmOwner,
      // The one press that narrows an Admin role trading companies kept
      // (coordinator's call, 2026-11-12): offered to an Owner only where
      // the Admin role still holds money or contract acts.
      narrowAdminOffered: iAmOwner && !!adminRole && !isNarrowedAdmin(adminRole.permissions),
      asks: asks
        .filter((a) => !lapsed(a.expiresAt, now))
        .map((a) => {
          const subject = bySeat.get(a.subjectContextId)
          const subjectName = subject?.name ?? 'a former seat'
          const deciders = subject ? decidersFor({ kind: a.kind, askedByPersonId: a.askedById, subject, seats }) : []
          return {
            id: a.id,
            kind: a.kind,
            subject: subjectName,
            askedBy: a.askedBy.name,
            reason: a.reason,
            waitsUntil: formatDay(a.expiresAt),
            mayDecide: deciders.some((d) => d.personId === personId) && a.askedById !== personId,
            mayCancel: a.askedById === personId,
            says: a.kind === 'PASS'
              ? passCardSays({ askerName: a.askedBy.name, companyName: company.name, after: (a.askerAfter ?? 'OWNER') as AskerAfter })
              : ownerCardSays({ kind: a.kind, askerName: a.askedBy.name, subjectName, companyName: company.name, toRoleName: a.toRole?.name ?? null, reason: a.reason, youAreSubject: subject?.personId === personId }),
          }
        }),
    },
  })
}

export async function POST(request: NextRequest) {
  const door = await ownersDoor(request)
  if (door.error) return door.error
  const { caller, company, seats, me, personId } = door.ok
  const body = await request.json().catch(() => ({}))
  const action = String(body.action ?? '')
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''

  if (!['pass', 'remove', 'demote', 'narrow-admin'].includes(action)) {
    return refused("action is 'pass', 'remove', 'demote' or 'narrow-admin'.")
  }
  if (me.roleName !== OWNER_ROLE || !me.live) {
    const doing = action === 'pass' ? 'passes ownership' : action === 'remove' ? 'removes an Owner' : action === 'demote' ? 'changes an Owner’s role' : 'narrows the Admin role'
    return refused(onlyAnOwner(doing), 403, 'FORBIDDEN')
  }
  if (!reason) return refused('Say why, in a sentence. It is kept beside the change with your name.')

  // ── Narrow the Admin role to people and settings ──
  if (action === 'narrow-admin') {
    const admin = await prisma.role.findFirst({ where: { companyId: company.id, name: ADMIN_ROLE }, select: { id: true, permissions: true } })
    if (!admin) return refused(`${company.name} has no Admin role to narrow.`, 404)
    if (isNarrowedAdmin(admin.permissions)) return refused('The Admin role already holds people and settings only.')
    await prisma.$transaction(async (tx) => {
      await tx.role.update({ where: { id: admin.id }, data: { permissions: [...ADMIN_PERMISSIONS] } })
      await tx.automationLog.create({
        data: {
          companyId: company.id,
          action: 'ADMIN_NARROWED',
          summary: `${caller!.person.name} narrowed the Admin role at ${company.name} to people, roles, settings and integrations`,
          reason,
          payload: { roleId: admin.id, was: admin.permissions, now: [...ADMIN_PERMISSIONS], byPersonId: personId },
          reversible: true,
        },
      })
    })
    return NextResponse.json({ data: { message: 'Admins now hold people, roles, settings and integrations. Give money or contract work through Finance, AP & Payroll or Contract Manager.' } })
  }

  const contextId = String(body.contextId ?? '')
  const subject = seats.find((s) => s.contextId === contextId)
  if (!subject) return refused(`Nobody at ${company.name} with that seat.`, 404)

  const open = await prisma.ownershipRequest.findFirst({ where: { companyId: company.id, subjectContextId: subject.contextId, state: 'PENDING', expiresAt: { gt: new Date() } }, select: { id: true } })
  if (open) return refused(`An ask about ${subject.name} is already waiting for a yes. Cancel it first, or wait for the answer.`, 409)

  let kind: 'PASS' | 'REMOVE' | 'DEMOTE'
  let after: AskerAfter | null = null
  let toRoleId: string | null = null
  let toRoleName: string | null = null

  if (action === 'pass') {
    const gate = await needsVerifiedOwnerAt(company.id, 'PASS_OWNERSHIP')
    if (!gate.ok) return NextResponse.json(gateRefusal(gate), { status: 403 })
    after = String(body.after ?? '') as AskerAfter
    const v = mayAskToPass({ actor: me, subject, after })
    if (!v.ok) return refused(v.says)
    kind = 'PASS'
  } else {
    kind = action === 'remove' ? 'REMOVE' : 'DEMOTE'
    if (kind === 'DEMOTE') {
      const role = await prisma.role.findFirst({ where: { id: String(body.toRoleId ?? ''), companyId: company.id }, select: { id: true, name: true } })
      toRoleId = role?.id ?? null
      toRoleName = role?.name ?? null
    }
    const v = mayAskAboutOwner({ kind, actor: me, subject, seats, toRoleName })
    if (!v.ok) return refused(v.says)
  }

  const ask = await prisma.ownershipRequest.create({
    data: {
      companyId: company.id, kind, askedById: personId, subjectContextId: subject.contextId,
      askerAfter: after, toRoleId, reason, expiresAt: expiresFrom(),
    },
    select: { id: true },
  })
  await prisma.automationLog.create({
    data: {
      companyId: company.id,
      action: 'OWNERSHIP_ASKED',
      summary: kind === 'PASS'
        ? `${caller!.person.name} asked ${subject.name} to take over ${company.name}’s ownership`
        : `${caller!.person.name} asked to ${kind === 'REMOVE' ? 'remove' : `move to ${toRoleName}`} ${subject.name} as an Owner of ${company.name}`,
      reason,
      payload: { requestId: ask.id, kind, subject: subject.personId, after, toRoleId },
      reversible: true,
    },
  })

  // The card, in Ask Etyme and by email, to whoever may say yes. Drawing
  // the card is conversation's; the notice carries its words and its id.
  const deciders = decidersFor({ kind, askedByPersonId: personId, subject, seats })
  for (const d of deciders) {
    void notify({
      personId: d.personId,
      companyId: company.id,
      type: 'SYSTEM',
      title: kind === 'PASS' ? `${caller!.person.name} wants to pass ${company.name}’s ownership to you` : `An Owner change at ${company.name} needs your yes`,
      body: kind === 'PASS'
        ? passCardSays({ askerName: caller!.person.name, companyName: company.name, after: after! })
        : ownerCardSays({ kind, askerName: caller!.person.name, subjectName: subject.name, companyName: company.name, toRoleName, reason, youAreSubject: d.personId === subject.personId }),
      entityId: ask.id,
      channel: 'EMAIL',
      data: { ownershipRequestId: ask.id, href: '/dashboard/settings/owners' },
    })
  }

  return NextResponse.json({
    data: {
      id: ask.id,
      message: kind === 'PASS'
        ? `Asked. ${subject.name} answers on a card; you are told here. If nobody answers in 7 days it lapses and nothing changes.`
        : `Asked. ${deciders.map((d) => d.name).join(' or ')} answers on a card. Nothing changes until then, and you can cancel.`,
    },
  }, { status: 201 })
}
