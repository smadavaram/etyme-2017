import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'

/**
 * GET /api/payroll
 *
 * Lists pay items for buy-side contracts.
 *
 * The legacy Salary model is consolidated: payroll runs through
 * BuyContract + approved Timesheets linked via ContractLink.
 *
 * Pipeline (LEGACY_RULES.md §2.5):
 *   pending → open → calculated → approved → processed → cleared
 *
 * Each pay item = one BuyContract for one pay period, computed from
 * approved sell-side timesheets linked via ContractLink.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!hasPermission(caller.permissions, 'payroll.read')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'payroll.read permission required' } },
      { status: 403 }
    )
  }

  const url = request.nextUrl
  const companyId = url.searchParams.get('companyId') ?? caller.company?.id
  const status = url.searchParams.get('status')
  const period = url.searchParams.get('period') // YYYY-MM

  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'companyId required' } },
      { status: 422 }
    )
  }

  // Find all active buy contracts for this company
  const buyContracts = await prisma.buyContract.findMany({
    where: {
      companyId,
      state: { in: ['IN_PROGRESS', 'BENCH_PAID', 'INTERNAL', 'TRAINING'] },
    },
    include: {
      person: { select: { id: true, name: true, primaryEmail: true } },
      vendorCompany: { select: { id: true, name: true } },
      entity: { select: { id: true, name: true } },
      sellLinks: {
        include: {
          sellContract: {
            include: {
              timesheets: {
                where: { status: 'APPROVED' },
                select: {
                  id: true,
                  totalHours: true,
                  periodStart: true,
                  periodEnd: true,
                  approvedAt: true,
                },
              },
              clientCompany: { select: { id: true, name: true } },
              engagement: { select: { id: true, title: true } },
            },
          },
        },
      },
      buyCycles: {
        where: {
          kind: { in: ['SALARY_CALCULATE', 'SALARY_PAY'] },
        },
        orderBy: { dueOn: 'desc' },
      },
    },
    orderBy: { startDate: 'desc' },
  })

  // Build pay items from buy contracts + linked approved timesheets
  const payItems = buyContracts.map((bc) => {
    // Aggregate approved hours across linked sell contracts
    const linkedTimesheets = bc.sellLinks.flatMap((link) =>
      link.sellContract.timesheets.map((ts) => ({
        id: ts.id,
        totalHours: Number(ts.totalHours),
        periodStart: ts.periodStart.toISOString(),
        periodEnd: ts.periodEnd.toISOString(),
        approvedAt: ts.approvedAt?.toISOString() ?? null,
        sellContractId: link.sellContractId,
        clientCompany: link.sellContract.clientCompany,
        engagement: link.sellContract.engagement,
        billRate: link.sellContract.billRate,
      }))
    )

    // Filter by period if specified
    const filteredTimesheets = period
      ? linkedTimesheets.filter((ts) => ts.periodStart.startsWith(period))
      : linkedTimesheets

    const totalApprovedHours = filteredTimesheets.reduce(
      (sum, ts) => sum + ts.totalHours, 0
    )

    // Calculate gross pay: approved hours × buy rate (in cents)
    const grossPay = Math.round(totalApprovedHours * bc.payRate)

    // Determine pay item status based on cycle completion
    const nextSalaryCycle = bc.buyCycles.find(
      (c) => c.kind === 'SALARY_PAY' && !c.completedAt
    )
    const nextCalcCycle = bc.buyCycles.find(
      (c) => c.kind === 'SALARY_CALCULATE' && !c.completedAt
    )

    let payStatus: string
    if (filteredTimesheets.length === 0) {
      payStatus = 'NO_HOURS'
    } else if (nextCalcCycle && !nextCalcCycle.completedAt) {
      payStatus = 'PENDING'
    } else if (nextSalaryCycle && !nextSalaryCycle.completedAt) {
      payStatus = 'CALCULATED'
    } else {
      payStatus = 'PROCESSED'
    }

    return {
      buyContractId: bc.id,
      person: bc.person,
      contractType: bc.contractType,
      state: bc.state,
      payRate: bc.payRate,
      payCurrency: bc.payCurrency,
      vendorCompany: bc.vendorCompany,
      entity: bc.entity,
      startDate: bc.startDate.toISOString(),
      endDate: bc.endDate?.toISOString() ?? null,
      timesheets: filteredTimesheets,
      totalApprovedHours,
      grossPay,
      payStatus,
      nextPayDate: nextSalaryCycle?.dueOn.toISOString() ?? null,
      nextCalcDate: nextCalcCycle?.dueOn.toISOString() ?? null,
    }
  })

  // Filter by status if specified
  const filtered = status
    ? payItems.filter((p) => p.payStatus === status.toUpperCase())
    : payItems

  // Summary stats
  const summary = {
    totalContracts: filtered.length,
    totalGrossPay: filtered.reduce((sum, p) => sum + p.grossPay, 0),
    totalHours: filtered.reduce((sum, p) => sum + p.totalApprovedHours, 0),
    byContractType: Object.fromEntries(
      ['W2', 'C2C', 'IND_1099'].map((type) => {
        const items = filtered.filter((p) => p.contractType === type)
        return [type, {
          count: items.length,
          grossPay: items.reduce((s, p) => s + p.grossPay, 0),
          hours: items.reduce((s, p) => s + p.totalApprovedHours, 0),
        }]
      })
    ),
    byStatus: Object.fromEntries(
      ['PENDING', 'CALCULATED', 'PROCESSED', 'NO_HOURS'].map((s) => [
        s,
        filtered.filter((p) => p.payStatus === s).length,
      ])
    ),
  }

  return NextResponse.json({
    data: {
      payItems: filtered,
      summary,
      period: period ?? 'all',
    },
  })
}
