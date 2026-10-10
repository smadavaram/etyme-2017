import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, canReadCostAggregates, askTheDesk, type FieldContext } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { payTrail, PAY_WITHHELD_SAYS } from '@/lib/money/pay-visibility'
import { writePayTrail } from '@/lib/money/pay-trail'
import { progressionFigures } from '@/lib/consultant-portfolio'

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
 * Who reads which figure (2026-09-30). Pay goes to the desks that run
 * pay and to the person it pays (`progressionFigures`, through the one
 * pay rule in lib/money/pay-visibility); the bill rate and the margin go
 * to the price desk (`margin.read`) and never ride along with pay — this
 * route used to hand AP & Payroll both because it held consultants.cost.
 * A withheld pay figure leaves the point on the timeline, blank, with a
 * sentence naming the desks that read pay, and goes on the trail as a
 * refusal; a figure shown to somebody else goes on it as a read.
 *
 * A person reading their own progression reads the leg that pays them —
 * `supplierSellContractId: null`, the line with no firm below it —
 * never a line between two firms above them in a chain, which is a
 * price between those firms and not their pay.
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
  const viewer = { permissions: caller.permissions, personId: caller.person.id }
  const may = progressionFigures(viewer, consultant.personId)
  // Whether to look up the sell lines at all: for the client's name
  // beside a point (the desks that ran it before), and the bill rate
  // where the price desk reads it.
  const loadSell = canReadCostAggregates(fieldCtx) || may.bill
  const canReadConsultants = hasPermission(caller.permissions, 'consultants.read')

  if (!isSelf && !canReadConsultants) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Reading a consultant\u2019s rate history',
            needs: 'consultants.read',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company?.id
  // Somebody else's history is read at the reader's own firm only. With
  // no firm on the seat there is nothing to scope it to, so nothing is read.
  if (!isSelf && !companyId) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Somebody else\u2019s rate history is read from a firm\u2019s seat, and this seat has none.' } },
      { status: 403 }
    )
  }

  // Load this person's candidate lines — the pay rate and dates are theirs,
  // not the agreement's, because one buy contract can cover several people.
  const candidacies = await prisma.buyContractCandidate.findMany({
    where: {
      personId: consultant.personId,
      buyContract: {
        // Somebody else's: the lines at the reader's firm. Their own: the
        // leg that pays them, never a price between two firms above them.
        ...(isSelf ? { supplierSellContractId: null } : { companyId }),
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

  if (loadSell && companyId) {
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

    if (loadSell) {
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
    const payRate = may.pay ? bc.payRate : null
    const margin = may.margin && billRate != null && payRate != null ? billRate - payRate : null
    const marginPercent = may.margin && billRate != null && payRate != null && billRate > 0
      ? Math.round(((billRate - payRate) / billRate) * 100)
      : null

    progression.push({
      date: bc.startDate.toISOString().slice(0, 10),
      payRate,
      billRate: may.bill ? billRate : null,
      margin,
      marginPercent,
      contractType: bc.contractType,
      state: bc.state,
      client: matchedSell?.clientCompany?.name ?? null,
      vendor: bc.vendorCompany?.name ?? bc.company.name,
      currency: bc.payCurrency,
    })
  }

  // On the trail: the person once, as a refusal where their pay was
  // withheld and as a read where somebody else was shown it. Nothing is
  // written for a person reading their own, or for an empty history.
  await writePayTrail(
    caller,
    payTrail(viewer, candidacies.map((c) => ({ personId: consultant.personId, payRate: c.payRate }))),
    'a rate history'
  )

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
      // Said where the pay on these points was withheld, so a blank reads
      // as a rule rather than a missing number.
      payWithheldSays: !may.pay && progression.length > 0 ? PAY_WITHHELD_SAYS : null,
      summary: {
        totalPlacements: progression.length,
        firstRate: may.pay ? firstRate : null,
        currentRate: may.pay ? currentRate : null,
        rateGrowth: may.pay ? rateGrowth : null,
        currency: progression[0]?.currency ?? 'USD',
      },
    },
  })
}
