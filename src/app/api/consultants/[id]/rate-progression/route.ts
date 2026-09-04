import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, canReadCostAggregates, type FieldContext } from '@/lib/permissions'
import { prisma } from '@/lib/db'

/**
 * GET /api/consultants/:id/rate-progression
 *
 * Addendum D §D.3.3: "Rate progression — the consultant's own pay rate
 * across assignments over time, visible to them without exposing bill
 * rate or margin."
 *
 * Returns a timeline of pay rates across all contracts for a consultant.
 * Two views:
 *   - Consultant self-view: sees their own pay rates only
 *   - Vendor admin with cost permission: sees pay rates + bill rates + margin
 *
 * The progression tells the story: "Your rate went from $35/hr to $42/hr
 * to $48/hr across three placements over two years." This is the trust
 * signal that replaces disclosure.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const consultantId = params.id

  // Load consultant to verify access
  const consultant = await prisma.consultantProfile.findUnique({
    where: { id: consultantId },
    include: {
      person: { select: { id: true, name: true, primaryEmail: true } },
    },
  })

  if (!consultant) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Consultant not found' } },
      { status: 404 }
    )
  }

  // Determine access level
  const isSelf = caller.person.id === consultant.personId
  const fieldCtx: FieldContext = {
    permissions: caller.permissions,
    isSubject: isSelf,
  }
  const canSeeCost = canReadCostAggregates(fieldCtx)
  const canReadConsultants = hasPermission(caller.permissions, 'consultants.read')

  if (!isSelf && !canReadConsultants) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Cannot view this consultant' } },
      { status: 403 }
    )
  }

  const companyId = caller.company?.id

  // Load this person's candidate lines — the pay rate and dates are theirs,
  // not the agreement's, because one buy contract can cover several people.
  const candidacies = await prisma.buyContractCandidate.findMany({
    where: {
      personId: consultant.personId,
      buyContract: {
        ...(companyId && !isSelf ? { companyId } : {}),
        state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED'] },
      },
    },
    select: {
      id: true,
      payRate: true,
      payCurrency: true,
      startDate: true,
      endDate: true,
      buyContract: {
        select: {
          contractType: true,
          state: true,
          companyId: true,
          company: { select: { name: true } },
          vendorCompany: { select: { name: true } },
        },
      },
    },
    orderBy: { startDate: 'asc' },
  })

  // Flattened to the shape the progression builder below expects
  const buyContracts = candidacies.map((c) => ({
    id: c.id,
    payRate: c.payRate,
    payCurrency: c.payCurrency,
    contractType: c.buyContract.contractType,
    state: c.buyContract.state,
    startDate: c.startDate,
    endDate: c.endDate,
    companyId: c.buyContract.companyId,
    company: c.buyContract.company,
    vendorCompany: c.buyContract.vendorCompany,
  }))

  // Load sell contracts (bill rates) — only visible to vendor admins with cost permission
  let sellContracts: Array<{
    id: string
    billRate: number
    billCurrency: string
    state: string
    startDate: Date
    endDate: Date | null
    personId: string
    clientCompany: { name: string } | null
  }> = []

  if (canSeeCost && companyId) {
    sellContracts = await prisma.sellContract.findMany({
      where: {
        personId: consultant.personId,
        companyId,
        state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED'] },
      },
      select: {
        id: true,
        billRate: true,
        billCurrency: true,
        state: true,
        startDate: true,
        endDate: true,
        personId: true,
        clientCompany: { select: { name: true } },
      },
      orderBy: { startDate: 'asc' },
    })
  }

  // Build the progression timeline
  interface ProgressionPoint {
    date: string
    payRate: number | null
    billRate: number | null
    margin: number | null // bill - pay, in cents
    marginPercent: number | null
    contractType: string
    state: string
    client: string | null
    vendor: string | null
    currency: string
  }

  const progression: ProgressionPoint[] = []

  // Match buy and sell contracts by overlapping dates
  for (const bc of buyContracts) {
    let matchedSell: (typeof sellContracts)[0] | undefined

    if (canSeeCost) {
      // Find the sell contract that overlaps with this buy contract
      matchedSell = sellContracts.find((sc) => {
        const scEnd = sc.endDate?.getTime() ?? Infinity
        const bcEnd = bc.endDate?.getTime() ?? Infinity
        return (
          sc.startDate.getTime() <= (bc.endDate?.getTime() ?? Infinity) &&
          scEnd >= bc.startDate.getTime()
        )
      })
    }

    const billRate = matchedSell?.billRate ?? null
    const payRate = isSelf || canSeeCost ? bc.payRate : null
    const margin = billRate != null && payRate != null ? billRate - payRate : null
    const marginPercent = billRate != null && payRate != null && billRate > 0
      ? Math.round(((billRate - payRate) / billRate) * 100)
      : null

    progression.push({
      date: bc.startDate.toISOString().slice(0, 10),
      payRate: isSelf || canSeeCost ? bc.payRate : null,
      billRate: canSeeCost ? billRate : null,
      margin: canSeeCost ? margin : null,
      marginPercent: canSeeCost ? marginPercent : null,
      contractType: bc.contractType,
      state: bc.state,
      client: matchedSell?.clientCompany?.name ?? null,
      vendor: bc.vendorCompany?.name ?? bc.company.name,
      currency: bc.payCurrency,
    })
  }

  // Calculate summary statistics
  const payRates = progression.map((p) => p.payRate).filter((r): r is number => r != null)
  const firstRate = payRates.length > 0 ? payRates[0] : null
  const currentRate = payRates.length > 0 ? payRates[payRates.length - 1] : null
  const rateGrowth = firstRate != null && currentRate != null && firstRate > 0
    ? Math.round(((currentRate - firstRate) / firstRate) * 100)
    : null

  return NextResponse.json({
    data: {
      consultant: {
        id: consultant.id,
        name: consultant.person.name,
      },
      progression,
      summary: {
        totalPlacements: progression.length,
        firstRate: isSelf || canSeeCost ? firstRate : null,
        currentRate: isSelf || canSeeCost ? currentRate : null,
        rateGrowth: isSelf || canSeeCost ? rateGrowth : null,
        currency: progression[0]?.currency ?? 'USD',
      },
    },
  })
}
