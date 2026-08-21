import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { isConsultantSeat } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { assessRateChange } from '@/lib/contract-rate'
import { prisma } from '@/lib/db'

/**
 * GET /api/rate-history
 *
 * BUILD.md §6.9: "Rate changes must be versioned or the timesheet valuation
 * is unreliable."
 *
 * LEGACY_RULES.md §2.4: ChangeRate — polymorphic, date-ranged rate versioning.
 *   rate_on(date) queries change_rates where date falls between from_date and
 *   to_date. Falls back to earliest rate if no match.
 *
 * Two modes:
 *   1. Contract-scoped: pass contractId + contractType → returns rate history
 *      for that contract. Requires consultants.cost for buy rates.
 *   2. Dashboard (no contractId): returns all rate history for the caller's
 *      company, enriched with consultant and contract display names.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl
  const contractId = url.searchParams.get('contractId')
  const contractType = url.searchParams.get('contractType') // SELL | BUY

  // ── Dashboard mode: all rate history for the company ──────────
  if (!contractId) {
    const companyId = caller.company?.id
    if (!companyId) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'No company context' } },
        { status: 403 }
      )
    }

    // Collect all contract IDs belonging to the company
    // A consultant on the bench has a context pointing at the agency. Read
    // as employment it showed them six other people's rate movements — the
    // one number in this business nobody shares sideways.
    const own = isConsultantSeat(caller)
    const canSeeBuy = !own && hasPermission(caller.permissions, 'consultants.cost')
    const [sellContracts, buyContracts] = await Promise.all([
      prisma.sellContract.findMany({
        where: own ? { personId: caller.person.id } : { companyId },
        select: {
          id: true,
          person: { select: { name: true } },
          clientCompany: { select: { name: true } },
        },
      }),
      canSeeBuy
        ? prisma.buyContract.findMany({
            where: { companyId },
            select: {
              id: true,
              // One agreement can cover several people, so the label lists
              // them rather than assuming a single name.
              candidates: { select: { person: { select: { name: true } } } },
              vendorCompany: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
    ])

    const sellIds = sellContracts.map((c) => c.id)
    const buyIds = buyContracts.map((c) => c.id)

    // Build contract lookup maps
    const contractMap = new Map<string, { personName: string; contractLabel: string }>()
    for (const sc of sellContracts) {
      contractMap.set(`SELL:${sc.id}`, {
        personName: sc.person.name,
        contractLabel: `Sell — ${sc.clientCompany?.name ?? 'Unknown client'}`,
      })
    }
    for (const bc of buyContracts) {
      contractMap.set(`BUY:${bc.id}`, {
        personName: bc.candidates.length === 1
          ? bc.candidates[0].person.name
          : `${bc.candidates.length} people`,
        contractLabel: `Buy — ${bc.vendorCompany?.name ?? 'Direct'}`,
      })
    }

    // Fetch rate history for all company contracts
    const whereConditions: any[] = []
    if (sellIds.length > 0) {
      whereConditions.push({ contractType: 'SELL', contractId: { in: sellIds } })
    }
    if (buyIds.length > 0) {
      whereConditions.push({ contractType: 'BUY', contractId: { in: buyIds } })
    }

    if (whereConditions.length === 0) {
      return NextResponse.json({ data: { rateHistory: [] } })
    }

    const history = await prisma.rateHistory.findMany({
      where: { OR: whereConditions },
      orderBy: { fromDate: 'desc' },
    })

    // Resolve changedBy person names
    const changedByIds = Array.from(new Set(history.map((h) => h.changedById)))
    const changedByPersons = changedByIds.length > 0
      ? await prisma.person.findMany({
          where: { id: { in: changedByIds } },
          select: { id: true, name: true },
        })
      : []
    const personNameMap = new Map(changedByPersons.map((p) => [p.id, p.name]))

    return NextResponse.json({
      data: {
        rateHistory: history.map((h) => {
          const info = contractMap.get(`${h.contractType}:${h.contractId}`)
          return {
            id: h.id,
            contractType: h.contractType,
            contractId: h.contractId,
            rate: h.rate,
            rateType: h.rateType,
            overtimeRate: h.overtimeRate,
            fromDate: h.fromDate.toISOString(),
            toDate: h.toDate?.toISOString() ?? null,
            reason: h.reason,
            changedById: h.changedById,
            changedByName: personNameMap.get(h.changedById) ?? 'Unknown',
            previousRate: h.previousRate,
            // A proposed amendment does not bill. Without this the UI cannot
            // tell an agreed rate from one still waiting on procurement,
            // which is the whole point of putting it behind approval.
            approvalState: h.approvalState,
            approvedAt: h.approvedAt?.toISOString() ?? null,
            createdAt: h.createdAt.toISOString(),
            personName: info?.personName ?? 'Unknown',
            contractLabel: info?.contractLabel ?? `${h.contractType} contract`,
          }
        }),
      },
    })
  }

  // ── Contract-scoped mode ──────────────────────────────────────
  if (!contractType) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'contractType (SELL|BUY) is required when contractId is provided' } },
      { status: 422 }
    )
  }

  // Permission check: buy contract rates require consultants.cost
  if (contractType === 'BUY' && !hasPermission(caller.permissions, 'consultants.cost')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Requires consultants.cost permission to view pay rates' } },
      { status: 403 }
    )
  }

  // Verify the contract is the caller's to read — their company's, or, for
  // somebody on a bench, their own.
  const ownScope = isConsultantSeat(caller)
    ? { personId: caller.person.id }
    : { companyId: caller.company?.id }

  if (contractType === 'SELL') {
    const sc = await prisma.sellContract.findFirst({
      where: { id: contractId, ...ownScope },
    })
    if (!sc) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Sell contract not found' } },
        { status: 404 }
      )
    }
  } else {
    const bc = await prisma.buyContract.findFirst({
      where: isConsultantSeat(caller)
        ? { id: contractId, candidates: { some: { personId: caller.person.id } } }
        : { id: contractId, companyId: caller.company?.id },
    })
    if (!bc) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Buy contract not found' } },
        { status: 404 }
      )
    }
  }

  const history = await prisma.rateHistory.findMany({
    where: {
      contractType: contractType.toUpperCase(),
      contractId,
    },
    orderBy: { fromDate: 'desc' },
  })

  return NextResponse.json({
    data: {
      rateHistory: history.map((h) => ({
        id: h.id,
        contractType: h.contractType,
        contractId: h.contractId,
        rate: h.rate,
        rateType: h.rateType,
        overtimeRate: h.overtimeRate,
        fromDate: h.fromDate.toISOString(),
        toDate: h.toDate?.toISOString() ?? null,
        reason: h.reason,
        changedById: h.changedById,
        previousRate: h.previousRate,
        approvalState: h.approvalState,
        approvedAt: h.approvedAt?.toISOString() ?? null,
        createdAt: h.createdAt.toISOString(),
      })),
      currentRate: history.length > 0 ? history[0].rate : null,
    },
  })
}

/**
 * POST /api/rate-history
 *
 * Record a rate change. Validates no overlapping date ranges.
 *
 * LEGACY_RULES.md §2.4: "No existing ChangeRate for the same rateable
 * may have overlapping date ranges."
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'assignments.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Requires contracts.write permission' } },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { contractType, contractId, rate, rateType = 'HOURLY', overtimeRate, fromDate, toDate, reason } = body

  if (!contractType || !contractId || rate === undefined || !fromDate) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'contractType, contractId, rate, and fromDate are required' } },
      { status: 422 }
    )
  }

  if (typeof rate !== 'number' || rate < 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'rate must be a non-negative number (cents)' } },
      { status: 422 }
    )
  }

  const from = new Date(fromDate)
  const to = toDate ? new Date(toDate) : null

  if (to && to <= from) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'toDate must be after fromDate' } },
      { status: 422 }
    )
  }

  // Check for overlapping date ranges
  // LEGACY_RULES.md §2.4: :to_date >= from_date and to_date >= :from_date
  const overlapWhere: any = {
    contractType: contractType.toUpperCase(),
    contractId,
    fromDate: { lte: to ?? new Date('9999-12-31') },
  }
  if (to) {
    overlapWhere.OR = [
      { toDate: null },           // open-ended rates always overlap
      { toDate: { gte: from } },  // existing toDate >= new fromDate
    ]
  } else {
    // New rate is open-ended — overlaps anything starting before our fromDate
    overlapWhere.OR = [
      { toDate: null },
      { toDate: { gte: from } },
    ]
  }

  const overlap = await prisma.rateHistory.findFirst({
    where: overlapWhere,
  })

  if (overlap) {
    return NextResponse.json(
      {
        error: {
          code: 'OVERLAP',
          message: `Rate period overlaps with existing rate from ${overlap.fromDate.toISOString().slice(0, 10)}`,
        },
      },
      { status: 409 }
    )
  }

  // Get previous rate for audit trail
  const previousEntry = await prisma.rateHistory.findFirst({
    where: {
      contractType: contractType.toUpperCase(),
      contractId,
    },
    orderBy: { fromDate: 'desc' },
  })

  // A rate change is an amendment to the agreement, so its size decides
  // whether it takes effect on its own or waits for somebody.
  //
  // The previous rate to compare against is the one in force, not merely
  // the newest row — a proposal sitting unapproved is not the current price.
  const contractRate = contractType.toUpperCase() === 'SELL'
    ? (await prisma.sellContract.findUnique({ where: { id: contractId }, select: { billRate: true } }))?.billRate ?? 0
    : 0
  const priorApproved = await prisma.rateHistory.findFirst({
    where: { contractType: contractType.toUpperCase(), contractId, approvalState: 'APPROVED' },
    orderBy: { fromDate: 'desc' },
  })
  const fromCents = priorApproved?.rate ?? contractRate

  const assessment = assessRateChange(fromCents, rate)
  const approvalState = assessment.needsApproval ? 'PROPOSED' : 'APPROVED'

  const entry = await prisma.rateHistory.create({
    data: {
      approvalState,
      approvedById: assessment.needsApproval ? null : caller.person.id,
      approvedAt: assessment.needsApproval ? null : new Date(),
      contractType: contractType.toUpperCase(),
      contractId,
      rate,
      rateType: rateType.toUpperCase(),
      overtimeRate: overtimeRate ?? null,
      fromDate: from,
      toDate: to,
      reason: reason ?? null,
      changedById: caller.person.id,
      previousRate: previousEntry?.rate ?? null,
    },
  })

  return NextResponse.json(
    { data: { rateHistory: { id: entry.id, rate: entry.rate, fromDate: entry.fromDate.toISOString() } } },
    { status: 201 }
  )
}
