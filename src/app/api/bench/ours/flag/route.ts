import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { checkFlag, managesLine, cityOf, onDay, dayOf, isoDay } from '@/lib/internal-moves'
import { seatFacts, refuse, trail, tellStep, employs, standingHold } from '../facts'

function day(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null
  const d = new Date(`${v.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * POST /api/bench/ours/flag   { sellContractId, rollsOffOn, keepUntil? }
 *
 * The releasing manager says one of the firm's own people comes off this
 * project on this day — and, optionally, "staying with me until" a later
 * day. The person appears on Our bench for the firm's other managers and
 * HR; HR is told, and so is the person, who is told rather than asked.
 *
 * Flagging again moves the day: one release per line. Only a manager of
 * the project the line belongs to may flag it (`managesLine`).
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { verdict, seat } = await seatFacts(caller)
  if (!verdict.ok) return refuse(verdict.code, verdict.message)
  if (verdict.as !== 'MANAGER') {
    return refuse('NOT_A_MANAGER', 'The manager of the project flags who comes off it. HR is told; it does not flag.')
  }

  const body = await request.json().catch(() => ({}))
  const rollsOffOn = day(body.rollsOffOn)
  const keepUntil = body.keepUntil ? day(body.keepUntil) : null
  if (typeof body.sellContractId !== 'string' || !rollsOffOn || (body.keepUntil && !keepUntil)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say whose placement, and the day they come off (and, if you keep them, until when).' } },
      { status: 422 }
    )
  }

  const companyId = caller.company!.id
  const line = await prisma.sellContract.findUnique({
    where: { id: body.sellContractId },
    select: {
      id: true, companyId: true, personId: true, state: true, startDate: true, endDate: true, deliveryUnitId: true,
      person: { select: { name: true } },
      clientCompany: { select: { name: true } },
      endClientCompany: { select: { name: true } },
      workLocation: { select: { city: true } },
      requirement: { select: { location: true } },
    },
  })
  // Another firm's line is not here at all, from where this reader sits.
  if (!line || line.companyId !== companyId) return refuse('NOT_FOUND', 'That placement is not one of yours.', 404)
  if (!(await employs(companyId, line.personId))) {
    return refuse(
      'NOT_EMPLOYED',
      `${line.person.name} is not employed at ${caller.company!.name}. Our bench moves the firm’s own people; somebody on a listing is moved with their consent, from Bench.`,
      409
    )
  }

  const clientName = line.endClientCompany?.name ?? line.clientCompany.name
  const check = checkFlag({
    personName: line.person.name,
    clientName,
    lineState: line.state,
    lineStart: line.startDate,
    lineEnd: line.endDate,
    rollsOffOn,
    keepUntil,
    today: new Date(),
    manages: managesLine(seat, line),
  })
  if (!check.ok) {
    await trail(caller, line.personId, 'CONTRACT_VIEW', `Refused a roll-off flag: ${check.message}`, false)
    return refuse(check.code, check.message, check.code === 'NOT_YOUR_PROJECT' ? 403 : 409)
  }

  const existing = await prisma.projectRelease.findUnique({ where: { sellContractId: line.id } })
  if (existing && existing.releasedById !== caller.person.id && !existing.withdrawnAt) {
    // Another manager of the same project already released them; moving
    // their day is theirs to do, and the sentence says whose.
    const who = await prisma.person.findUnique({ where: { id: existing.releasedById }, select: { name: true } })
    return refuse('RELEASED_BY_ANOTHER', `${who?.name ?? 'Another manager'} already flagged ${line.person.name} to come off on ${onDay(existing.rollsOffOn)}. They move the day.`, 409)
  }
  const release = await prisma.projectRelease.upsert({
    where: { sellContractId: line.id },
    create: {
      companyId, personId: line.personId, sellContractId: line.id, releasedById: caller.person.id,
      rollsOffOn: dayOf(rollsOffOn), keepUntil: keepUntil ? dayOf(keepUntil) : null,
    },
    // A moved day is a new day to confirm.
    update: {
      releasedById: caller.person.id, rollsOffOn: dayOf(rollsOffOn), keepUntil: keepUntil ? dayOf(keepUntil) : null,
      confirmedAt: null, confirmedById: null, withdrawnAt: null,
    },
  })

  const city = cityOf(line.workLocation) ?? cityOf(line.requirement?.location ?? null)
  const told = await tellStep({
    caller,
    companyId,
    personId: line.personId,
    step: 'FLAG',
    entityId: release.id,
    facts: {
      personName: line.person.name, firmName: caller.company!.name, actorName: caller.person.name,
      fromClient: clientName, fromCity: city, rollsOffOn: release.rollsOffOn, keepUntil: release.keepUntil,
    },
  })
  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'PROJECT_RELEASE_FLAGGED',
      summary: check.says,
      reason: `${caller.person.name} manages the ${clientName} project and flagged who comes off it. HR and ${line.person.name} are told; nobody approves it.`,
      payload: { releaseId: release.id, sellContractId: line.id, rollsOffOn: isoDay(release.rollsOffOn), keepUntil: release.keepUntil ? isoDay(release.keepUntil) : null, moved: Boolean(existing), personId: line.personId, hrTold: told.hr, personTold: told.personTold } as object,
      reversible: true,
    },
  })
  await trail(caller, line.personId, 'CONTRACT_VIEW', `Flagged to come off ${clientName} on Our bench.`)

  return NextResponse.json(
    { data: { releaseId: release.id, says: check.says, freeOn: isoDay(check.freeOn), early: check.early, hrTold: told.hr.length } },
    { status: existing ? 200 : 201 }
  )
}

/**
 * DELETE /api/bench/ours/flag?releaseId=…
 *
 * The releasing manager takes the flag back: the person is staying on
 * the project after all. Refused while somebody holds them — the holder
 * is told by the hold being released first, not by the person vanishing.
 */
export async function DELETE(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { verdict } = await seatFacts(caller)
  if (!verdict.ok) return refuse(verdict.code, verdict.message)

  const id = request.nextUrl.searchParams.get('releaseId') ?? ''
  const release = await prisma.projectRelease.findUnique({ where: { id }, include: { person: { select: { name: true } } } })
  if (!release || release.companyId !== caller.company!.id) return refuse('NOT_FOUND', 'That flag is not here.', 404)
  if (release.releasedById !== caller.person.id) {
    return refuse('NOT_RELEASER', `Only the manager who flagged ${release.person.name} takes the flag back.`)
  }
  const { hold, lapsedHoldId } = await standingHold(release.companyId, release.personId, new Date())
  if (hold) {
    return refuse('HELD', `${release.person.name} is held for ${hold.forTitle}. Release the hold first, so the manager holding them hears it from you.`, 409)
  }
  await prisma.projectRelease.update({ where: { id }, data: { withdrawnAt: new Date() } })
  await prisma.automationLog.create({
    data: {
      companyId: release.companyId,
      action: 'PROJECT_RELEASE_WITHDRAWN',
      summary: `${release.person.name} is staying on the project; the roll-off flag was taken back.`,
      reason: `${caller.person.name} took back their own flag.`,
      payload: { releaseId: id, personId: release.personId, lapsedHoldId },
      reversible: true,
    },
  })
  return NextResponse.json({ data: { releaseId: id, withdrawn: true } })
}
