import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { resolveClientCompany } from '@/lib/resolve-client-company'
import { logBulkAccess } from '@/lib/access-log'

/**
 * GET /api/tenure
 *
 * Cross-vendor tenure tracking — Addendum E's core differentiator.
 *
 * "Tenure accrues to the person at the client, aggregated across all
 * vendors and all assignments. Twelve months via one vendor plus twelve
 * via another is twenty-four months of exposure. Per-assignment tenure
 * tracking is wrong and is the industry's blind spot."
 *
 * Returns each person's cumulative tenure at a given client, status
 * against the tenure cap, and break-in-service eligibility.
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

  // All sell contracts at this end client (active + ended + paused, not draft/cancelled)
  // Uses endClientFilter: matches endClientCompanyId OR clientCompanyId when no
  // separate end client is set (direct placement — paying customer IS the end client)
  const contracts = await prisma.sellContract.findMany({
    where: {
      ...endClientFilter(clientCompany.id),
      state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED'] },
    },
    include: {
      person: { select: { id: true, name: true } },
      company: { select: { id: true, name: true } }, // the vendor
      clientCompany: { select: { id: true, name: true } }, // the paying customer
      endClientCompany: { select: { id: true, name: true } }, // the end client (if different)
      workLocation: { select: { id: true, name: true, city: true, state: true, isRemote: true } },
    },
    orderBy: { startDate: 'asc' },
  })

  // Load governance rules for tenure cap and break-in-service
  const tenureRule = await prisma.governanceRule.findFirst({
    where: {
      policy: { companyId: clientCompany.id, isActive: true },
      ruleType: 'TENURE_CAP',
      isActive: true,
    },
  })

  const breakRule = await prisma.governanceRule.findFirst({
    where: {
      policy: { companyId: clientCompany.id, isActive: true },
      ruleType: 'BREAK_IN_SERVICE',
      isActive: true,
    },
  })

  const capMonths = tenureRule ? (tenureRule.parameters as any).maxMonths : null
  const capDays = capMonths ? Math.round(capMonths * 30.44) : null
  const breakDays = breakRule ? (breakRule.parameters as any).breakDays : null

  // Group contracts by person
  const personMap = new Map<string, {
    name: string
    vendors: Map<string, string> // id → name
    contracts: typeof contracts
    totalDays: number
    hasActive: boolean
    lastEndDate: Date | null
  }>()

  for (const c of contracts) {
    const existing = personMap.get(c.personId)
    const end = c.endDate ?? now
    const days = Math.max(0, Math.ceil((end.getTime() - c.startDate.getTime()) / (1000 * 60 * 60 * 24)))
    const isActive = c.state === 'IN_PROGRESS' || c.state === 'PAUSED'

    if (existing) {
      existing.vendors.set(c.company.id, c.company.name)
      existing.contracts.push(c)
      existing.totalDays += days
      if (isActive) existing.hasActive = true
      if (c.endDate && (!existing.lastEndDate || c.endDate > existing.lastEndDate)) {
        existing.lastEndDate = c.endDate
      }
    } else {
      const vendorMap = new Map<string, string>()
      vendorMap.set(c.company.id, c.company.name)
      personMap.set(c.personId, {
        name: c.person.name,
        vendors: vendorMap,
        contracts: [c],
        totalDays: days,
        hasActive: isActive,
        lastEndDate: c.endDate ?? null,
      })
    }
  }

  // Classify each person's tenure status
  const people = Array.from(personMap.entries()).map(([personId, data]) => {
    const cumulativeMonths = Math.round(data.totalDays / 30.44)
    let status: 'OK' | 'WARNING' | 'BREAK_REQUIRED' | 'IN_BREAK' | 'ELIGIBLE' = 'OK'
    let eligibleDate: string | null = null

    if (capDays !== null) {
      const pct = data.totalDays / capDays
      if (pct < 0.75) {
        status = 'OK'
      } else if (pct < 1.0) {
        status = 'WARNING'
      } else if (data.hasActive) {
        status = 'BREAK_REQUIRED'
      } else if (breakDays !== null && data.lastEndDate) {
        // Check break-in-service
        const daysSinceEnd = Math.ceil(
          (now.getTime() - data.lastEndDate.getTime()) / (1000 * 60 * 60 * 24)
        )
        if (daysSinceEnd < breakDays) {
          status = 'IN_BREAK'
          const eligible = new Date(data.lastEndDate.getTime() + breakDays * 24 * 60 * 60 * 1000)
          eligibleDate = eligible.toISOString().slice(0, 10)
        } else {
          status = 'ELIGIBLE'
        }
      } else {
        status = 'ELIGIBLE'
      }
    }

    return {
      personId,
      name: data.name,
      vendors: Array.from(data.vendors.entries()).map(([id, name]) => ({ id, name })),
      cumulativeMonths,
      cumulativeDays: data.totalDays,
      contractCount: data.contracts.length,
      status,
      eligibleDate,
      hasActive: data.hasActive,
      contracts: data.contracts.map(c => ({
        id: c.id,
        vendorName: c.company.name,
        payingCustomer: c.clientCompany.name,
        endClient: c.endClientCompany?.name ?? c.clientCompany.name,
        workLocation: c.workLocation
          ? { name: c.workLocation.name, city: c.workLocation.city, state: c.workLocation.state, isRemote: c.workLocation.isRemote }
          : null,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate?.toISOString() ?? null,
        state: c.state,
        daysWorked: Math.max(0, Math.ceil(
          ((c.endDate ?? now).getTime() - c.startDate.getTime()) / (1000 * 60 * 60 * 24)
        )),
      })),
    }
  })

  // CLAUDE.md: "Every read of another person's data writes an AccessLog row"
  const personIds = people.map((p) => p.personId)
  if (personIds.length > 0) {
    logBulkAccess(personIds, {
      actorPersonId: caller.person.id,
      actorCompanyId: caller.company?.id ?? undefined,
      action: 'TENURE_VIEW',
      reason: `Tenure view at ${clientCompany.name}`,
    })
  }

  // Sort: BREAK_REQUIRED first, then WARNING, then IN_BREAK, then OK, then ELIGIBLE
  const statusOrder = { BREAK_REQUIRED: 0, WARNING: 1, IN_BREAK: 2, OK: 3, ELIGIBLE: 4 }
  people.sort((a, b) => statusOrder[a.status] - statusOrder[b.status])

  const summary = {
    totalTracked: people.length,
    ok: people.filter(p => p.status === 'OK').length,
    warning: people.filter(p => p.status === 'WARNING').length,
    breakRequired: people.filter(p => p.status === 'BREAK_REQUIRED').length,
    inBreak: people.filter(p => p.status === 'IN_BREAK').length,
    eligible: people.filter(p => p.status === 'ELIGIBLE').length,
  }

  return NextResponse.json({
    data: {
      client: { id: clientCompany.id, name: clientCompany.name },
      tenureCapMonths: capMonths,
      breakDays,
      people,
      summary,
    },
  })
}
