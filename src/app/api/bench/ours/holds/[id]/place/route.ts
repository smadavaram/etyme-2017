import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { writeCyclesFor } from '@/lib/contract-cycles'
import { loadContractHolidays } from '@/lib/holidays'
import { nextLineOnSameDocument } from '@/lib/replacement'
import { ORDER_HEADER_SELECT } from '@/lib/money/order-terms'
import { rateInForce, ratePeriods } from '@/lib/contract-rate'
import { checkPlace, managesLine, cityOf, cityChange, isoDay, onDay } from '@/lib/internal-moves'
import { POST as submit } from '@/app/api/submissions/route'
import { seatFacts, refuse, trail, tellStep, standingRelease, nameOf } from '../../../facts'

function day(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null
  const d = new Date(`${v.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}
function cents(v: unknown): number | null {
  const n = Number(v)
  return v != null && Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

/** Lines that say where somebody is, or is papered to be. */
const PAPERED = ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'PAUSED'] as const

/**
 * POST /api/bench/ours/holds/:id/place   { startsOn?, billRate?, payRate?, rate? }
 *
 * The receiving manager places the person he holds. Two ways, decided by
 * what the hold was for:
 *
 * - **A client's job request.** The person goes forward through the one
 *   submission door, `POST /api/submissions`, as the firm's own employee
 *   (INTERNAL): no listing, the employee told rather than asked, the read
 *   logged. The door decides everything it always decides — invited,
 *   open, cover on file, first in wins. The move completes when the
 *   client awards, which is the award's own work.
 *
 * - **A line on his own project's order.** A new sell line and the W2
 *   buy line that pays for it, on the same order the project already
 *   runs under, starting the day after the old line ends. Terms come
 *   from the order through money's one door, as a replacement's do
 *   (`nextLineOnSameDocument`); the bill rate is the order's current
 *   line's unless the manager says another; the pay rate is what the
 *   firm pays this person today — a move is not a pay cut — unless he
 *   says another. Written as DRAFT with its cycles, exactly as an award
 *   writes a line: activation, and the paperwork gate in front of it,
 *   are unchanged.
 *
 * The old placement is not touched: it ends on the day it always said.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { verdict, seat } = await seatFacts(caller)
  if (!verdict.ok) return refuse(verdict.code, verdict.message)

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const companyId = caller.company!.id
  const hold = await prisma.projectHold.findUnique({ where: { id } })
  if (!hold || hold.companyId !== companyId) return refuse('NOT_FOUND', 'That hold is not here.', 404)

  const personId = hold.personId
  const name = await nameOf(personId)
  const now = new Date()
  const release = await standingRelease(companyId, personId)
  const releaserName = release ? await nameOf(release.releasedById) : ''

  // Every line they are on or papered onto here, so the new one cannot
  // overlap any of them.
  const lines = await prisma.sellContract.findMany({
    where: { companyId, personId, state: { in: [...PAPERED] } },
    select: {
      id: true, state: true, endDate: true, billRate: true,
      clientCompany: { select: { name: true } }, endClientCompany: { select: { name: true } },
      workLocation: { select: { city: true } }, requirement: { select: { location: true } },
    },
  })
  const latestLineEnd = lines.reduce<Date | null>((a, l) => (l.endDate && (!a || l.endDate > a) ? l.endDate : a), null)
  const current = [...lines].filter((l) => l.state === 'IN_PROGRESS' || l.state === 'PAUSED')
    .sort((a, b) => (b.endDate?.getTime() ?? Infinity) - (a.endDate?.getTime() ?? Infinity))[0]
    ?? (release ? await prisma.sellContract.findUnique({
      where: { id: release.sellContractId },
      select: {
        id: true, state: true, endDate: true, billRate: true,
        clientCompany: { select: { name: true } }, endClientCompany: { select: { name: true } },
        workLocation: { select: { city: true } }, requirement: { select: { location: true } },
      },
    }) : null)
  // The last line anywhere, for what the firm last billed them at.
  const last = current ?? (await prisma.sellContract.findFirst({
    where: { companyId, personId, state: { in: ['ENDED', ...PAPERED] } },
    orderBy: { startDate: 'desc' },
    select: {
      id: true, state: true, endDate: true, billRate: true,
      clientCompany: { select: { name: true } }, endClientCompany: { select: { name: true } },
      workLocation: { select: { city: true } }, requirement: { select: { location: true } },
    },
  }))

  const check = checkPlace({
    personName: name,
    callerId: caller.person.id,
    hold: { heldById: hold.heldById, heldByName: await nameOf(hold.heldById), until: hold.until, live: hold.live },
    release: release ? { rollsOffOn: release.rollsOffOn, keepUntil: release.keepUntil, confirmedAt: release.confirmedAt, releaserName } : null,
    latestLineEnd,
    openEndedLine: lines.some((l) => (l.state === 'IN_PROGRESS' || l.state === 'PAUSED') && !l.endDate),
    startAsked: body.startsOn ? day(body.startsOn) : null,
    today: now,
  })
  if (!check.ok) {
    await trail(caller, personId, 'CONTRACT_VIEW', `Refused a placement from Our bench: ${check.message}`, false)
    return refuse(check.code, check.message, check.code === 'NOT_YOURS' ? 403 : 409)
  }

  const fromClient = current ? current.endClientCompany?.name ?? current.clientCompany.name : null
  const fromCity = current ? cityOf(current.workLocation) ?? cityOf(current.requirement?.location ?? null) : null

  // ── (a) A client's job request, through the submission door ──────────
  if (hold.forRequirementId) {
    const req = await prisma.requirement.findUnique({
      where: { id: hold.forRequirementId },
      select: { title: true, location: true, company: { select: { name: true } }, endClientCompany: { select: { name: true } } },
    })
    const rate = cents(body.rate) ?? last?.billRate ?? null
    if (!rate) {
      return refuse('NO_RATE', `Say the rate ${caller.company!.name} puts ${name} forward at; nothing on the record says what the firm bills for them.`, 422)
    }
    const headers = new Headers(request.headers)
    headers.delete('content-length')
    headers.set('content-type', 'application/json')
    const res = await submit(
      new NextRequest(new URL('/api/submissions', request.url), {
        method: 'POST',
        headers,
        body: JSON.stringify({ requirementId: hold.forRequirementId, personIds: [personId], rate, fromCompanyId: companyId }),
      })
    )
    const out = await res.json().catch(() => null)
    const item = out?.data?.results?.[0]
    if (!res.ok || !item || item.status !== 'created') {
      // The door's own sentence, not a second one.
      const message = out?.error?.message ?? item?.error ?? item?.message ?? `${name} could not be put forward.`
      return NextResponse.json({ error: { code: out?.error?.code ?? 'NOT_SUBMITTED', message } }, { status: res.ok ? 409 : res.status })
    }

    await prisma.projectHold.update({
      where: { id: hold.id },
      data: { live: null, endedAt: new Date(), endedById: caller.person.id, endedHow: 'PLACED', placedSubmissionId: item.submissionId, placedStartsOn: check.startsOn },
    })
    const toClient = req?.endClientCompany?.name ?? req?.company.name ?? null
    const toCity = cityOf(req?.location ?? null)
    const told = await tellStep({
      caller,
      companyId,
      personId,
      step: 'MOVE',
      entityId: hold.id,
      facts: {
        personName: name, firmName: caller.company!.name, actorName: caller.person.name,
        fromClient, fromCity, forTitle: req?.title ?? hold.forTitle, toClient, toCity, startsOn: check.startsOn, movedAs: 'SUBMISSION',
      },
    })
    await prisma.automationLog.create({
      data: {
        companyId,
        action: 'PROJECT_MOVE_SUBMITTED',
        summary: `${caller.person.name} put ${name} forward to ${toClient}’s ${req?.title} as ${caller.company!.name}’s own employee.`,
        reason: 'A manager holding one of the firm’s own people put them forward through the submission door, as INTERNAL. HR and the person are told.',
        payload: { holdId: hold.id, submissionId: item.submissionId, kind: item.kind ?? null, requirementId: hold.forRequirementId, personId, hrTold: told.hr, personTold: told.personTold } as object,
        reversible: false,
      },
    })
    return NextResponse.json(
      { data: { holdId: hold.id, submissionId: item.submissionId, kind: item.kind ?? null, says: `${name} is put forward to ${toClient} as your own employee.`, cityChange: cityChange(fromCity, toCity) } },
      { status: 201 }
    )
  }

  // ── (b) A new line on his own project's order ────────────────────────
  if (!hold.forSellContractId) return refuse('NO_POSITION', 'This hold names no position to place into.', 409)
  const template = await prisma.sellContract.findUnique({
    where: { id: hold.forSellContractId },
    include: {
      person: { select: { name: true } },
      clientCompany: { select: { name: true } },
      endClientCompany: { select: { name: true } },
      workLocation: { select: { city: true, country: true } },
      requirement: { select: { title: true, location: true } },
      workOrder: { select: { ...ORDER_HEADER_SELECT, status: true, title: true } },
      company: { select: { templatePack: true } },
    },
  })
  if (!template || template.companyId !== companyId || !template.workOrderId || !template.workOrder) {
    return refuse('NO_ORDER', 'The project this hold was for has no order to put a line on any more.', 409)
  }
  if (!managesLine(seat, template)) {
    return refuse('NOT_YOUR_PROJECT', 'You place somebody onto a project you manage. That one is another manager’s.')
  }
  if (template.workOrder.status !== 'OPEN') {
    return refuse('ORDER_CLOSED', `The order for ${hold.forTitle} is not open, so nothing more is placed on it.`, 409)
  }
  const endsOn = template.endDate ?? template.workOrder.endDate ?? null
  if (endsOn && endsOn.getTime() < check.startsOn.getTime()) {
    return refuse('AFTER_THE_PROJECT', `The project ends on ${onDay(endsOn)}, before ${name} could start on ${onDay(check.startsOn)}.`, 409)
  }

  const line = nextLineOnSameDocument({
    old: {
      workOrderId: template.workOrderId, projectOrderId: template.projectOrderId,
      engagementId: template.engagementId, msaId: template.msaId,
      billFrequency: template.billFrequency, billAnchor: template.billAnchor, billStraddle: template.billStraddle,
      paymentTerms: template.paymentTerms, paymentTermsFrom: template.paymentTermsFrom,
    },
    header: template.workOrder,
    startsOn: check.startsOn,
    endsOn,
    outgoingName: template.person.name,
    incomingName: name,
  })

  // What the firm pays this person today, read through the rate history
  // as payroll reads it. A move is not a pay cut; a different figure is
  // the manager's to type, and is recorded as his.
  const payLine = await prisma.buyContractCandidate.findFirst({
    where: { personId, buyContract: { companyId, vendorCompanyId: null, supplierSellContractId: null } },
    orderBy: { startDate: 'desc' },
    select: { payRate: true, payCurrency: true, buyContractId: true },
  })
  const history = payLine
    ? await prisma.rateHistory.findMany({ where: { contractType: 'BUY', contractId: payLine.buyContractId } })
    : []
  const carried = payLine ? rateInForce(payLine.payRate, ratePeriods(history), check.startsOn).rateCents : null
  const payRate = cents(body.payRate) ?? (carried && carried > 0 ? carried : null)
  const billRate = cents(body.billRate) ?? template.billRate

  const holidays = endsOn
    ? await loadContractHolidays(companyId, template.clientCompanyId, check.startsOn.getFullYear(), endsOn.getFullYear(), template.workLocation?.country ?? null)
    : new Set<string>()

  const placed = await prisma.$transaction(async (tx) => {
    const sell = await tx.sellContract.create({
      data: {
        companyId,
        clientCompanyId: template.clientCompanyId,
        endClientCompanyId: template.endClientCompanyId,
        personId,
        engagementId: line.engagementId,
        msaId: line.msaId,
        workLocationId: template.workLocationId,
        hiringManagerId: template.hiringManagerId,
        orgUnitId: template.orgUnitId,
        deliveryUnitId: template.deliveryUnitId,
        workOrderId: line.workOrderId,
        projectOrderId: line.projectOrderId,
        billRate,
        billCurrency: template.billCurrency,
        overtimeAfterHours: template.overtimeAfterHours,
        overtimeMultiplierBps: template.overtimeMultiplierBps,
        paymentTerms: line.paymentTerms ?? template.paymentTerms,
        paymentTermsFrom: template.paymentTermsFrom,
        billFrequency: line.billFrequency,
        billAnchor: line.billAnchor,
        billStraddle: line.billStraddle,
        // As the award writes a line: terms agreed, not started.
        // Activation, and the paperwork it checks, are unchanged.
        state: 'DRAFT',
        startDate: line.startDate,
        endDate: line.endDate,
      },
      select: { id: true },
    })
    // Our own employee: no vendor, no order — you do not raise a purchase
    // order to your own employee.
    const buy = await tx.buyContract.create({
      data: {
        companyId, vendorCompanyId: null, payCurrency: payLine?.payCurrency ?? template.billCurrency,
        contractType: 'W2', state: 'DRAFT', workOrderId: null,
        startDate: line.startDate, endDate: line.endDate,
      },
      select: { id: true, contractType: true, vendorCompanyId: true },
    })
    await tx.buyContractCandidate.create({
      data: {
        buyContractId: buy.id, personId,
        // Zero where nothing says, visibly missing rather than guessed —
        // the award's rule; profitability refuses a margin on it.
        payRate: payRate ?? 0,
        payCurrency: payLine?.payCurrency ?? template.billCurrency,
        startDate: line.startDate, endDate: line.endDate,
      },
    })
    await tx.contractLink.create({
      data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: line.startDate, effectiveTo: line.endDate },
    })
    await writeCyclesFor(tx, {
      sell: { id: sell.id, startDate: line.startDate, endDate: line.endDate, workOrder: template.workOrder },
      buy,
      packId: template.company.templatePack ?? 'US_IT',
      holidays,
    })
    await tx.projectHold.update({
      where: { id: hold.id },
      data: { live: null, endedAt: new Date(), endedById: caller.person.id, endedHow: 'PLACED', placedSellContractId: sell.id, placedStartsOn: line.startDate },
    })
    return sell
  })

  const toClient = template.endClientCompany?.name ?? template.clientCompany.name
  const toCity = cityOf(template.workLocation) ?? cityOf(template.requirement?.location ?? null)
  const city = cityChange(fromCity, toCity)
  const payNote = payRate ? '' : ` Nothing on the record says what ${caller.company!.name} pays ${name}; the pay line waits for payroll to set it before the start.`
  const says =
    `${name} starts on ${onDay(line.startDate)} at ${toClient}${toCity ? ` in ${toCity}` : ''}, on the same order as the rest of the project. ` +
    `${fromClient ? `The ${fromClient} placement still ends on ${onDay(latestLineEnd ?? line.startDate)}.` : ''}${payNote}`
  const told = await tellStep({
    caller,
    companyId,
    personId,
    step: 'MOVE',
    entityId: placed.id,
    facts: {
      personName: name, firmName: caller.company!.name, actorName: caller.person.name,
      fromClient, fromCity, forTitle: hold.forTitle, toClient, toCity, startsOn: line.startDate, movedAs: 'LINE',
    },
  })
  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'PROJECT_MOVE_PLACED',
      summary: says,
      reason: `${caller.person.name} held ${name} for ${hold.forTitle}${release ? ` and ${releaserName} confirmed the last day` : ''}. A new line on the project's own order; nobody approves it and HR is told.`,
      payload: {
      holdId: hold.id, newSellContractId: placed.id, workOrderId: line.workOrderId, startsOn: isoDay(line.startDate),
      endsOn: line.endDate ? isoDay(line.endDate) : null, termsFrom: line.termsFrom, outsideOrderWindow: line.outsideOrderWindow,
      billRateFrom: cents(body.billRate) ? 'MANAGER' : 'ORDER_LINE', payRateFrom: cents(body.payRate) ? 'MANAGER' : payRate ? 'CARRIED' : 'NOT_SET', personId, hrTold: told.hr, personTold: told.personTold } as object,
      reversible: false,
    },
  })
  return NextResponse.json(
    {
      data: {
        holdId: hold.id,
        sellContractId: placed.id,
        startsOn: isoDay(line.startDate),
        endsOn: line.endDate ? isoDay(line.endDate) : null,
        says,
        cityChange: city,
        paySet: payRate != null,
        onDocument: line.says,
        outsideOrderWindow: line.outsideOrderWindow,
      },
    },
    { status: 201 }
  )
}
