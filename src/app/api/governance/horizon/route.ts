import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { resolveClientCompany } from '@/lib/resolve-client-company'
import {
  projectTenure, projectBreakInService, projectExpiry, projectContractEnd,
  sortHorizon, byTeam, type HorizonItem,
} from '@/lib/governance-horizon'

/**
 * GET /api/governance/horizon?days=120&team=HR
 *
 * What is about to go wrong at this client, when, and whose job it is.
 *
 * The existing governance engine answers "may this proceed?" at the moment
 * something is attempted. By then a manager has usually already promised
 * the person another year. This looks forward instead, and addresses each
 * consequence to the team that actually decides it.
 *
 * Tenure is aggregated per person across ALL vendors and ALL assignments,
 * per Addendum E — the industry's blind spot is tracking it per assignment,
 * which lets twenty-four months of exposure look like two lots of twelve.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { client, error: clientError } = await resolveClientCompany(
    caller,
    request.nextUrl.searchParams.get('clientCompanyId')
  )
  if (clientError) return clientError

  const windowDays = Math.min(
    365,
    Math.max(7, parseInt(request.nextUrl.searchParams.get('days') ?? '120', 10) || 120)
  )
  const now = new Date()

  // The rules this client actually runs — the caps are theirs, not ours.
  const rules = await prisma.governanceRule.findMany({
    where: { isActive: true, policy: { companyId: client.id, isActive: true } },
    select: { ruleType: true, parameters: true, enforcementMode: true, ownerTeam: true },
  })
  const ruleOf = (t: string) => rules.find(r => r.ruleType === t)
  const tenureCapMonths = Number((ruleOf('TENURE_CAP')?.parameters as any)?.maxMonths ?? 18)
  const breakDays = Number((ruleOf('BREAK_IN_SERVICE')?.parameters as any)?.breakDays ?? 90)

  const items: HorizonItem[] = []

  // ── Tenure, aggregated per person across every vendor ──
  const contracts = await prisma.sellContract.findMany({
    where: endClientFilter(client.id),
    select: {
      id: true, startDate: true, endDate: true, state: true,
      person: { select: { id: true, name: true } },
    },
  })

  const byPerson = new Map<string, { name: string; months: number; live: boolean; lastEnd: Date | null }>()
  for (const c of contracts) {
    const live = c.state === 'IN_PROGRESS' || c.state === 'VERIFIED'
    const from = c.startDate
    const to = live ? now : (c.endDate ?? now)
    const months = Math.max(0, (to.getTime() - from.getTime()) / (30.44 * 86_400_000))

    const prev = byPerson.get(c.person.id)
    // Accumulate across vendors — this is the whole point of Addendum E.
    byPerson.set(c.person.id, {
      name: c.person.name,
      months: (prev?.months ?? 0) + months,
      live: (prev?.live ?? false) || live,
      lastEnd: live
        ? null
        : [prev?.lastEnd, c.endDate].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null,
    })
  }

  for (const [personId, f] of byPerson) {
    const tenure = projectTenure(
      { personId, personName: f.name, monthsAccrued: f.months, accruing: f.live, capMonths: tenureCapMonths },
      now, windowDays
    )
    if (tenure) items.push(tenure)

    // Somebody off site is inside a break — say when it ends.
    if (!f.live && f.lastEnd) {
      const brk = projectBreakInService(
        { personId, personName: f.name, lastEndedAt: f.lastEnd, requiredBreakDays: breakDays },
        now, windowDays
      )
      if (brk) items.push(brk)
    }
  }

  // ── Certificates and authorisations running out ──
  const horizonEnd = new Date(now.getTime() + windowDays * 86_400_000)
  const verifications = await prisma.verification.findMany({
    where: {
      expiresAt: { not: null, lte: horizonEnd },
      status: { in: ['CLEAR', 'CONDITIONAL', 'PENDING'] },
    },
    select: {
      id: true, type: true, expiresAt: true,
      company: { select: { id: true, name: true } },
      person: { select: { id: true, name: true } },
    },
  })

  // How many of this client's people each vendor currently has on site —
  // the number that turns an administrative expiry into a decision.
  const liveByVendor = new Map<string, number>()
  const liveContracts = await prisma.sellContract.findMany({
    where: { ...endClientFilter(client.id), state: { in: ['IN_PROGRESS', 'VERIFIED'] } },
    select: { companyId: true, personId: true },
  })
  for (const c of liveContracts) {
    liveByVendor.set(c.companyId, (liveByVendor.get(c.companyId) ?? 0) + 1)
  }
  const livePersonIds = new Set(liveContracts.map(c => c.personId))

  for (const v of verifications) {
    if (!v.expiresAt) continue
    const isCompany = Boolean(v.company)
    const subjectId = isCompany ? v.company!.id : v.person?.id
    if (!subjectId) continue

    // Only surface what touches this client: a vendor supplying them, or a
    // person currently on their site.
    const workers = isCompany ? (liveByVendor.get(subjectId) ?? 0) : (livePersonIds.has(subjectId) ? 1 : 0)
    if (workers === 0) continue

    const item = projectExpiry(
      {
        id: v.id,
        subjectKind: isCompany ? 'VENDOR' : 'PERSON',
        subjectId,
        subjectName: isCompany ? v.company!.name : v.person!.name,
        type: v.type,
        expiresAt: v.expiresAt,
        activeWorkers: workers,
      },
      now, windowDays
    )
    if (item) items.push(item)
  }

  // ── Engagements ending with nobody having decided ──
  const ending = await prisma.sellContract.findMany({
    where: {
      ...endClientFilter(client.id),
      state: { in: ['IN_PROGRESS', 'VERIFIED'] },
      endDate: { not: null, lte: horizonEnd, gte: now },
    },
    select: {
      id: true, endDate: true,
      person: { select: { id: true, name: true } },
      rolloff: { select: { id: true } },
    },
  })

  for (const c of ending) {
    if (!c.endDate) continue
    const item = projectContractEnd(
      {
        contractId: c.id,
        personId: c.person.id,
        personName: c.person.name,
        endsAt: c.endDate,
        // A rolloff event on record means somebody has engaged with it.
        undecided: c.rolloff === null,
      },
      now, windowDays
    )
    if (item) items.push(item)
  }

  const teamFilter = request.nextUrl.searchParams.get('team')
  const grouped = byTeam(items)
  const all = sortHorizon(items)
  const shown = teamFilter && teamFilter in grouped
    ? grouped[teamFilter as keyof typeof grouped]
    : all

  return NextResponse.json({
    data: {
      client: { id: client.id, name: client.name },
      windowDays,
      policy: { tenureCapMonths, breakDays },
      horizon: shown,
      byTeam: grouped,
      summary: {
        total: all.length,
        blocking: all.filter(i => i.severity === 'BLOCK').length,
        // Anything inside a month is close enough that waiting costs options.
        thisMonth: all.filter(i => i.daysAway <= 30).length,
        alreadyBreached: all.filter(i => i.daysAway < 0).length,
        perTeam: {
          HR: grouped.HR.length,
          PROCUREMENT: grouped.PROCUREMENT.length,
          HIRING_MANAGER: grouped.HIRING_MANAGER.length,
          LEGAL: grouped.LEGAL.length,
        },
      },
    },
  })
}
