import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { notify } from '@/lib/notify'
import { checkHold, managesLine, cityOf, isoDay } from '@/lib/internal-moves'
import { seatFacts, refuse, trail, tellStep, standingHold, standingRelease, employs, nameOf } from '../facts'

function day(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null
  const d = new Date(`${v.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * POST /api/bench/ours/holds   { personId, sellContractId? | requirementId?, until? }
 *
 * A manager reserves one of the firm's own people for his open position:
 * a line on his own project's order (`sellContractId`, the line whose
 * terms a new one copies) or a client's job request the firm may answer
 * (`requirementId`). One hold at a time — the database admits one live
 * hold per person (`ProjectHold.live`), and a second is refused in a
 * sentence naming who holds them and until when.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { verdict, seat } = await seatFacts(caller)
  if (!verdict.ok) return refuse(verdict.code, verdict.message)

  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))
  const personId = typeof body.personId === 'string' ? body.personId : ''
  if (!personId) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say whom you are reserving.' } }, { status: 422 })
  if (!(await employs(companyId, personId))) return refuse('NOT_FOUND', 'That person is not on your bench.', 404)
  const name = await nameOf(personId)
  const now = new Date()

  // The position, from the record — never a title typed in.
  let position: { title: string; client: string | null; city: string | null; workOrderId?: string; sellContractId?: string; requirementId?: string } | null = null
  if (typeof body.sellContractId === 'string') {
    const line = await prisma.sellContract.findUnique({
      where: { id: body.sellContractId },
      select: {
        id: true, companyId: true, personId: true, state: true, workOrderId: true, deliveryUnitId: true,
        clientCompany: { select: { name: true } }, endClientCompany: { select: { name: true } },
        workLocation: { select: { city: true } }, requirement: { select: { title: true, location: true } },
        workOrder: { select: { title: true } },
      },
    })
    if (!line || line.companyId !== companyId) return refuse('NOT_FOUND', 'That project is not one of yours.', 404)
    if (!line.workOrderId) {
      return refuse('NO_ORDER', 'That project has no order to put a new line on. Hold them for the client’s job request instead.', 409)
    }
    if (!managesLine(seat, line)) {
      return refuse('NOT_YOUR_PROJECT', 'You hold somebody for a project you manage. That one is another manager’s.')
    }
    const client = line.endClientCompany?.name ?? line.clientCompany.name
    const city = cityOf(line.workLocation) ?? cityOf(line.requirement?.location ?? null)
    position = {
      title: `${line.requirement?.title ?? line.workOrder?.title ?? 'the project'} at ${client}`,
      client, city, workOrderId: line.workOrderId, sellContractId: line.id,
    }
  } else if (typeof body.requirementId === 'string') {
    if (!hasPermission(caller.permissions, 'submissions.create')) {
      return refuse(
        'NO_PERMISSION',
        `Putting ${name} forward to a client’s job request is the recruiting desk’s job at ${caller.company!.name}. Hold them for your own project’s order, or ask a resource manager.`
      )
    }
    const req = await prisma.requirement.findUnique({
      where: { id: body.requirementId },
      select: {
        id: true, title: true, status: true, companyId: true, location: true,
        company: { select: { name: true } }, endClientCompany: { select: { name: true } },
        invitations: { where: { toCompanyId: companyId, status: { in: ['SENT', 'ACCEPTED'] } }, select: { id: true } },
      },
    })
    if (!req || (req.companyId !== companyId && req.invitations.length === 0)) {
      return refuse('NOT_FOUND', 'That job request was not sent to your firm.', 404)
    }
    if (req.status !== 'OPEN') return refuse('NOT_OPEN', `${req.title} is not open.`, 409)
    const client = req.endClientCompany?.name ?? req.company.name
    position = { title: `${req.title} at ${client}`, client, city: cityOf(req.location), requirementId: req.id }
  }

  const release = await standingRelease(companyId, personId)
  const { hold: standing, lapsedHoldId } = await standingHold(companyId, personId, now)
  const holderName = standing ? await nameOf(standing.heldById) : ''
  const check = checkHold({
    personName: name,
    callerId: caller.person.id,
    releaserId: release?.releasedById ?? null,
    standing: standing ? { heldById: standing.heldById, heldByName: holderName, forTitle: standing.forTitle, until: standing.until } : null,
    isManager: verdict.as === 'MANAGER',
    untilAsked: body.until ? day(body.until) : null,
    hasPosition: position != null,
    today: now,
  })
  if (!check.ok) {
    await trail(caller, personId, 'RELEASING_SOON_VIEW', `Refused a hold: ${check.message}`, false)
    return refuse(check.code, check.message, check.code === 'NOT_A_MANAGER' ? 403 : 409)
  }

  let hold
  try {
    hold = await prisma.projectHold.create({
      data: {
        companyId, personId, releaseId: release?.id ?? null, heldById: caller.person.id,
        forRequirementId: position!.requirementId ?? null,
        forWorkOrderId: position!.workOrderId ?? null,
        forSellContractId: position!.sellContractId ?? null,
        forTitle: position!.title, until: check.until,
      },
    })
  } catch (e: any) {
    // Two managers in the same second: the database kept one, and the
    // other is told whose it is, in the same sentence as ever.
    if (e?.code !== 'P2002') throw e
    const won = await prisma.projectHold.findFirst({ where: { personId, live: 'LIVE' } })
    const by = won ? await nameOf(won.heldById) : 'another manager'
    return refuse('HELD', `${name} is held by ${by}${won ? ` for ${won.forTitle}` : ''}. Ask ${by}.`, 409)
  }

  const releaser = release ? await prisma.projectRelease.findUnique({ where: { id: release.id }, select: { sellContract: { select: { endClientCompany: { select: { name: true } }, clientCompany: { select: { name: true } } } } } }) : null
  const told = await tellStep({
    caller,
    companyId,
    personId,
    step: 'HOLD',
    entityId: hold.id,
    facts: {
      personName: name, firmName: caller.company!.name, actorName: caller.person.name,
      forTitle: position!.title, toClient: position!.client, toCity: position!.city, until: hold.until,
      fromClient: releaser?.sellContract.endClientCompany?.name ?? releaser?.sellContract.clientCompany.name ?? null,
    },
  })
  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'PROJECT_HOLD_TAKEN',
      summary: `${caller.person.name} holds ${name} for ${position!.title} until ${isoDay(hold.until)}.`,
      reason: 'One hold at a time; this manager asked first. HR and the person are told; nobody approves it.',
      payload: { holdId: hold.id, releaseId: release?.id ?? null, lapsedHoldId, forTitle: position!.title, until: isoDay(hold.until), personId, hrTold: told.hr, personTold: told.personTold } as object,
      reversible: true,
    },
  })
  // The releasing manager hears it as well, in the app: it is their person.
  if (release && release.releasedById !== caller.person.id) {
    await notify({
      personId: release.releasedById, companyId, type: 'ROLLOFF',
      title: `${caller.person.name} is holding ${name} for ${position!.title}`,
      body: `Until ${isoDay(hold.until)}. Confirm ${name}’s last day when you are sure of it, so they can be placed.`,
      entityId: hold.id,
    })
  }
  await trail(caller, personId, 'RELEASING_SOON_VIEW', `Held for ${position!.title}.`)

  return NextResponse.json({ data: { holdId: hold.id, until: isoDay(hold.until), says: check.says, hrTold: told.hr.length } }, { status: 201 })
}
