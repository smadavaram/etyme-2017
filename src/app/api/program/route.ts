import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * GET /api/program
 *
 * Client-side program overview — the enterprise/demand perspective.
 * Aggregates contractors, vendors, spend, and pending items
 * from the client company's viewpoint.
 *
 * BRD §17.1 Option C (mid-market, no VMS) — what an enterprise
 * hiring manager sees: their contractors, pending approvals,
 * vendor performance, and upcoming contract endings.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl
  // For demo, allow specifying a client company — in production this
  // would be derived from the caller's company context
  const clientCompanyId = url.searchParams.get('clientCompanyId')

  // Find the client company — use first one if not specified
  const clientCompany = clientCompanyId
    ? await prisma.company.findUnique({ where: { id: clientCompanyId } })
    : await prisma.company.findFirst({ where: { kind: 'CLIENT' } })
      // Fallback: find any company that appears as a clientCompany on sell contracts
      ?? await prisma.sellContract.findFirst({
          select: { clientCompany: true },
        }).then(r => r?.clientCompany ?? null)

  if (!clientCompany) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No client company found' } },
      { status: 404 }
    )
  }

  const now = new Date()

  // Active contracts placed at this client
  const contracts = await prisma.sellContract.findMany({
    where: {
      clientCompanyId: clientCompany.id,
      state: { in: ['IN_PROGRESS', 'DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'] },
    },
    include: {
      person: {
        select: {
          id: true,
          name: true,
          consultant: { select: { headline: true } },
        },
      },
      company: { select: { id: true, name: true } }, // the vendor
      engagement: { select: { id: true, title: true } },
      timesheets: { select: { id: true, status: true } },
    },
    orderBy: { endDate: 'asc' },
  })

  // Aggregate by vendor
  const vendorMap = new Map<string, {
    id: string
    name: string
    headcount: number
    totalBillRate: number
    contracts: typeof contracts
  }>()

  for (const c of contracts) {
    const vendorId = c.company.id
    const vendorName = c.company.name
    const existing = vendorMap.get(vendorId)
    if (existing) {
      existing.headcount++
      existing.totalBillRate += c.billRate ?? 0
      existing.contracts.push(c)
    } else {
      vendorMap.set(vendorId, {
        id: vendorId,
        name: vendorName,
        headcount: 1,
        totalBillRate: c.billRate ?? 0,
        contracts: [c],
      })
    }
  }

  const vendors = Array.from(vendorMap.values()).map(v => ({
    id: v.id,
    name: v.name,
    headcount: v.headcount,
    avgRate: v.headcount > 0 ? Math.round(v.totalBillRate / v.headcount) : 0,
    totalMonthlySpend: Math.round((v.totalBillRate * 160) / 100), // 160 hrs/mo, rate in cents
  }))

  // Pending timesheets awaiting approval
  const pendingTimesheets = await prisma.timesheet.findMany({
    where: {
      sellContract: { clientCompanyId: clientCompany.id },
      status: 'SUBMITTED',
    },
    include: {
      sellContract: {
        include: {
          person: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { periodEnd: 'desc' },
  })

  // Pending expenses
  const pendingExpenses = await prisma.expense.findMany({
    where: {
      sellContract: { clientCompanyId: clientCompany.id },
      status: 'SUBMITTED',
    },
    include: {
      sellContract: {
        include: {
          person: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { submittedAt: 'asc' },
  })

  // Contracts ending within 60 days
  const sixtyDaysOut = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
  const endingSoon = contracts.filter(c =>
    c.endDate && c.endDate <= sixtyDaysOut
  )

  // Requirements — find open roles where submissions led to placements at this client
  // In production, requirements would be linked to the client directly via MSA or
  // engagement. For now, find requirements that have any contract at this client.
  const requirements = await prisma.requirement.findMany({
    where: {
      status: { in: ['OPEN', 'DRAFT'] },
    },
    include: {
      submissions: {
        select: {
          id: true,
          status: true,
          person: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Spend calculation
  const totalMonthlySpend = contracts.reduce(
    (sum, c) => sum + ((c.billRate ?? 0) * 160) / 100, // cents to dollars, 160 hrs
    0
  )

  // Build approval queue items
  const approvalQueue = [
    ...pendingTimesheets.map(ts => ({
      id: ts.id,
      kind: 'timesheet' as const,
      person: ts.sellContract.person.name,
      vendor: ts.sellContract.company.name,
      detail: `Week ending ${ts.periodEnd.toLocaleDateString()}`,
      amount: ts.totalHours ? Number(ts.totalHours) : null,
      submittedAt: ts.periodEnd.toISOString(),
      daysWaiting: Math.floor((now.getTime() - ts.periodEnd.getTime()) / (24 * 60 * 60 * 1000)),
    })),
    ...pendingExpenses.map(exp => ({
      id: exp.id,
      kind: 'expense' as const,
      person: exp.sellContract.person.name,
      vendor: exp.sellContract.company.name,
      detail: `${exp.category} · ${exp.billable ? 'Billable' : 'Internal'}`,
      amount: exp.total ? Number(exp.total) / 100 : null,
      submittedAt: exp.submittedAt?.toISOString() ?? null,
      daysWaiting: exp.submittedAt
        ? Math.floor((now.getTime() - exp.submittedAt.getTime()) / (24 * 60 * 60 * 1000))
        : 0,
    })),
  ].sort((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0))

  return NextResponse.json({
    data: {
      client: {
        id: clientCompany.id,
        name: clientCompany.name,
      },
      summary: {
        activeContractors: contracts.length,
        vendors: vendors.length,
        monthlySpend: Math.round(totalMonthlySpend),
        pendingApprovals: approvalQueue.length,
        openRoles: requirements.length,
        endingSoon: endingSoon.length,
      },
      contractors: contracts.map(c => ({
        contractId: c.id,
        person: c.person,
        vendor: c.company,
        engagement: c.engagement,
        role: (c.person as any).consultant?.headline ?? null,
        billRate: c.billRate,
        state: c.state,
        startDate: c.startDate?.toISOString() ?? null,
        endDate: c.endDate?.toISOString() ?? null,
        daysRemaining: c.endDate
          ? Math.ceil((c.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
          : null,
        pendingTimesheets: c.timesheets.filter(t => t.status === 'SUBMITTED').length,
      })),
      vendors,
      approvalQueue,
      openRoles: requirements.map(r => ({
        id: r.id,
        title: r.title,
        status: r.status,
        submissions: r.submissions.length,
        shortlisted: r.submissions.filter(s => s.status === 'SHORTLISTED').length,
      })),
      endingSoon: endingSoon.map(c => ({
        contractId: c.id,
        person: c.person,
        vendor: c.company,
        endDate: c.endDate?.toISOString() ?? null,
        daysRemaining: c.endDate
          ? Math.ceil((c.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
          : null,
        billRate: c.billRate,
      })),
    },
  })
}
