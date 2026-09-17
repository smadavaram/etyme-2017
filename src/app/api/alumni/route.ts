import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { resolveClientCompany } from '@/lib/resolve-client-company'
import { logBulkAccess } from '@/lib/access-log'
import { daysOnSite } from '@/lib/tenure-days'
// etyme-architect, 2026-09-17. A cross-domain edit in etyme-supply's
// file, on the precedent of c126c1c4 and f901e914: a sub-vendor's name is
// the prime's to keep unless the client's agreement with the prime says
// otherwise, and one rule landing in three routes at once is a rule, not
// three changes. Nothing else in this file was touched — who is eligible,
// and from when, is unchanged.
import { mayNameSubVendors, namesForClient, type SeenName } from '@/lib/chain-names'

/**
 * GET /api/alumni
 *
 * "Worked here before" — the alumni memory surface.
 *
 * BRD + Addendum D: Alumni re-engagement is the strongest demand-side
 * feature in the platform. Addendum E §E.2.3 gates it: the "ask them
 * back" action checks the TenureLedger before it is offered. Inside a
 * break period, show the eligibility date instead of the button.
 *
 * Returns every person who has ever had a SellContract at this client,
 * aggregated across all vendors, with re-engagement eligibility.
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

  // All sell contracts at this end client (active + ended + paused)
  // Uses endClientFilter: matches endClientCompanyId OR clientCompanyId when no
  // separate end client is set (direct placement — paying customer IS the end client)
  const contracts = await prisma.sellContract.findMany({
    where: {
      ...endClientFilter(clientCompany.id),
      state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED'] },
    },
    include: {
      person: {
        select: {
          id: true,
          name: true,
          consultant: { select: { headline: true, skills: true } },
        },
      },
      company: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      endClientCompany: { select: { id: true, name: true } },
      workLocation: { select: { id: true, name: true, city: true, state: true, isRemote: true } },
      engagement: { select: { title: true } },
      timesheets: {
        where: { status: 'APPROVED' },
        select: { totalHours: true },
      },
    },
    orderBy: { startDate: 'asc' },
  })

  // ── Whose name this reader may read ─────────────────────────────────
  //
  // "Released May 2026 · CloudEPA" named the prime's sub-vendor on the
  // client's own page, and the vendor list beside it did the same. Who
  // worked here and when is the client's; which firm below its supplier
  // employed them is the prime's, unless the agreement says otherwise.
  // A supplier reading this page reads its own chain unmasked.
  const viewerIsClient = caller.company?.id === clientCompany.id
  const disclosureTerms = viewerIsClient
    ? await prisma.masterAgreement.findMany({
        where: { clientId: clientCompany.id },
        select: { clientId: true, vendorId: true, disclosesSubVendors: true, status: true },
      })
    : []

  const seenNames = viewerIsClient
    ? namesForClient(
        contracts.map(c => ({
          id: c.id,
          personId: c.personId,
          companyId: c.companyId,
          companyName: c.company.name,
          clientCompanyId: c.clientCompanyId,
        })),
        clientCompany.id,
        (primeCompanyId: string) =>
          mayNameSubVendors(disclosureTerms, clientCompany.id, primeCompanyId)
      )
    : new Map<string, SeenName>()

  /**
   * What this reader may call a firm on a row.
   *
   * A firm that holds somebody on its bench and has never placed them
   * here is not a rung of anybody's chain at this client, so it is not in
   * the map and keeps its own name — the client met it on the bench, not
   * behind a prime.
   */
  const shown = (companyId: string, trueName: string): SeenName =>
    seenNames.get(companyId) ?? {
      companyId,
      name: trueName,
      masked: false,
      through: null,
      phrase: trueName,
      says: trueName,
    }

  // Load governance rules for tenure eligibility check
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

  const capDays = tenureRule
    ? Math.round((tenureRule.parameters as any).maxMonths * 30.44)
    : null
  const breakDaysPolicy = breakRule
    ? (breakRule.parameters as any).breakDays
    : null

  // Group by person
  const personMap = new Map<string, {
    name: string
    skill: string | null
    skills: string[]
    department: string | null
    vendors: Map<string, string>
    totalDays: number
    totalHours: number
    contractCount: number
    hasActive: boolean
    lastEndDate: Date | null
    latestVendor: { id: string; name: string } | null
  }>()

  // Days on site per person, overlaps counted once — a prime's contract
  // and its sub's are the same weeks, and summed per row they doubled.
  const periodsByPerson = new Map<string, { startDate: Date; endDate: Date | null }[]>()
  for (const c of contracts) {
    periodsByPerson.set(c.personId, [...(periodsByPerson.get(c.personId) ?? []), c])
  }

  for (const c of contracts) {
    const days = daysOnSite(periodsByPerson.get(c.personId) ?? [], now)
    const hours = c.timesheets.reduce((sum, t) => sum + (t.totalHours ? Number(t.totalHours) : 0), 0)
    const isActive = c.state === 'IN_PROGRESS' || c.state === 'PAUSED'

    const existing = personMap.get(c.personId)
    if (existing) {
      existing.vendors.set(c.company.id, c.company.name)
      existing.totalDays = days
      existing.totalHours += hours
      existing.contractCount++
      if (isActive) existing.hasActive = true
      if (c.endDate && (!existing.lastEndDate || c.endDate > existing.lastEndDate)) {
        existing.lastEndDate = c.endDate
        existing.latestVendor = c.company
      }
      // Use the latest engagement for department
      if (c.engagement?.title) {
        existing.department = c.engagement.title
      }
    } else {
      const vendorMap = new Map<string, string>()
      vendorMap.set(c.company.id, c.company.name)
      personMap.set(c.personId, {
        name: c.person.name,
        skill: (c.person as any).consultant?.headline ?? null,
        skills: (c.person as any).consultant?.skills ?? [],
        department: c.engagement?.title ?? null,
        vendors: vendorMap,
        totalDays: days,
        totalHours: hours,
        contractCount: 1,
        hasActive: isActive,
        lastEndDate: c.endDate ?? null,
        latestVendor: isActive ? null : c.company,
      })
    }
  }

  // Check bench availability for non-active people
  const allPersonIds = Array.from(personMap.keys())
  const benchListings = await prisma.benchListing.findMany({
    where: {
      consultant: { personId: { in: allPersonIds } },
    },
    include: {
      consultant: { select: { personId: true } },
      company: { select: { id: true, name: true } },
    },
  })

  const benchByPerson = new Map<string, { id: string; name: string }>()
  for (const bl of benchListings) {
    benchByPerson.set(bl.consultant.personId, bl.company)
  }

  // Build alumni list
  const alumni = Array.from(personMap.entries()).map(([personId, data]) => {
    const totalMonths = Math.round(data.totalDays / 30.44)
    const extensions = Math.max(0, data.contractCount - 1)

    // Classify state
    let state: 'placed' | 'available' | 'ended' = 'ended'
    let detail = ''
    let currentVendor: { id: string; name: string } | null = null

    if (data.hasActive) {
      state = 'placed'
      detail = 'On contract here'
    } else {
      const benchVendor = benchByPerson.get(personId)
      if (benchVendor) {
        state = 'available'
        const seen = shown(benchVendor.id, benchVendor.name)
        detail = `Available now · ${seen.name}`
        currentVendor = { id: benchVendor.id, name: seen.name }
      } else {
        state = 'ended'
        const endStr = data.lastEndDate
          ? data.lastEndDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          : 'Unknown'
        const vendorName = data.latestVendor
          ? shown(data.latestVendor.id, data.latestVendor.name).name
          : 'Unknown'
        detail = `Released ${endStr} · ${vendorName}`
      }
    }

    // Check re-engagement eligibility (Addendum E §E.2.3)
    let canReengage = true
    let reengageBlockReason: string | null = null
    let eligibleDate: string | null = null

    if (state === 'placed') {
      // Already here — no re-engage action needed
      canReengage = false
    } else if (capDays !== null && data.totalDays >= capDays && breakDaysPolicy !== null) {
      // Check break-in-service
      if (data.lastEndDate) {
        const daysSinceEnd = Math.ceil(
          (now.getTime() - data.lastEndDate.getTime()) / (1000 * 60 * 60 * 24)
        )
        if (daysSinceEnd < breakDaysPolicy) {
          canReengage = false
          const eligible = new Date(data.lastEndDate.getTime() + breakDaysPolicy * 24 * 60 * 60 * 1000)
          eligibleDate = eligible.toISOString().slice(0, 10)
          reengageBlockReason = `Break period: ${daysSinceEnd} of ${breakDaysPolicy} days completed. Eligible ${eligibleDate}.`
        }
      } else {
        canReengage = false
        reengageBlockReason = 'Tenure limit exceeded, no end date recorded'
      }
    }

    return {
      personId,
      name: data.name,
      skill: data.skill,
      department: data.department,
      totalMonths,
      totalHours: Math.round(data.totalHours),
      extensions,
      state,
      detail,
      currentVendor,
      vendors: Array.from(data.vendors.entries()).map(([id, name]) => ({
        id,
        name: shown(id, name).name,
        nameWithheld: shown(id, name).masked,
        suppliedThrough: shown(id, name).through,
      })),
      canReengage,
      reengageBlockReason,
      eligibleDate,
    }
  })

  // CLAUDE.md: "Every read of another person's data writes an AccessLog row"
  const alumniPersonIds = alumni.map((a) => a.personId)
  if (alumniPersonIds.length > 0) {
    logBulkAccess(alumniPersonIds, {
      actorPersonId: caller.person.id,
      actorCompanyId: caller.company?.id ?? undefined,
      action: 'TENURE_VIEW',
      reason: `Alumni view at ${clientCompany.name}`,
    })
  }

  // Sort: available first (demo value), then placed, then ended
  const stateOrder = { available: 0, placed: 1, ended: 2 }
  alumni.sort((a, b) => stateOrder[a.state] - stateOrder[b.state])

  const summary = {
    total: alumni.length,
    placed: alumni.filter(a => a.state === 'placed').length,
    available: alumni.filter(a => a.state === 'available').length,
    ended: alumni.filter(a => a.state === 'ended').length,
  }

  return NextResponse.json({
    data: {
      client: { id: clientCompany.id, name: clientCompany.name },
      alumni,
      summary,
    },
  })
}
