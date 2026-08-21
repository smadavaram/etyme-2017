import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { resolveClientCompany } from '@/lib/resolve-client-company'
import { accountFilterFor } from '@/lib/account-walls'
import { andAll } from '@/lib/walls'
import { logBulkAccess } from '@/lib/access-log'

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

  // Entitlement-checked: the caller is either this client, or a vendor
  // with a real placement there. An unverified ?clientCompanyId= is a 403.
  const { client: clientCompany, error: clientError } = await resolveClientCompany(
    caller,
    url.searchParams.get('clientCompanyId')
  )
  if (clientError) return clientError

  const now = new Date()

  // Active contracts placed at this end client
  // Uses endClientFilter to include contracts where the paying customer differs
  // Inside a firm that separates its accounts, this is also filtered to
  // the accounts the reader belongs to. A delivery manager on one client's
  // account has no business reading who is staffed at another.
  const wall = await accountFilterFor(caller)

  const contracts = await prisma.sellContract.findMany({
    where: andAll(endClientFilter(clientCompany.id), wall.where, {
      state: { in: ['IN_PROGRESS', 'DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'] },
    }),
    include: {
      person: {
        select: {
          id: true,
          name: true,
          consultant: { select: { headline: true } },
        },
      },
      company: { select: { id: true, name: true } }, // the vendor
      clientCompany: { select: { id: true, name: true } }, // paying customer
      endClientCompany: { select: { id: true, name: true } }, // end client (if different)
      workLocation: { select: { id: true, name: true, city: true, state: true, isRemote: true } },
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
      sellContract: endClientFilter(clientCompany.id),
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
      sellContract: endClientFilter(clientCompany.id),
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

  // Open roles at THIS client only. A requirement belongs to the client when
  // the client posted it directly (companyId), or when a vendor raised it under
  // a master agreement with this client (msa.clientId).
  //
  // Without this filter the query returned every OPEN/DRAFT requirement in the
  // database, so one client's console counted another client's open roles.
  const requirements = await prisma.requirement.findMany({
    where: {
      status: { in: ['OPEN', 'DRAFT'] },
      OR: [
        { companyId: clientCompany.id },
        { msa: { clientId: clientCompany.id } },
      ],
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

  // CLAUDE.md: "Every read of another person's data writes an AccessLog row"
  const contractorPersonIds = [...new Set(contracts.map(c => c.personId))]
  logBulkAccess(contractorPersonIds, {
    actorPersonId: caller.person.id,
    actorCompanyId: caller.company?.id,
    action: 'CONTRACT_VIEW',
    reason: `Program view at ${clientCompany.name}`,
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
      // Whole currency, not cents. See decisions/route.ts.
      amount: exp.total ? Number(exp.total) : null,
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
        payingCustomer: c.clientCompany,
        endClient: c.endClientCompany,
        workLocation: c.workLocation,
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
