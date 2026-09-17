import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { chainTop } from '@/lib/chain-top'
import { contractClearance } from '@/lib/contract-clearance'
import { tierWord } from '@/lib/supplier-tier'
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

  const everyRung = await prisma.sellContract.findMany({
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
  // One row per person: the contract this client pays, never the rungs
  // its suppliers arranged below it (`lib/chain-top`).
  const contracts = chainTop(everyRung)
  // On site means working now. A drafted contract is somebody who has
  // not started; it is on the Contractors tab with that word on it.
  const onSite = contracts.filter((c) => c.state === 'IN_PROGRESS')

  // Aggregate by vendor — the suppliers with people on site
  const vendorMap = new Map<string, {
    id: string
    name: string
    headcount: number
    totalBillRate: number
    contracts: typeof contracts
  }>()

  for (const c of onSite) {
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

  // The standing this client gave each supplier, in the word the
  // suppliers page uses; an agreement on file counts as approved.
  const vendorIds = Array.from(vendorMap.keys())
  const [standings, agreements] = await Promise.all([
    prisma.counterparty.findMany({
      where: { companyId: clientCompany.id, relationship: 'SUPPLIER', otherCompanyId: { in: vendorIds } },
      select: { otherCompanyId: true, tier: true },
    }),
    prisma.masterAgreement.findMany({ where: { clientId: clientCompany.id, vendorId: { in: vendorIds } }, select: { vendorId: true } }),
  ])
  const tierOf = new Map(standings.map((x) => [x.otherCompanyId, x.tier]))
  const agreed = new Set(agreements.map((a) => a.vendorId))

  const vendors = Array.from(vendorMap.values()).map(v => ({
    id: v.id,
    name: v.name,
    headcount: v.headcount,
    avgRate: v.headcount > 0 ? Math.round(v.totalBillRate / v.headcount) : 0,
    totalMonthlySpend: v.totalBillRate * 160, // cents, at 160 hours a month
    standing: tierWord(tierOf.get(v.id), agreed.has(v.id)),
  }))

  // Somebody who has not started yet, and whether the paperwork lets
  // them. The same checklist activation runs, read early, so the desk
  // sees "no I-9 on file" a week before the start date instead of on it.
  const CERTS = ['INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER'] as const
  // `validFrom` as well as `expiresAt`, and it is read here because a
  // preview that disagrees with the decision it previews is worse than no
  // preview: without the floor this page called a policy beginning in
  // October held in September, while activation refused the same
  // certificate on the start date. The shape is shared by both queries
  // below, which is why adding the column to one query would have missed.
  const verificationShape = { type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true, verifiedAt: true } as const
  const startingSoon = await Promise.all(
    contracts.filter((c) => c.state !== 'IN_PROGRESS').slice(0, 5).map(async (c) => {
      const [personVerifications, supplierCertificates] = await Promise.all([
        prisma.verification.findMany({ where: { personId: c.personId }, select: verificationShape }),
        prisma.verification.findMany({ where: { companyId: c.companyId, type: { in: [...CERTS] } }, select: verificationShape }),
      ])
      const papers = contractClearance({
        personName: c.person.name, personVerifications,
        supplierName: c.company.name, supplierCertificates,
        clientName: clientCompany.name, on: c.startDate > now ? c.startDate : now,
      })
      return {
        contractId: c.id,
        person: { id: c.person.id, name: c.person.name },
        vendor: c.company,
        startDate: c.startDate.toISOString(),
        daysUntil: Math.ceil((c.startDate.getTime() - now.getTime()) / 86_400_000),
        paperwork: { outcome: papers.outcome, says: papers.says, fix: papers.fix },
      }
    })
  )

  // What moved today at this program, so a clear queue is not an
  // empty page: hours signed, claims approved, people started, roles
  // awarded.
  const dayStart = new Date(now)
  dayStart.setUTCHours(0, 0, 0, 0)
  const [signedToday, claimsToday, awardedToday, asksToday] = await Promise.all([
    prisma.timesheet.findMany({
      where: { sellContract: endClientFilter(clientCompany.id), clientApprovedAt: { gte: dayStart } },
      select: { id: true, totalHours: true, clientApprovedAt: true, person: { select: { name: true } } },
      orderBy: { clientApprovedAt: 'desc' }, take: 10,
    }),
    prisma.expense.findMany({
      where: { sellContract: endClientFilter(clientCompany.id), approvedAt: { gte: dayStart } },
      select: { id: true, total: true, approvedAt: true, person: { select: { name: true } } },
      orderBy: { approvedAt: 'desc' }, take: 10,
    }),
    prisma.submission.findMany({
      where: { toCompanyId: clientCompany.id, status: 'PLACED', decidedAt: { gte: dayStart } },
      select: { id: true, decidedAt: true, person: { select: { name: true } }, requirement: { select: { title: true } } },
      orderBy: { decidedAt: 'desc' }, take: 10,
    }),
    prisma.message.findMany({
      where: { type: 'ASK', conversation: { companyId: clientCompany.id }, createdAt: { gte: dayStart } },
      select: { id: true, createdAt: true, metadata: true },
      orderBy: { createdAt: 'desc' }, take: 10,
    }),
  ])
  const today = [
    ...signedToday.map((t) => ({ id: `t-${t.id}`, what: 'Hours signed', who: `${t.person.name}, ${Number(t.totalHours)}h`, at: t.clientApprovedAt!.toISOString() })),
    ...claimsToday.map((e) => ({ id: `e-${e.id}`, what: 'Expense approved', who: `${e.person.name}, $${Number(e.total).toFixed(2)}`, at: e.approvedAt!.toISOString() })),
    ...onSite.filter((c) => c.startDate >= dayStart).map((c) => ({ id: `s-${c.id}`, what: 'Started', who: `${c.person.name} through ${c.company.name}`, at: c.startDate.toISOString() })),
    ...awardedToday.map((a) => ({ id: `a-${a.id}`, what: 'Awarded', who: `${a.person.name} — ${a.requirement.title}`, at: a.decidedAt!.toISOString() })),
    ...asksToday.map((m) => { const md = (m.metadata ?? {}) as Record<string, string>; return { id: `k-${m.id}`, what: 'Asked for', who: `${md.personName ?? 'somebody'} through ${md.supplierName ?? 'a supplier'} — ${md.roleTitle ?? ''}`, at: m.createdAt.toISOString() } }),
  ].sort((a, b) => b.at.localeCompare(a.at))

  // Weeks waiting for the client's signature. Once this client has
  // signed, the sheet is the employer's to accept, not this desk's.
  const pendingTimesheets = await prisma.timesheet.findMany({
    where: {
      sellContract: endClientFilter(clientCompany.id),
      status: 'SUBMITTED',
      clientApprovedAt: null,
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

  // What the client pays a month, in cents, at 160 hours: the top rung
  // of every chain with somebody on site.
  const totalMonthlySpend = onSite.reduce((sum, c) => sum + (c.billRate ?? 0) * 160, 0)

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
        activeContractors: new Set(onSite.map((c) => c.personId)).size,
        vendors: vendors.length,
        monthlySpend: totalMonthlySpend,
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
      startingSoon,
      today,
      openRoles: requirements.map(r => ({
        id: r.id,
        title: r.title,
        status: r.status,
        openDays: Math.floor((now.getTime() - r.createdAt.getTime()) / 86_400_000),
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
