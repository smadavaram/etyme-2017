import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { maySeeOutside } from '@/lib/walls'

/**
 * GET /api/vendors/:id/trust-signals
 *
 * Addendum D §D.3.3: "Where a vendor does not disclose markup, trust
 * is carried by mechanisms that cost the vendor nothing commercially:
 *   - Rate progression — visible without exposing bill rate or margin
 *   - Bench pay honoured — recorded instances of paid bench
 *   - Median tenure of consultants at the vendor
 *   - Time-to-next-placement after rolloff
 *   - Verified record issuance"
 *
 * These signals replace disclosure. A vendor with high tenure, consistent
 * bench pay, and fast re-placement earns trust without showing margin.
 *
 * This endpoint computes aggregate trust signals for a vendor company.
 * It's used on the vendor profile visible to consultants and clients.
 *
 * All figures are aggregates — no individual rate or contract data is exposed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const vendorId = params.id

  // Verify the vendor company exists
  const vendor = await prisma.company.findUnique({
    where: { id: vendorId },
    select: { id: true, name: true, kind: true },
  })

  if (!vendor) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Company not found' } },
      { status: 404 }
    )
  }

  // ── Who may look up a vendor's record ────────────────────────────────
  //
  // These signals exist to be seen — that is the whole argument of
  // Addendum D: a vendor who will not show markup shows tenure instead.
  // Hiding them would defeat the mechanism.
  //
  // But two things are true at once. Reputation is public; inventory is
  // not. A rival reading "8 consultants on bench" learns the size of the
  // book they are bidding against, which is not reputation, it is a
  // stock count. So the record shows and the bench count is withheld
  // unless the caller is the vendor or has actually dealt with them.
  //
  // And a firm that has shut its outside access has shut it for this too.
  // An engineer at a delivery firm browsing supplier records is the exact
  // thing that setting exists to stop.
  const own = caller.company?.id === vendorId

  if (!own && caller.company) {
    const outside = maySeeOutside({
      posture: caller.company.outsideAccess,
      permissions: caller.permissions,
    })
    if (!outside.ok) {
      return NextResponse.json(
        { error: { code: 'OUTSIDE_WALL', message: outside.reason } },
        { status: 403 }
      )
    }
  }

  const dealings =
    own ||
    (caller.company
      ? (await prisma.submission.count({
          where: {
            OR: [
              { fromCompanyId: vendorId, toCompanyId: caller.company.id },
              { fromCompanyId: caller.company.id, toCompanyId: vendorId },
            ],
          },
        })) > 0
      : false)

  const now = new Date()

  // ── 1. Median tenure ─────────────────────────────────
  // How long do consultants stay with this vendor?
  // Measured from BuyContract start to end (or now if still active)

  const allBuyContracts = await prisma.buyContract.findMany({
    where: {
      companyId: vendorId,
      state: { in: ['IN_PROGRESS', 'ENDED'] },
    },
    select: { startDate: true, endDate: true, state: true },
  })

  const tenureDays = allBuyContracts.map((c) => {
    const end = c.endDate ?? now
    return Math.max(0, Math.ceil(
      (end.getTime() - c.startDate.getTime()) / (1000 * 60 * 60 * 24)
    ))
  })

  tenureDays.sort((a, b) => a - b)
  const medianTenureDays = tenureDays.length > 0
    ? tenureDays[Math.floor(tenureDays.length / 2)]
    : null
  const medianTenureMonths = medianTenureDays != null
    ? Math.round(medianTenureDays / 30.44)
    : null

  // ── 2. Bench pay honoured ─────────────────────────────
  // Count of bench-paid contracts (state = BENCH_PAID)
  // This is the "put your money where your mouth is" signal

  const benchPaidCount = await prisma.buyContract.count({
    where: {
      companyId: vendorId,
      state: 'BENCH_PAID',
    },
  })

  const totalContractCount = allBuyContracts.length
  const benchPayRate = totalContractCount > 0
    ? Math.round((benchPaidCount / totalContractCount) * 100)
    : null

  // ── 3. Time-to-next-placement ─────────────────────────
  // For ended contracts, how long until the person got a new placement?
  // Lower = better — the vendor re-places people quickly

  // Re-placement is a fact about a PERSON, so it reads the candidate lines
  // rather than the agreements — one agreement can end for one person while
  // continuing for everyone else on it.
  const endedContracts = await prisma.buyContractCandidate.findMany({
    where: {
      buyContract: { companyId: vendorId },
      endDate: { not: null, lte: new Date() },
    },
    select: { personId: true, endDate: true },
    orderBy: { endDate: 'asc' },
  })

  const replacementGaps: number[] = []

  for (const ended of endedContracts) {
    if (!ended.endDate) continue

    // Find this person's next placement at the same vendor
    const nextContract = await prisma.buyContractCandidate.findFirst({
      where: {
        buyContract: {
          companyId: vendorId,
          state: { in: ['IN_PROGRESS', 'ENDED'] },
        },
        personId: ended.personId,
        startDate: { gt: ended.endDate },
      },
      select: { startDate: true },
      orderBy: { startDate: 'asc' },
    })

    if (nextContract) {
      const gapDays = Math.ceil(
        (nextContract.startDate.getTime() - ended.endDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      replacementGaps.push(gapDays)
    }
  }

  replacementGaps.sort((a, b) => a - b)
  const medianGapDays = replacementGaps.length > 0
    ? replacementGaps[Math.floor(replacementGaps.length / 2)]
    : null

  // ── 4. Rate progression indicator ─────────────────────
  // Average rate growth across all consultants (percentage)
  // Positive = vendor raises pay over time, negative = vendor reduces

  const rateHistories = await prisma.rateHistory.findMany({
    where: {
      contractType: 'BUY',
      contractId: {
        in: allBuyContracts.length > 0
          ? (await prisma.buyContract.findMany({
              where: { companyId: vendorId },
              select: { id: true },
            })).map((c) => c.id)
          : [],
      },
    },
    select: { rate: true, previousRate: true },
  })

  const rateChanges = rateHistories
    .filter((h) => h.previousRate != null && h.previousRate > 0)
    .map((h) => ((h.rate - h.previousRate!) / h.previousRate!) * 100)

  const avgRateGrowth = rateChanges.length > 0
    ? Math.round(rateChanges.reduce((s, r) => s + r, 0) / rateChanges.length)
    : null

  // ── 5. Active bench size ──────────────────────────────
  // How many consultants are currently on bench?

  const activeBenchCount = await prisma.benchListing.count({
    where: {
      companyId: vendorId,
      revokedAt: null,
    },
  })

  // ── 6. Disclosure rate (optional badge) ───────────────
  // D.3.3: "Disclosure rate may be surfaced as an optional vendor badge."
  // Percentage of requirements where rateVisible = true

  const requirementStats = await prisma.requirement.groupBy({
    by: ['rateVisible'],
    where: { companyId: vendorId },
    _count: true,
  })

  const totalReqs = requirementStats.reduce((s, r) => s + r._count, 0)
  const visibleReqs = requirementStats
    .filter((r) => r.rateVisible)
    .reduce((s, r) => s + r._count, 0)
  const disclosureRate = totalReqs > 0 ? Math.round((visibleReqs / totalReqs) * 100) : null

  return NextResponse.json({
    data: {
      vendor: { id: vendor.id, name: vendor.name },
      trustSignals: {
        medianTenure: {
          months: medianTenureMonths,
          days: medianTenureDays,
          sampleSize: tenureDays.length,
          label: medianTenureMonths != null
            ? `${medianTenureMonths} month${medianTenureMonths !== 1 ? 's' : ''} median tenure`
            : 'No placement data',
        },
        benchPayHonoured: {
          count: benchPaidCount,
          rate: benchPayRate,
          label: benchPayRate != null
            ? `Bench pay honoured in ${benchPayRate}% of engagements`
            : 'No engagement data',
        },
        timeToNextPlacement: {
          medianDays: medianGapDays,
          sampleSize: replacementGaps.length,
          label: medianGapDays != null
            ? `${medianGapDays} day${medianGapDays !== 1 ? 's' : ''} median re-placement time`
            : 'No re-placement data',
        },
        rateProgression: {
          avgGrowthPercent: avgRateGrowth,
          changeCount: rateChanges.length,
          label: avgRateGrowth != null
            ? `${avgRateGrowth > 0 ? '+' : ''}${avgRateGrowth}% avg rate growth`
            : 'No rate history',
        },
        // Inventory, not reputation. Shown to the vendor and to anybody
        // they have actually traded with; withheld from a stranger.
        activeBench: dealings
          ? {
              count: activeBenchCount,
              label: `${activeBenchCount} consultant${activeBenchCount !== 1 ? 's' : ''} on bench`,
            }
          : {
              count: null,
              label: 'Bench size shown once you have worked together',
            },
        disclosureRate: {
          percent: disclosureRate,
          label: disclosureRate != null
            ? `${disclosureRate}% rate-visible requirements`
            : null,
        },
      },
    },
  })
}
