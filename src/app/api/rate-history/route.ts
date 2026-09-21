import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { isConsultantSeat } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { assessRateChange } from '@/lib/contract-rate'
import { prisma } from '@/lib/db'

/**
 * Who may read what a placement has been priced at.
 *
 * `rates.read` — "Price is procurement's to set and to amend", the
 * permission already declared for exactly this and, until now, gating
 * nothing. The desks that hold it are the desks whose job is price:
 * account management, contract management, accounts receivable, a
 * client's procurement lead and program manager, an MSP's supplier
 * manager and AP clerk, and every owner.
 *
 * ── Why this appears now ─────────────────────────────────────────────
 *
 * The release walk of 2026-09-21 signed in as a systems integrator's
 * Validation Engineer — a seat holding `assignments.read` and
 * `timesheets.read` and nothing else — and got 200 from this route:
 * every sell rate on every placement the firm has. The same seat was
 * correctly refused on consultants, invoices, purchase orders and
 * profitability. A rate is the one number in this business nobody
 * shares sideways, and this was the last door left open on it.
 */
const TO_READ = 'rates.read'

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

  // A person reads their own rate movements without holding the price
  // desk's permission — a consultant paid a share of a number may see
  // that number, on their own assignment only — and both branches below
  // scope a consultant seat to their own rows. Everybody else is asking
  // about somebody else's price.
  if (!hasPermission(caller.permissions, TO_READ) && !isConsultantSeat(caller)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            'What a placement has been priced at is the price desk\'s to read — ' +
            'account management, contracts, procurement or the desk that bills. ' +
            'This seat is none of them. Ask whoever runs access here if that is your job.',
        },
      },
      { status: 403 }
    )
  }

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
        // Their own assignment, at the firm whose bench they are on —
        // and not every rung of their chain.
        //
        // `{ personId }` alone was every sell contract in the world with
        // their name on it. Helena Marsh is sold by CloudEPA at $112 and
        // by Computer Systems at $138, so her own rate history listed
        // both and the subtraction is her employer's entire markup on
        // her. CLAUDE.md: the chain descends and never ascends. Adding
        // the company scopes it to the leg that actually pays her, which
        // is the one "their own assignment" ever meant.
        where: own ? { personId: caller.person.id, companyId } : { companyId },
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
  // No `overtimeRate` here any more. What an overtime hour is worth is a
  // term of the contract — `overtimeMultiplierBps` on the sell leg for
  // what the client is billed, and on the buy leg for what the worker is
  // paid — in basis points of whatever rate is in force that day. A
  // separate cents-per-hour column was a third copy of the same fact,
  // and a third copy is how two records come to disagree about the one
  // question in this table with a legal consequence.
  const { contractType, contractId, rate, rateType = 'HOURLY', fromDate, toDate, reason } = body

  if (!contractType || !contractId || rate === undefined || !fromDate) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'contractType, contractId, rate, and fromDate are required' } },
      { status: 422 }
    )
  }

  // Which side of the trade, and only those two. The column is a plain
  // string, so anything truthy used to be written and then read back by
  // queries that filter on SELL or BUY — a row belonging to neither leg,
  // invisible to both and counted by nothing.
  if (contractType !== 'SELL' && contractType !== 'BUY') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'contractType must be SELL or BUY', field: 'contractType' } },
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
