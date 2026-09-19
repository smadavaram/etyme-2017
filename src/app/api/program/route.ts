import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { chainTop } from '@/lib/chain-top'
import { mayNameSubVendors, namesForClient, type SeenName } from '@/lib/chain-names'
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
      // 2026-09-17. The role the contract is for, read by the starting-soon
      // preview below: a licensed role is cleared against the licensed
      // start packet, and a SellContract carries no title of its own.
      requirement: { select: { title: true } },
    },
    orderBy: { endDate: 'asc' },
  })
  // One row per person: the contract this client pays, never the rungs
  // its suppliers arranged below it (`lib/chain-top`).
  const contracts = chainTop(everyRung)
  // On site means working now. A drafted contract is somebody who has
  // not started; it is on the Contractors tab with that word on it.
  const onSite = contracts.filter((c) => c.state === 'IN_PROGRESS')

  // ── Weeks and claims waiting on this desk ───────────────────────────
  //
  // Read here rather than further down, because the firm named on a row
  // this desk is asked to approve is decided by the chain, and the chain
  // has to be in hand first. A timesheet and an expense are filed
  // against the contract of the firm that employs the person, which in a
  // chain is the rung below the one this client pays.
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

  // ── Whose name this reader may print ────────────────────────────────
  //
  // The roster is reduced to the rung this client pays and was right.
  // The approval queue was not: a week is filed against the employer's
  // leg, so `vendor` on the row a client is asked to sign named the firm
  // below the one it pays. One rule answers for both (`lib/chain-names`),
  // and it is asked about every row on this page rather than only the
  // queue — the reduction above keeps the leg underneath where the rung
  // above it is not in hand, and a name is not something to be right
  // about by accident.
  //
  // Only a client's own seats are masked. A supplier reading this page
  // about a client it places at is looking at its own supply chain, and
  // the term this reads is the client's agreement, not theirs.
  const viewerIsClient = caller.company?.id === clientCompany.id

  // Unfiltered by state or by account wall, and only for the reader that
  // needs it: the walk up a chain is only as good as the rungs it can
  // see, and a prime's leg filtered out of the roster above would leave
  // the sub below it looking like the top of its own chain.
  const chainRungs = viewerIsClient
    ? await prisma.sellContract.findMany({
        where: endClientFilter(clientCompany.id),
        select: {
          id: true, personId: true, companyId: true, clientCompanyId: true,
          company: { select: { name: true } },
        },
      })
    : []

  const disclosureTerms = viewerIsClient
    ? await prisma.masterAgreement.findMany({
        where: { clientId: clientCompany.id },
        select: { clientId: true, vendorId: true, disclosesSubVendors: true, status: true },
      })
    : []

  /** One rung, in the shape the name rule reads. */
  const asRung = (c: {
    id: string; personId: string; companyId: string; clientCompanyId: string
    company: { name: string }
  }) => ({
    id: c.id, personId: c.personId, companyId: c.companyId,
    companyName: c.company.name, clientCompanyId: c.clientCompanyId,
  })

  /**
   * The same rung arrives from four reads; keep one of each.
   *
   * Not tidiness. The walk up a chain asks which single rung sits above
   * this one, and two copies of the prime's leg are two answers, which
   * the rule reads as a chain nobody can follow and refuses to name at
   * all.
   */
  const byId = <T extends { id: string }>(rows: T[]): T[] =>
    [...new Map(rows.map((r) => [r.id, r])).values()]

  const seenNames = viewerIsClient
    ? namesForClient(
        byId([
          ...chainRungs.map(asRung),
          ...everyRung.map(asRung),
          ...pendingTimesheets.map((t) => asRung(t.sellContract)),
          ...pendingExpenses.map((e) => asRung(e.sellContract)),
        ]),
        clientCompany.id,
        (primeCompanyId: string) =>
          mayNameSubVendors(disclosureTerms, clientCompany.id, primeCompanyId)
      )
    : new Map<string, SeenName>()

  /** What this reader may call a firm on a row. */
  const shown = (companyId: string, trueName: string): SeenName =>
    seenNames.get(companyId) ?? {
      companyId, name: trueName, masked: false, through: null,
      phrase: trueName, says: trueName,
    }

  /** A firm on the payload, named or withheld. The id travels either way. */
  const firm = (c: { id: string; name: string }) => {
    const seen = shown(c.id, c.name)
    return {
      id: c.id,
      name: seen.name,
      phrase: seen.phrase,
      nameWithheld: seen.masked,
      suppliedThrough: seen.through,
    }
  }

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
    const vendorName = shown(c.company.id, c.company.name).name
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
  // 2026-09-17, on the same precedent as `validFrom` above and for the
  // same reason: a column nobody selects is invisible to arithmetic that
  // is already right. `provider` and `result` carry who issued a license
  // and its number and state, and the refusal has to name them — "RN
  // 154-882, WI expired" can be checked against a register; "your license
  // expired" cannot.
  const verificationShape = { type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true, verifiedAt: true, provider: true, result: true } as const
  const startingSoon = await Promise.all(
    contracts.filter((c) => c.state !== 'IN_PROGRESS').slice(0, 5).map(async (c) => {
      const [personVerifications, supplierCertificates] = await Promise.all([
        prisma.verification.findMany({ where: { personId: c.personId }, select: verificationShape }),
        prisma.verification.findMany({ where: { companyId: c.companyId, type: { in: [...CERTS] } }, select: verificationShape }),
      ])
      const papers = contractClearance({
        personName: c.person.name, personVerifications,
        // Inside a sentence the desk reads, so the phrase: "the firm
        // supplied through Computer Systems has no current certificate".
        supplierName: shown(c.company.id, c.company.name).phrase, supplierCertificates,
        clientName: clientCompany.name, on: c.startDate > now ? c.startDate : now,
        // The role, so the preview runs the same packet activation will:
        // a licensed role with no license on file reads as a block a week
        // early rather than as a pass here and a refusal on the day. The
        // last day says whether the license outlives the assignment.
        role: c.requirement?.title ?? null,
        through: c.endDate,
      })
      return {
        contractId: c.id,
        person: { id: c.person.id, name: c.person.name },
        vendor: firm(c.company),
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
    ...onSite.filter((c) => c.startDate >= dayStart).map((c) => ({ id: `s-${c.id}`, what: 'Started', who: `${c.person.name} through ${shown(c.company.id, c.company.name).phrase}`, at: c.startDate.toISOString() })),
    ...awardedToday.map((a) => ({ id: `a-${a.id}`, what: 'Awarded', who: `${a.person.name} — ${a.requirement.title}`, at: a.decidedAt!.toISOString() })),
    ...asksToday.map((m) => { const md = (m.metadata ?? {}) as Record<string, string>; return { id: `k-${m.id}`, what: 'Asked for', who: `${md.personName ?? 'somebody'} through ${md.supplierName ?? 'a supplier'} — ${md.roleTitle ?? ''}`, at: m.createdAt.toISOString() } }),
  ].sort((a, b) => b.at.localeCompare(a.at))

  // Weeks waiting for the client's signature, and the claims beside
  // them, are read above — the name on each row is the chain's answer,
  // not the filing leg's.

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
      // The firm this client can call about the week it is being asked
      // to sign, which below its own supplier is the supplier.
      vendor: shown(ts.sellContract.company.id, ts.sellContract.company.name).name,
      detail: `Week ending ${ts.periodEnd.toLocaleDateString()}`,
      amount: ts.totalHours ? Number(ts.totalHours) : null,
      submittedAt: ts.periodEnd.toISOString(),
      daysWaiting: Math.floor((now.getTime() - ts.periodEnd.getTime()) / (24 * 60 * 60 * 1000)),
    })),
    ...pendingExpenses.map(exp => ({
      id: exp.id,
      kind: 'expense' as const,
      person: exp.sellContract.person.name,
      vendor: shown(exp.sellContract.company.id, exp.sellContract.company.name).name,
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
        vendor: firm(c.company),
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
        vendor: firm(c.company),
        endDate: c.endDate?.toISOString() ?? null,
        daysRemaining: c.endDate
          ? Math.ceil((c.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
          : null,
        billRate: c.billRate,
      })),
    },
  })
}
