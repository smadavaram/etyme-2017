import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { notifyBulk } from '@/lib/notify'
import { writeCyclesFor } from '@/lib/contract-cycles'
import { loadContractHolidays } from '@/lib/holidays'
import { mayReplace } from '@/lib/replacement'

/**
 * POST /api/placements/:id/replace   { personId, from?, payRateCents? }
 *
 * The supplier puts somebody else in the seat. The old sell contract
 * ends the day before; a new one starts on the day with the same terms;
 * the buy contract keeps running with the old candidate REPLACED and the
 * new one ACTIVE. Only the supplier may do it — the client awarded a
 * seat, not a name, and is told who is in it now.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Replacing somebody on a placement')
  if (notStaff) return notStaff
  if (!hasPermission(caller.permissions, 'assignments.write')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: `Replacing somebody is for whoever runs placements at ${caller.company!.name}.` } }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const personId = typeof body.personId === 'string' ? body.personId : ''
  const from = body.from ? new Date(body.from) : new Date()
  from.setUTCHours(0, 0, 0, 0)
  if (!personId || Number.isNaN(from.getTime())) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say who takes over, and from when.' } }, { status: 422 })
  }

  const old = await prisma.sellContract.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      buyLinks: { include: { buyContract: { include: { candidates: { where: { state: 'ACTIVE' } } } } } },
    },
  })
  if (!old || old.companyId !== caller.company!.id) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That placement is not yours.' } }, { status: 404 })
  }

  const [incoming, listing] = await Promise.all([
    prisma.person.findUnique({ where: { id: personId }, select: { id: true, name: true } }),
    prisma.benchListing.findFirst({ where: { companyId: old.companyId, state: 'GRANTED', consultant: { personId } }, select: { id: true } }),
  ])
  if (!incoming) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That person is not here.' } }, { status: 404 })

  const verdict = mayReplace({
    state: old.state, startDate: old.startDate, endDate: old.endDate, from, now: new Date(),
    outgoingName: old.person.name, incomingName: incoming.name,
    samePerson: incoming.id === old.personId, incomingOnBench: Boolean(listing),
  })
  if (!verdict.ok) return NextResponse.json({ error: { code: verdict.code, message: verdict.message } }, { status: 409 })

  const payRateCents = Number.isFinite(Number(body.payRateCents)) && body.payRateCents != null ? Math.round(Number(body.payRateCents)) : null
  const site = await prisma.companyLocation.findFirst({ where: { companyId: old.clientCompanyId }, orderBy: [{ isPrimary: 'desc' }], select: { country: true } })
  const holidays = old.endDate
    ? await loadContractHolidays(old.companyId, old.clientCompanyId, verdict.startsOn.getFullYear(), old.endDate.getFullYear(), site?.country ?? null)
    : new Set<string>()

  const result = await prisma.$transaction(async (tx) => {
    // The old contract ends the day before. Its hours, invoices and
    // tenure stay with the person who earned them.
    await tx.sellContract.update({ where: { id: old.id }, data: { state: 'ENDED', endDate: verdict.endsOn } })

    // The new one, same seat, same terms.
    const next = await tx.sellContract.create({
      data: {
        companyId: old.companyId,
        clientCompanyId: old.clientCompanyId,
        endClientCompanyId: old.endClientCompanyId,
        personId: incoming.id,
        engagementId: old.engagementId,
        workLocationId: old.workLocationId,
        hiringManagerId: old.hiringManagerId,
        orgUnitId: old.orgUnitId,
        workOrderId: old.workOrderId,
        billRate: old.billRate,
        billCurrency: old.billCurrency,
        paymentTerms: old.paymentTerms,
        billFrequency: old.billFrequency,
        billAnchor: old.billAnchor,
        billStraddle: old.billStraddle,
        state: 'IN_PROGRESS',
        startDate: verdict.startsOn,
        endDate: old.endDate,
      },
      select: { id: true },
    })

    // The buy side keeps running: the old candidate is replaced, the new
    // one active, and the link follows the new sell contract.
    for (const link of old.buyLinks) {
      const bc = link.buyContract
      for (const cand of bc.candidates) {
        await tx.buyContractCandidate.update({ where: { id: cand.id }, data: { state: 'REPLACED', endDate: verdict.endsOn } })
      }
      const previous = bc.candidates[0]
      await tx.buyContractCandidate.upsert({
        where: { buyContractId_personId: { buyContractId: bc.id, personId: incoming.id } },
        update: { state: 'ACTIVE', startDate: verdict.startsOn, endDate: bc.endDate, payRate: payRateCents ?? previous?.payRate ?? 0 },
        create: {
          buyContractId: bc.id, personId: incoming.id, state: 'ACTIVE',
          payRate: payRateCents ?? previous?.payRate ?? 0, payCurrency: previous?.payCurrency ?? old.billCurrency,
          startDate: verdict.startsOn, endDate: bc.endDate,
        },
      })
      await tx.contractLink.update({ where: { id: link.id }, data: { effectiveTo: verdict.endsOn } })
      await tx.contractLink.create({ data: { sellContractId: next.id, buyContractId: bc.id, effectiveFrom: verdict.startsOn, effectiveTo: bc.endDate } })
      await writeCyclesFor(tx, {
        sell: { id: next.id, startDate: verdict.startsOn, endDate: old.endDate },
        buy: null,
        packId: 'US_IT',
        holidays,
      })
    }

    await tx.automationLog.create({
      data: {
        companyId: old.companyId,
        action: 'PLACEMENT_REPLACED',
        summary: verdict.says,
        reason: `${caller.person.name} replaced ${old.person.name} with ${incoming.name} on the ${old.clientCompany.name} seat.`,
        payload: { oldSellContractId: old.id, newSellContractId: next.id, from: verdict.startsOn.toISOString() },
        reversible: false,
      },
    })
    return next
  })

  // The client hears who is in the seat now; the two people hear their own news.
  const hearers = [old.hiringManagerId, incoming.id, old.person.id].filter(Boolean) as string[]
  void notifyBulk(hearers.map((personId) => ({
    personId,
    companyId: personId === old.hiringManagerId ? old.clientCompanyId : old.companyId,
    type: 'CONTRACT' as const,
    title: personId === incoming.id
      ? `You take over at ${old.clientCompany.name} on ${verdict.startsOn.toISOString().slice(0, 10)}`
      : personId === old.person.id
        ? `Your contract at ${old.clientCompany.name} ends on ${verdict.endsOn.toISOString().slice(0, 10)}`
        : `${incoming.name} takes over from ${old.person.name}`,
    body: verdict.says,
    entityId: result.id,
    channel: personId === old.hiringManagerId ? 'IN_APP' : 'EMAIL',
  })))

  return NextResponse.json({ data: { id: result.id, endedId: old.id, says: verdict.says } }, { status: 201 })
}
