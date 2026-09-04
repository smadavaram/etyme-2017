import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, canReadCostAggregates, type FieldContext } from '@/lib/permissions'
import { prisma } from '@/lib/db'

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
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'consultants.read')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Requires consultants.read' } },
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
      { error: { code: 'FORBIDDEN', message: 'Requires cost visibility' } },
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
  const HOURS_PER_DAY = 8

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
  }

  const entries: BurnEntry[] = []

  for (const l of listings) {
    const candidacy = l.consultant.person.buyCandidacies[0]
    if (!candidacy) continue // no active buy contract = no cost

    const payRate = candidacy.payRate // cents per hour
    const dailyCost = (payRate * HOURS_PER_DAY) / 100 // dollars
    const weeklyCost = dailyCost * 5
    const monthlyCost = dailyCost * 22

    const daysOnBench = Math.max(0, Math.ceil(
      (now.getTime() - l.grantedAt.getTime()) / (1000 * 60 * 60 * 24)
    ))
    const workingDaysOnBench = Math.round(daysOnBench * 5 / 7) // approximate
    const totalBurnToDate = workingDaysOnBench * dailyCost

    entries.push({
      personId: l.consultant.personId,
      personName: l.consultant.person.name,
      headline: l.consultant.headline,
      skills: l.consultant.skills,
      tier: l.tier,
      payRate,
      dailyCost,
      weeklyCost,
      monthlyCost,
      contractType: candidacy.buyContract.contractType,
      daysOnBench,
      availableFrom: l.consultant.availableFrom?.toISOString() ?? null,
      totalBurnToDate: Math.round(totalBurnToDate),
    })
  }

  // Sort by daily cost descending (highest cost first)
  entries.sort((a, b) => b.dailyCost - a.dailyCost)

  // Aggregate by tier
  const retained = entries.filter(e => e.tier === 'RETAINED')
  const marketing = entries.filter(e => e.tier === 'MARKETING')

  const totalDailyBurn = entries.reduce((sum, e) => sum + e.dailyCost, 0)
  const totalWeeklyBurn = entries.reduce((sum, e) => sum + e.weeklyCost, 0)
  const totalMonthlyBurn = entries.reduce((sum, e) => sum + e.monthlyCost, 0)
  const totalBurnToDate = entries.reduce((sum, e) => sum + e.totalBurnToDate, 0)

  // Find open requirements for matching opportunity count
  const openRequirements = await prisma.requirement.count({
    where: {
      status: 'OPEN',
    },
  })

  return NextResponse.json({
    data: {
      burn: {
        daily: Math.round(totalDailyBurn),
        weekly: Math.round(totalWeeklyBurn),
        monthly: Math.round(totalMonthlyBurn),
        toDate: totalBurnToDate,
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
      })),
    },
  })
}
