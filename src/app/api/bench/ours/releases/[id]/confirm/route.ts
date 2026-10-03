import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'
import { checkConfirm, cityOf, isoDay } from '@/lib/internal-moves'
import { seatFacts, refuse, tellStep, nameOf } from '../../../facts'

/**
 * POST /api/bench/ours/releases/:id/confirm
 *
 * The releasing manager confirms the day somebody comes off. Nobody is
 * placed on a flagged person before this: the receiving manager's start
 * date hangs off it. Only the manager who flagged them confirms.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { verdict } = await seatFacts(caller)
  if (!verdict.ok) return refuse(verdict.code, verdict.message)

  const { id } = await params
  const release = await prisma.projectRelease.findUnique({
    where: { id },
    include: {
      person: { select: { name: true } },
      sellContract: {
        select: {
          clientCompany: { select: { name: true } }, endClientCompany: { select: { name: true } },
          workLocation: { select: { city: true } }, requirement: { select: { location: true } },
        },
      },
    },
  })
  if (!release || release.companyId !== caller.company!.id) return refuse('NOT_FOUND', 'That flag is not here.', 404)

  const check = checkConfirm({
    callerId: caller.person.id,
    releaserId: release.releasedById,
    releaserName: await nameOf(release.releasedById),
    personName: release.person.name,
    withdrawn: release.withdrawnAt != null,
    rollsOffOn: release.rollsOffOn,
  })
  if (!check.ok) return refuse(check.code, check.message, check.code === 'NOT_RELEASER' ? 403 : 409)
  if (release.confirmedAt) {
    return NextResponse.json({ data: { releaseId: id, confirmedAt: release.confirmedAt.toISOString(), says: check.says } })
  }

  const updated = await prisma.projectRelease.update({
    where: { id },
    data: { confirmedAt: new Date(), confirmedById: caller.person.id },
  })
  const sc = release.sellContract
  const told = await tellStep({
    caller,
    companyId: release.companyId,
    personId: release.personId,
    step: 'CONFIRM',
    entityId: id,
    facts: {
      personName: release.person.name, firmName: caller.company!.name, actorName: caller.person.name,
      fromClient: sc.endClientCompany?.name ?? sc.clientCompany.name,
      fromCity: cityOf(sc.workLocation) ?? cityOf(sc.requirement?.location ?? null),
      rollsOffOn: release.rollsOffOn,
    },
  })
  await prisma.automationLog.create({
    data: {
      companyId: release.companyId,
      action: 'PROJECT_RELEASE_CONFIRMED',
      summary: check.says,
      reason: `${caller.person.name} flagged ${release.person.name} and confirmed the day.`,
      payload: { releaseId: id, rollsOffOn: isoDay(release.rollsOffOn), personId: release.personId, hrTold: told.hr, personTold: told.personTold } as object,
      reversible: true,
    },
  })
  // Whoever holds them may place them now, and hears it.
  const hold = await prisma.projectHold.findFirst({ where: { releaseId: id, live: 'LIVE' } })
  if (hold) {
    await notify({
      personId: hold.heldById, companyId: release.companyId, type: 'ROLLOFF',
      title: `${release.person.name}’s last day is confirmed: ${isoDay(release.rollsOffOn)}`,
      body: `You hold them for ${hold.forTitle}. You can place them now.`,
      entityId: hold.id,
    })
  }
  return NextResponse.json({ data: { releaseId: id, confirmedAt: updated.confirmedAt!.toISOString(), says: check.says } })
}
