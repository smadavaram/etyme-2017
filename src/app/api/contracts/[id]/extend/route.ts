import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { writeCyclesFor } from '@/lib/contract-cycles'
import { localKey } from '@/lib/cycle-generator'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { evaluateGovernance } from '@/lib/governance'
import { loadContractHolidays } from '@/lib/holidays'
import { hasPermission } from '@/lib/permissions'
import { contractSide } from '@/lib/resolve-client-company'
import { resolvedEndClientId } from '@/lib/resolve-end-client'
import { ORDER_HEADER_SELECT, termsFor } from '@/lib/money/order-terms'

/**
 * POST /api/contracts/:id/extend
 *
 * Extends a sell contract's end date by 3 months (default) or a specified number of months.
 * Body: { months?: number } — defaults to 3
 *
 * Only IN_PROGRESS or PAUSED contracts can be extended.
 *
 * Who may is the same question `activate` answers, and this route was not
 * asking it: it checked that somebody was signed in and then moved
 * whatever contract id it was handed. An extension carries the end date
 * forward and writes the billing and pay cycles behind it, so an account
 * with no connection to either company could put months of money on
 * somebody else's placement.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const actor = { id: caller.person.id }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const months = body.months ?? 3

  if (typeof months !== 'number' || months < 1 || months > 24) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'months must be between 1 and 24' } },
      { status: 422 }
    )
  }

  const contract = await prisma.sellContract.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      endClientCompany: { select: { id: true, name: true } },
      workLocation: { select: { id: true, name: true, city: true, state: true, isRemote: true } },
      company: { select: { id: true, name: true, templatePack: true } },
      // The document this placement is on. Its terms are what the
      // added months will be billed under, and its window is what the
      // added months have to fit inside.
      workOrder: { select: ORDER_HEADER_SELECT },
    },
  })

  if (!contract) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Contract not found' } },
      { status: 404 }
    )
  }

  // A stranger is told so in words; a party missing the permission is told
  // which one, because "forbidden" on a button on their own screen reads
  // as a fault.
  const side = contractSide(caller, contract)
  if (!side) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_A_PARTY',
          message: `${caller.company?.name ?? 'Your company'} is not a party to this contract. Only ${contract.company.name}, ${contract.clientCompany.name}${contract.endClientCompany ? ` or ${contract.endClientCompany.name}` : ''} can extend it.`,
        },
      },
      { status: 403 }
    )
  }

  if (!hasPermission(caller.permissions, 'assignments.write')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Extending a placement needs the assignments.write permission. Ask whoever runs your company\'s access.',
        },
      },
      { status: 403 }
    )
  }

  if (!['IN_PROGRESS', 'PAUSED'].includes(contract.state)) {
    return NextResponse.json(
      { error: { code: 'INVALID_STATE', message: `Cannot extend a ${contract.state} contract` } },
      { status: 409 }
    )
  }

  // ── Governance check on extension ──
  const endClientId = resolvedEndClientId(contract)

  const governance = await evaluateGovernance({
    personId: contract.personId,
    endClientCompanyId: endClientId,
    vendorCompanyId: contract.companyId,
    triggerPoint: 'EXTENSION',
    subjectType: 'SELL_CONTRACT',
    subjectId: id,
    billRate: contract.billRate,
  })

  if (!governance.canProceed) {
    return NextResponse.json(
      {
        error: {
          code: 'GOVERNANCE_BLOCK',
          message: governance.summary,
          evaluations: governance.evaluations,
        },
      },
      { status: 403 }
    )
  }

  // Warnings: proceed but include in response
  // (contract extensions are critical for compliance — tenure warnings here are especially important)

  const oldEnd = contract.endDate
  const baseDate = oldEnd ?? new Date()
  const newEnd = new Date(baseDate)
  newEnd.setMonth(newEnd.getMonth() + months)

  // ── The months added need their due dates ──────────────────────────
  //
  // This route moved `endDate`, wrote a log line saying it had extended
  // the placement, and stopped. The comment above it claimed it wrote
  // the billing and pay cycles behind it; it never did. So a placement
  // extended by three months had no hours due, no pay day and no invoice
  // date for any of them — the work carried on and nothing asked for a
  // timesheet or raised a bill.
  //
  // The buy leg moves with the sell leg for the same reason it does on
  // activation: a contract to pay somebody for work that is no longer
  // under contract is the pair disagreeing about when the job ends.
  const linked = await prisma.sellContract.findUnique({
    where: { id },
    select: { buyLinks: { select: { buyContractId: true } } },
  })
  const buyId = linked?.buyLinks[0]?.buyContractId ?? null
  const buy = buyId
    ? await prisma.buyContract.findUnique({
        where: { id: buyId },
        select: { id: true, contractType: true, vendorCompanyId: true },
      })
    : null

  // What is already on the books, keyed the way the generator keys it.
  const written = await prisma.cycle.findMany({
    where: { OR: [{ sellContractId: id }, ...(buyId ? [{ buyContractId: buyId }] : [])] },
    select: { kind: true, dueOn: true },
  })
  const already = new Map<string, Set<string>>()
  for (const c of written) {
    const days = already.get(c.kind) ?? new Set<string>()
    days.add(localKey(c.dueOn))
    already.set(c.kind, days)
  }

  const holidays = await loadContractHolidays(
    contract.company.id,
    contract.clientCompany.id,
    (contract.startDate ?? baseDate).getFullYear(),
    newEnd.getFullYear()
  )

  const added = await prisma.$transaction(async (tx) => {
    await tx.sellContract.update({ where: { id }, data: { endDate: newEnd } })
    if (buyId) await tx.buyContract.update({ where: { id: buyId }, data: { endDate: newEnd } })

    const cycles = await writeCyclesFor(tx, {
      // The document travels with the line, so the dates the added
      // months are generated over go through one door.
      sell: { id, startDate: contract.startDate, endDate: newEnd, workOrder: contract.workOrder },
      buy,
      packId: contract.company.templatePack ?? 'US_IT',
      holidays,
      existing: already,
      // Only the months that were added.
      //
      // Generation still runs over the whole contract, so a fortnightly
      // cycle keeps its original weeks. What is bounded is what may be
      // written: a period that ended on or before the old end date was
      // settled by the first run. Matching on the day a date landed on is
      // not enough on its own — this firm may have changed which way its
      // dates move off a weekend since then, and January regenerated onto
      // the other side of the weekend is in nobody's existing set. Two pay
      // days for one fortnight is money, not tidiness.
      onlyPeriodsAfter: oldEnd,
    })

    await tx.automationLog.create({
      data: {
        companyId: contract.clientCompany.id,
        action: 'CONTRACT_EXTENDED',
        summary: `${contract.person.name}'s contract at ${contract.endClientCompany?.name ?? contract.clientCompany.name} extended by ${months} month${months !== 1 ? 's' : ''} to ${newEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        reason:
          cycles.sell + cycles.buy > 0
            ? `Extended by ${caller.person.name}. ${cycles.sell + cycles.buy} new due dates written — hours, pay and invoices for the added months.`
            : `Extended by ${caller.person.name}. No new due dates: the contract has no start date, or every date in the new period was already on the books.`,
        payload: {
          contractId: id,
          buyContractId: buyId,
          personId: contract.person.id,
          vendorId: contract.company.id,
          clientId: contract.clientCompany.id,
          oldEndDate: oldEnd?.toISOString() ?? null,
          newEndDate: newEnd.toISOString(),
          months,
          cyclesAdded: { sell: cycles.sell, buy: cycles.buy },
        },
        reversible: true,
      },
    })

    return cycles
  })

  void emit({
    type: 'contract.extended',
    companyId: contract.clientCompany.id,
    subjectType: 'SellContract',
    subjectId: id,
    actorPersonId: actor?.id ?? null,
    payload: {
      personId: contract.person.id,
      vendorCompanyId: contract.company.id,
      // The end client, not the payer. Tenure accrues where the person
      // works, so this is the id that matters downstream.
      endClientCompanyId: contract.endClientCompany?.id ?? contract.clientCompany.id,
      oldEndDate: oldEnd?.toISOString() ?? null,
      newEndDate: newEnd.toISOString(),
      months,
    },
  })

  const warnings = governance.evaluations.filter((e) => e.outcome === 'WARN')

  // ── Past the end of the paper that authorizes it ───────────────────
  //
  // A placement extended beyond its purchase order's end date is not
  // refused — the work is real and somebody senior decided it — but
  // every invoice raised for those months fails the three-way match,
  // because an expired order cannot be billed against (`poBalance`). It
  // is said here, in words, rather than discovered when the bill bounces
  // a month later.
  const order = termsFor('SELL', { startDate: contract.startDate, endDate: newEnd, workOrder: contract.workOrder })
  const pastTheOrder =
    order.outsideOrderWindow && order.orderWindow?.end
      ? `This now runs to ${newEnd.toISOString().slice(0, 10)}, past ${order.orderNumber ?? 'the order'}, which ends ${order.orderWindow.end.toISOString().slice(0, 10)}. Raise a new order or extend that one, or the months after it cannot be billed.`
      : null

  return NextResponse.json({
    data: {
      id,
      personName: contract.person.name,
      newEndDate: newEnd.toISOString(),
      message: `Contract extended by ${months} month${months !== 1 ? 's' : ''}`,
      ...(pastTheOrder ? { pastTheOrder } : {}),
      ...(warnings.length > 0 && {
        governanceWarnings: warnings.map((w) => ({
          ruleType: w.ruleType,
          reason: w.reason,
        })),
      }),
    },
  })
}
