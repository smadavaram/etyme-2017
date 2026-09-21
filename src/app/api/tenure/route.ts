import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { resolveClientCompany } from '@/lib/resolve-client-company'
import { seatUnits } from '@/lib/account-walls'
import { seatTrail } from '@/lib/program-seat'
import { seatMayRead, seatScope } from '@/lib/walls'
import { logBulkAccess } from '@/lib/access-log'
import { daysOnSite, monthsOf } from '@/lib/tenure-days'
// etyme-architect, 2026-09-17. A cross-domain edit in etyme-regulatory's
// file, on the precedent of c126c1c4 and f901e914: a sub-vendor's name is
// the prime's to keep unless the client's agreement with the prime says
// otherwise, and one rule landing in three routes at once is a rule, not
// three changes. Nothing else in this file was touched — every day on
// site is still counted the same way, from the same rungs.
import { mayNameSubVendors, namesForClient, firmsOnARow, type SeenName } from '@/lib/chain-names'

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

  // Entitlement-checked: the caller is either this client, a program
  // office in a seat the client granted, or a vendor with a real
  // placement there. An unverified ?clientCompanyId= is a 403.
  const { client: clientCompany, seat, error: clientError } = await resolveClientCompany(
    caller,
    url.searchParams.get('clientCompanyId')
  )
  if (clientError) return clientError

  // ── What a seated office may read here ──────────────────────────────
  //
  // Tenure is the client's own exposure and the desk that answers for it
  // is the compliance officer's — but a program manager answers for it
  // too, and both hold `assignments.read` at a CLIENT
  // (`lib/company-defaults`). So the gate is the permission rather than
  // the role name: a client that seats an office at a desk holding it
  // has decided the office may read who is on its sites and for how
  // long, and a client that seats it at its AP clerk's desk has not.
  //
  // Asked against the SEAT'S role, never the office's own. An MSP
  // coordinator whose own firm never granted its coordinators
  // `assignments.read` is the client's program manager inside this seat.
  if (seat) {
    const verdict = seatMayRead(seat, 'assignments.read', 'the tenure ledger')
    if (!verdict.ok) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: verdict.says } },
        { status: 403 }
      )
    }
  }

  // A seat narrowed to one business unit reaches that unit and
  // everything under it, and no further. Null for an unnarrowed seat and
  // for every unseated reader, which is every reader there was before.
  const units = await seatUnits(seat ?? null)

  const now = new Date()

  // All sell contracts at this end client (active + ended + paused, not draft/cancelled)
  // Uses endClientFilter: matches endClientCompanyId OR clientCompanyId when no
  // separate end client is set (direct placement — paying customer IS the end client)
  const contracts = await prisma.sellContract.findMany({
    where: {
      ...endClientFilter(clientCompany.id),
      ...seatScope(units),
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

  // ── Whose name this reader may read ─────────────────────────────────
  //
  // Tenure is aggregated across every vendor, which is the point of it —
  // and in a chain the vendor list named the prime's sub-vendor, a firm
  // the client has no contract with. The days stay; the name is the
  // prime's to keep unless the client's agreement with the prime says
  // otherwise. A supplier reading this page reads its own chain unmasked.
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

  /** What this reader may call a firm on a row. */
  const shown = (companyId: string, trueName: string): SeenName =>
    seenNames.get(companyId) ?? {
      companyId,
      name: trueName,
      masked: false,
      through: null,
      phrase: trueName,
      says: trueName,
    }

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
    const isActive = c.state === 'IN_PROGRESS' || c.state === 'PAUSED'

    if (existing) {
      existing.vendors.set(c.company.id, c.company.name)
      existing.contracts.push(c)
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
        totalDays: 0,
        hasActive: isActive,
        lastEndDate: c.endDate ?? null,
      })
    }
  }

  // Days on site, overlaps counted once. A prime's contract and its
  // sub's contract are the same person on the same days; summed per row
  // they doubled, and a person supplied through a chain hit an
  // eighteen-month cap at nine.
  for (const data of personMap.values()) data.totalDays = daysOnSite(data.contracts, now)

  // Classify each person's tenure status
  const people = Array.from(personMap.entries()).map(([personId, data]) => {
    const cumulativeMonths = monthsOf(data.totalDays)
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
      // ── The firms on this person's row ──
      //
      // Folded, not listed. A person bought through a chain has a row
      // per rung, and a withheld sub-vendor's name IS the name of the
      // prime it comes through — so the cell read "Computer Systems Inc,
      // Supplied through Computer Systems Inc", which looks like one
      // firm entered twice and is actually two rungs of one chain.
      //
      // `firmsOnARow` names the firm the client pays once and says how
      // many firms sit below it. Nothing newly hidden and nothing newly
      // disclosed: the count is the client's own exposure, the name
      // below is the prime's to keep.
      firms: firmsOnARow(Array.from(data.vendors.entries()).map(([id, name]) => shown(id, name))),
      cumulativeMonths,
      cumulativeDays: data.totalDays,
      contractCount: data.contracts.length,
      status,
      eligibleDate,
      hasActive: data.hasActive,
      contracts: data.contracts.map(c => ({
        id: c.id,
        vendorName: shown(c.companyId, c.company.name).name,
        vendorNameWithheld: shown(c.companyId, c.company.name).masked,
        // Who this rung reaches the client through. Never withheld: it is
        // a firm the client itself pays and can call about this person.
        suppliedThrough: shown(c.companyId, c.company.name).through,
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
  //
  // A read made from a seat is filed under its own action and carries
  // the seat in its reason, so the question a client asks afterwards —
  // who looked at my workforce, and on whose authority — is one query
  // rather than a grep. `Tenure view at Cavanaugh Glassworks` named
  // neither the office nor the desk it sat at.
  const personIds = people.map((p) => p.personId)
  if (personIds.length > 0) {
    logBulkAccess(personIds, {
      actorPersonId: caller.person.id,
      actorCompanyId: caller.company?.id ?? undefined,
      action: seat ? 'PROGRAM_READ' : 'TENURE_VIEW',
      reason: seat
        ? seatTrail(seat, 'Tenure ledger read')
        : `Tenure view at ${clientCompany.name}`,
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
