import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
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
 * Returns rate history for a contract. Requires margin.read for buy rates.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl
  const contractId = url.searchParams.get('contractId')
  const contractType = url.searchParams.get('contractType') // SELL | BUY

  if (!contractId || !contractType) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'contractId and contractType (SELL|BUY) are required' } },
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

  // Verify contract belongs to caller's company
  if (contractType === 'SELL') {
    const sc = await prisma.sellContract.findFirst({
      where: { id: contractId, companyId: caller.company?.id },
    })
    if (!sc) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Sell contract not found' } },
        { status: 404 }
      )
    }
  } else {
    const bc = await prisma.buyContract.findFirst({
      where: { id: contractId, companyId: caller.company?.id },
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

  if (!hasPermission(caller.permissions, 'contracts.write')) {
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

  const entry = await prisma.rateHistory.create({
    data: {
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
