/**
 * What the Our bench routes read, and how they tell people.
 *
 * The decisions are `lib/internal-moves`; this is the half that touches
 * the database — who the caller is as a manager, who the firm's HR desk
 * is, what one person's release and hold are today — and the one place
 * every step tells HR and the person, writes its automation row and, for
 * a read of somebody, its access row.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { CallerContext } from '@/lib/api-context'
import { isConsultantSeat } from '@/lib/seat'
import { descendants } from '@/lib/org-tree'
import { notifyBulk, type NotifyParams } from '@/lib/notify'
import { recordAccess, type AccessAction } from '@/lib/access-log'
import {
  mayReadOurBench,
  holdStands,
  hrNotice,
  personNotice,
  HR_ROLE_NAMES,
  type ManagerSeat,
  type ReadVerdict,
  type Step,
  type StepFacts,
} from '@/lib/internal-moves'

export interface SeatFacts {
  verdict: ReadVerdict
  seat: ManagerSeat
  roleName: string | null
}

/** The caller as Our bench reads them: may they read it, and what do they manage. */
export async function seatFacts(caller: CallerContext): Promise<SeatFacts> {
  const [role, ctx] = await Promise.all([
    caller.context.roleId
      ? prisma.role.findUnique({ where: { id: caller.context.roleId }, select: { name: true } })
      : Promise.resolve(null),
    prisma.context.findUnique({ where: { id: caller.context.id }, select: { teamPersonIds: true, orgUnitId: true } }),
  ])
  const orgUnitId = ctx?.orgUnitId ?? caller.orgUnitId ?? null
  let unitIds: string[] = []
  if (orgUnitId && caller.company) {
    const units = await prisma.orgUnit.findMany({ where: { companyId: caller.company.id }, select: { id: true, parentId: true } })
    unitIds = [orgUnitId, ...descendants(units, orgUnitId)]
  }
  const verdict = mayReadOurBench({
    companyName: caller.company?.name ?? 'your firm',
    companyKind: caller.company?.kind ?? null,
    permissions: [...caller.permissions],
    roleName: role?.name ?? null,
    consultantSeat: isConsultantSeat(caller),
  })
  return {
    verdict,
    roleName: role?.name ?? null,
    seat: { permissions: [...caller.permissions], orgUnitId, unitIds, teamPersonIds: ctx?.teamPersonIds ?? [] },
  }
}

/** A refusal in the verdict's own sentence. */
export function refuse(code: string, message: string, status = 403): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}

/** A read or a refusal about one person, written before the answer leaves. */
export async function trail(caller: CallerContext, personId: string, action: AccessAction, reason: string, allowed = true) {
  await recordAccess([personId], {
    actorPersonId: caller.person.id,
    actorCompanyId: caller.company?.id,
    action,
    allowed,
    reason,
  })
}

/** Everybody at the firm on its HR desk, by the role's own name. */
export async function hrDesk(companyId: string): Promise<string[]> {
  const seats = await prisma.context.findMany({
    where: {
      companyId, revokedAt: null, suspendedAt: null,
      role: { name: { in: [...HR_ROLE_NAMES] } },
    },
    select: { personId: true },
  })
  return [...new Set(seats.map((s) => s.personId))]
}

/**
 * Tell HR and the person about a step.
 *
 * HR by email — which is an in-app row as well, the row is written first
 * and always (`lib/notify`) — and the person the same way. The actor is
 * never told of their own act. Awaited, because a step whose notice was
 * lost on the way out is a step HR was not told of.
 *
 * The step's own automation row is the route's to write, with its action
 * named whole on the line that writes it, so the autonomy ladder can
 * read every name (`__tests__/invariants/autonomy.test.ts`). The ids told
 * here go into that row's payload.
 */
export async function tellStep(input: {
  caller: CallerContext
  companyId: string
  personId: string
  step: Step
  facts: StepFacts
  entityId: string
}): Promise<{ hr: string[]; personTold: boolean }> {
  const hr = (await hrDesk(input.companyId)).filter((id) => id !== input.caller.person.id && id !== input.personId)
  const toHr = hrNotice(input.step, input.facts)
  const toPerson = personNotice(input.step, input.facts)
  const notes: NotifyParams[] = hr.map((personId) => ({
    personId,
    companyId: input.companyId,
    type: 'ROLLOFF' as const,
    title: toHr.title,
    body: toHr.body,
    entityId: input.entityId,
    channel: 'EMAIL' as const,
    data: { href: '/dashboard/bench?scope=payroll', step: input.step, about: input.personId },
  }))
  const personTold = input.personId !== input.caller.person.id
  if (personTold) {
    notes.push({
      personId: input.personId,
      companyId: input.companyId,
      type: 'ROLLOFF',
      title: toPerson.title,
      body: toPerson.body,
      entityId: input.entityId,
      channel: 'EMAIL',
      data: { href: '/dashboard/my-work', step: input.step },
    })
  }
  await notifyBulk(notes)
  return { hr, personTold }
}

/**
 * The hold that stands on a person today, if one does.
 *
 * A hold that ran out is ended in the record here, so the one-live-hold
 * constraint never blocks the next manager on a date nobody wrote down.
 * No row of its own: the lapse is read off the date, and the caller's
 * own step — somebody reserving, or taking a flag back — names it in
 * its payload (`lapsedHoldId`).
 */
export async function standingHold(companyId: string, personId: string, today: Date) {
  const live = await prisma.projectHold.findFirst({ where: { companyId, personId, live: 'LIVE' } })
  if (!live) return { hold: null, lapsedHoldId: null as string | null }
  if (holdStands(live, today)) return { hold: live, lapsedHoldId: null as string | null }
  await prisma.projectHold.update({
    where: { id: live.id },
    data: { live: null, endedAt: new Date(), endedHow: 'EXPIRED', endReason: 'The hold ran out on its own date.' },
  })
  return { hold: null, lapsedHoldId: live.id as string | null }
}

/** The release that stands on a person: flagged, not taken back, not yet moved. */
export async function standingRelease(companyId: string, personId: string) {
  return prisma.projectRelease.findFirst({
    where: { companyId, personId, withdrawnAt: null, holds: { none: { endedHow: 'PLACED' } } },
    orderBy: { rollsOffOn: 'desc' },
  })
}

/** A person's name, for sentences. */
export async function nameOf(personId: string): Promise<string> {
  const p = await prisma.person.findUnique({ where: { id: personId }, select: { name: true } })
  return p?.name ?? 'Somebody'
}

/** Whether this person is employed at the firm today — the only people Our bench moves. */
export async function employs(companyId: string, personId: string): Promise<boolean> {
  const now = new Date()
  const seat = await prisma.context.findFirst({
    where: {
      companyId, personId, type: 'EMPLOYEE', revokedAt: null, suspendedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true },
  })
  return seat != null
}
