import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, canReadCostAggregates, askTheDesk, type FieldContext } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { requirementScope } from '@/lib/resolve-client-company'
import { payTrail, READS_PAY } from '@/lib/money/pay-visibility'
import { writePayTrail } from '@/lib/money/pay-trail'
import { burnOf } from '@/lib/bench-policy'

/**
 * GET /api/bench/burn
 *
 * Bench burn dashboard — the daily cost of having unplaced consultants.
 *
 * For each bench listing where the consultant has a BuyContract in
 * BENCH_PAID or IN_PROGRESS state, calculate the daily cost:
 *   dailyCost = payRate × 8 hours
 *
 * Groups by tier (RETAINED vs MARKETING), calculates aggregate burn,
 * and identifies the highest-cost bench sitters.
 *
 * Why this matters: a vendor with 10 bench-paid consultants at $40/hr
 * burns $3,200/day. Proactive matching reduces that to near-zero.
 * This endpoint turns that abstract cost into a visible number.
 *
 * Requires consultants.cost permission for rate visibility.
 *
 * ── Who reads it (checked 2026-09-30, against the pay rule) ───────────
 *
 * Every figure on this page is somebody's pay, or a sum of pay — and a
 * sum over a bench of one is that person's pay. So it is refused whole
 * to a seat without `consultants.cost` (the desks that run pay), rather
 * than withheld figure by figure: a burn page with every figure blank is
 * not a page. A delivery engineer who reads assignments and timesheets
 * is refused in a sentence naming the desks that read pay. A desk that
 * does read it puts each person whose pay it was shown on the access
 * trail (lib/money/pay-trail), the reader's own line excepted.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'consultants.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Reading what the bench costs',
            needs: 'consultants.read',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  const fieldCtx: FieldContext = {
    permissions: caller.permissions,
    isSubject: false,
  }
  const showCost = canReadCostAggregates(fieldCtx)

  if (!showCost) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Reading what the bench costs',
            needs: READS_PAY,
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Active context must be associated with a company' } },
      { status: 403 }
    )
  }

  // Bench listings for this company (not revoked)
  const listings = await prisma.benchListing.findMany({
    where: {
      companyId,
      revokedAt: null,
    },
    include: {
      consultant: {
        select: {
          id: true,
          personId: true,
          headline: true,
          skills: true,
          availableFrom: true,
          person: {
            select: {
              id: true,
              name: true,
              // The pay rate lives on the candidate line, since one buy
              // contract can cover several people at different rates.
              buyCandidacies: {
                where: {
                  state: 'ACTIVE',
                  buyContract: {
                    state: { in: ['IN_PROGRESS', 'BENCH_PAID'] },
                    companyId,
                  },
                },
                select: {
                  id: true,
                  payRate: true,
                  buyContract: { select: { id: true, state: true, contractType: true } },
                },
                take: 1,
              },
            },
          },
        },
      },
    },
    orderBy: { grantedAt: 'desc' },
  })

  const now = new Date()

  // Calculate burn for each listing
  interface BurnEntry {
    personId: string
    personName: string
    headline: string | null
    skills: string[]
    tier: string
    payRate: number     // cents per hour
    dailyCost: number   // dollars per day
    weeklyCost: number  // dollars per week (5 days)
    monthlyCost: number // dollars per month (22 working days)
    contractType: string
    daysOnBench: number
    availableFrom: string | null
    totalBurnToDate: number // dollars burned since bench start
    /** The same, in minor units, from `burnOf`. */
    dailyCents: number
    toDateCents: number
    workingDays: number
    calendarDays: number
    says: string
  }

  const entries: BurnEntry[] = []

  // Whether each person's hours are billed today, and when they last
  // stopped being: a live sell line here (in progress, started, not ended)
  // makes them a placed person and not a bench cost; the latest ended one
  // is when their bench time began, if it is later than the listing.
  const personIds = listings.map((l) => l.consultant.personId)
  const lines = personIds.length
    ? await prisma.sellContract.findMany({
        where: { companyId, personId: { in: personIds }, state: { in: ['IN_PROGRESS', 'ENDED'] } },
        select: { personId: true, state: true, startDate: true, endDate: true },
      })
    : []
  const liveOf = (pid: string) =>
    lines.some((c) => c.personId === pid && c.state === 'IN_PROGRESS' && c.startDate <= now && (!c.endDate || c.endDate >= now))
  const lastEndedOf = (pid: string) =>
    lines
      .filter((c) => c.personId === pid && c.endDate && (c.state === 'ENDED' || c.endDate < now))
      .reduce<Date | null>((a, c) => (a && a > c.endDate! ? a : c.endDate!), null)

  for (const l of listings) {
    const candidacy = l.consultant.person.buyCandidacies[0]
    if (!candidacy) continue // no active buy contract = no cost

    const payRate = candidacy.payRate // cents per hour
    const ended = lastEndedOf(l.consultant.personId)
    const benchSince = ended && ended > l.grantedAt ? ended : l.grantedAt
    // One door for the arithmetic (`burnOf` in lib/bench-policy): working
    // days counted, not five-sevenths of calendar days guessed.
    const b = burnOf({ payRateCents: payRate, billing: liveOf(l.consultant.personId), benchSince }, now)
    if (!b.onBench) continue

    const dailyCost = b.dailyCents! / 100 // dollars, for the older readers
    entries.push({
      personId: l.consultant.personId,
      personName: l.consultant.person.name,
      headline: l.consultant.headline,
      skills: l.consultant.skills,
      tier: l.tier,
      payRate,
      dailyCost,
      weeklyCost: dailyCost * 5,
      monthlyCost: dailyCost * 22,
      contractType: candidacy.buyContract.contractType,
      daysOnBench: b.calendarDays,
      availableFrom: l.consultant.availableFrom?.toISOString() ?? null,
      totalBurnToDate: Math.round(b.toDateCents! / 100),
      dailyCents: b.dailyCents!,
      toDateCents: b.toDateCents!,
      workingDays: b.workingDays,
      calendarDays: b.calendarDays,
      says: b.says,
    })
  }

  // Everybody whose pay this desk was just shown, on the trail once each.
  await writePayTrail(
    caller,
    payTrail({ permissions: caller.permissions, personId: caller.person.id }, entries),
    'the bench burn'
  )

  // Sort by daily cost descending (highest cost first)
  entries.sort((a, b) => b.dailyCost - a.dailyCost)

  // Aggregate by tier
  const retained = entries.filter(e => e.tier === 'RETAINED')
  const marketing = entries.filter(e => e.tier === 'MARKETING')

  const totalDailyBurn = entries.reduce((sum, e) => sum + e.dailyCost, 0)
  const totalWeeklyBurn = entries.reduce((sum, e) => sum + e.weeklyCost, 0)
  const totalMonthlyBurn = entries.reduce((sum, e) => sum + e.monthlyCost, 0)
  const totalBurnToDate = entries.reduce((sum, e) => sum + e.totalBurnToDate, 0)

  // Open roles this firm could actually put somebody forward for.
  //
  // ── What this counted before, and why it was two bugs ─────────────
  //
  // Every OPEN requirement on the platform, with no company filter at
  // all. So CloudEPA's bench page read "12 open reqs for matching" over
  // a firm that could see exactly one — and the twelve were every
  // client's open roles across every tenant, including roles this firm
  // was never invited to and cannot open. A count it may not have, and
  // a number that disagreed with the Requirements page on the same menu.
  //
  // `requirementScope` is the composed rule the Requirements list itself
  // uses: the roles a firm raised, the roles it was invited to, and —
  // only where a raiser deliberately opened it — roles open to the
  // network. Read rather than reassembled, so the burn panel and the
  // list cannot drift apart.
  const scope = requirementScope(caller, null)
  const openRequirements = scope
    ? await prisma.requirement.count({ where: { ...scope, status: 'OPEN' } })
    : 0

  return NextResponse.json({
    data: {
      burn: {
        daily: Math.round(totalDailyBurn),
        weekly: Math.round(totalWeeklyBurn),
        monthly: Math.round(totalMonthlyBurn),
        toDate: totalBurnToDate,
        dailyCents: entries.reduce((n, e) => n + e.dailyCents, 0),
        toDateCents: entries.reduce((n, e) => n + e.toDateCents, 0),
      },
      benchSize: entries.length,
      benchSizeTotal: listings.length, // includes non-paid
      retained: {
        count: retained.length,
        dailyBurn: Math.round(retained.reduce((s, e) => s + e.dailyCost, 0)),
      },
      marketing: {
        count: marketing.length,
        dailyBurn: Math.round(marketing.reduce((s, e) => s + e.dailyCost, 0)),
      },
      openRequirements,
      entries: entries.map(e => ({
        personId: e.personId,
        personName: e.personName,
        headline: e.headline,
        skills: e.skills,
        tier: e.tier,
        payRate: e.payRate,
        dailyCost: Math.round(e.dailyCost),
        weeklyCost: Math.round(e.weeklyCost),
        monthlyCost: Math.round(e.monthlyCost),
        contractType: e.contractType,
        daysOnBench: e.daysOnBench,
        totalBurnToDate: e.totalBurnToDate,
        availableFrom: e.availableFrom,
        dailyCents: e.dailyCents,
        toDateCents: e.toDateCents,
        workingDays: e.workingDays,
        calendarDays: e.calendarDays,
        says: e.says,
      })),
    },
  })
}
