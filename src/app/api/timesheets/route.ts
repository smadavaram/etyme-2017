import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { sellContractScope } from '@/lib/resolve-client-company'

/**
 * GET /api/timesheets
 *
 * Timesheets live on the sell side — they track billable hours
 * against a SellContract.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl
  const status = url.searchParams.get('status')
  const sellContractId = url.searchParams.get('sellContractId')
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))

  // A client approves hours worked at their sites; a vendor sees the hours
  // they bill. Both read the same table through their own side of it.
  const scope = sellContractScope(caller)
  if (!scope) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'No company context' } },
      { status: 403 }
    )
  }

  const where: any = { sellContract: scope }
  if (status) where.status = status.toUpperCase()
  if (sellContractId) where.sellContractId = sellContractId

  const [timesheets, total] = await Promise.all([
    prisma.timesheet.findMany({
      where,
      include: {
        person: { select: { id: true, name: true } },
        sellContract: {
          select: {
            id: true,
            billRate: true,
            billCurrency: true,
            clientCompany: { select: { id: true, name: true } },
            endClientCompany: { select: { id: true, name: true } },
            engagement: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { periodStart: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.timesheet.count({ where }),
  ])

  return NextResponse.json({
    data: {
      timesheets: timesheets.map((t) => ({
        id: t.id,
        person: t.person,
        sellContract: {
          id: t.sellContract.id,
          billRate: t.sellContract.billRate,
          billCurrency: t.sellContract.billCurrency,
          clientCompany: t.sellContract.clientCompany,
          endClientCompany: t.sellContract.endClientCompany,
          engagement: t.sellContract.engagement,
        },
        periodStart: t.periodStart.toISOString(),
        periodEnd: t.periodEnd.toISOString(),
        totalHours: Number(t.totalHours),
        status: t.status,
        anomalyScore: t.anomalyScore,
        anomalyReason: t.anomalyReason,
        approvedAt: t.approvedAt?.toISOString() ?? null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  })
}

/**
 * POST /api/timesheets
 *
 * Create a timesheet against a sell contract.
 */
export async function POST(request: NextRequest) {
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const body = await request.json()
  const { sellContractId, periodStart, periodEnd, days } = body

  if (!sellContractId) return err('sellContractId is required', 'sellContractId')
  if (!periodStart) return err('periodStart is required', 'periodStart')
  if (!periodEnd) return err('periodEnd is required', 'periodEnd')
  if (!days || typeof days !== 'object') return err('days object is required (e.g. {"2026-08-01": 8})', 'days')

  const sellContract = await prisma.sellContract.findUnique({
    where: { id: sellContractId },
    select: { id: true, personId: true, state: true, billRate: true },
  })

  if (!sellContract) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Sell contract not found' } },
      { status: 404 }
    )
  }

  // Calculate total hours
  const totalHours = Object.values(days as Record<string, number>).reduce(
    (sum: number, h) => sum + (typeof h === 'number' ? h : 0),
    0
  )

  // Simple anomaly detection: > 12 hours in a day or > 60 hours in a week
  let anomalyScore: number | null = null
  let anomalyReason: string | null = null

  const dayValues = Object.values(days as Record<string, number>)
  const maxDay = Math.max(...dayValues.map((v) => (typeof v === 'number' ? v : 0)))

  if (maxDay > 12) {
    anomalyScore = 30
    anomalyReason = `Day with ${maxDay} hours exceeds 12-hour threshold`
  } else if (totalHours > 60) {
    anomalyScore = 50
    anomalyReason = `Total ${totalHours} hours exceeds 60-hour weekly threshold`
  }

  try {
    const timesheet = await prisma.timesheet.create({
      data: {
        sellContractId,
        personId: sellContract.personId,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        days: days as any,
        totalHours,
        status: 'OPEN',
        anomalyScore,
        anomalyReason,
      },
    })

    return NextResponse.json({
      data: {
        timesheet: {
          id: timesheet.id,
          totalHours: Number(timesheet.totalHours),
          status: timesheet.status,
          anomalyScore,
          anomalyReason,
          periodStart: timesheet.periodStart.toISOString(),
          periodEnd: timesheet.periodEnd.toISOString(),
        },
        message: anomalyReason
          ? `Timesheet created with anomaly detected: ${anomalyReason}`
          : `Timesheet created: ${totalHours} hours`,
      },
    }, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { error: { code: 'DUPLICATE', message: 'A timesheet already exists for this contract and period' } },
        { status: 409 }
      )
    }
    throw e
  }
}

function err(message: string, field: string) {
  return NextResponse.json(
    { error: { code: 'VALIDATION', message, field } },
    { status: 422 }
  )
}
