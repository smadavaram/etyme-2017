import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail, getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { generateCycles } from '@/lib/cycle-generator'
import type { CycleDefinition } from '@/lib/cycle-generator'
import { getTemplatePack } from '@/lib/template-packs'
import { sellContractScope, buyContractScope } from '@/lib/resolve-client-company'
import { accountFilterFor } from '@/lib/account-walls'
import { andAll } from '@/lib/walls'

/**
 * POST /api/contracts
 *
 * Creates a SellContract (and optionally a linked BuyContract) with
 * generated cycles from the company's template pack.
 *
 * The old "assignment" was a single record. Now sell and buy are separate:
 *   SellContract — what the vendor bills the client
 *   BuyContract  — what the vendor pays for talent
 *   ContractLink — joins them for profitability tracking
 */
export async function POST(request: NextRequest) {
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const body = await request.json()
  const {
    // Sell side
    personId,
    companyId,
    clientCompanyId,
    endClientCompanyId,  // optional — the end client if different from paying customer
    workLocationId,      // optional — where the consultant physically works
    engagementId,
    msaId,
    billRate,
    billCurrency,
    startDate,
    endDate,
    // Buy side (optional — creates linked BuyContract)
    payRate,
    payCurrency,
    contractType,
    vendorCompanyId,
    entityId,
  } = body

  // Validation — sell contract required fields
  if (!personId) return errResponse('personId is required', 'personId')
  if (!companyId) return errResponse('companyId is required', 'companyId')
  if (!clientCompanyId) return errResponse('clientCompanyId is required', 'clientCompanyId')
  if (typeof billRate !== 'number' || billRate <= 0) return errResponse('billRate must be a positive number (cents/hr)', 'billRate')
  if (!startDate) return errResponse('startDate is required', 'startDate')

  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : null

  if (isNaN(start.getTime())) return errResponse('Invalid startDate', 'startDate')
  if (end && isNaN(end.getTime())) return errResponse('Invalid endDate', 'endDate')
  if (end && end <= start) return errResponse('endDate must be after startDate', 'endDate')

  // Verify company exists and get template pack
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, templatePack: true },
  })

  if (!company) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Company not found' } },
      { status: 404 }
    )
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Create the sell contract
      const sellContract = await tx.sellContract.create({
        data: {
          companyId,
          clientCompanyId,
          endClientCompanyId: endClientCompanyId ?? null,
          workLocationId: workLocationId ?? null,
          personId,
          engagementId: engagementId ?? null,
          msaId: msaId ?? null,
          billRate,
          billCurrency: billCurrency ?? 'USD',
          state: 'DRAFT',
          startDate: start,
          endDate: end,
        },
      })

      // Optionally create a linked buy contract
      let buyContract = null
      let contractLink = null

      if (payRate && typeof payRate === 'number' && payRate > 0) {
        // The agreement, with this person as its first candidate line.
        // More candidates can be added to the same agreement later.
        buyContract = await tx.buyContract.create({
          data: {
            companyId,
            vendorCompanyId: vendorCompanyId ?? null,
            entityId: entityId ?? null,
            payCurrency: payCurrency ?? 'USD',
            contractType: contractType ?? 'W2',
            state: 'DRAFT',
            startDate: start,
            endDate: end,
            candidates: {
              create: {
                personId,
                payRate,
                payCurrency: payCurrency ?? 'USD',
                startDate: start,
                endDate: end,
              },
            },
          },
        })

        // Link them for profitability tracking
        contractLink = await tx.contractLink.create({
          data: {
            sellContractId: sellContract.id,
            buyContractId: buyContract.id,
            effectiveFrom: start,
            effectiveTo: end,
          },
        })
      }

      // Generate sell-side cycles from template pack
      let sellCyclesCreated = 0
      if (company.templatePack && end) {
        const pack = getTemplatePack(company.templatePack)
        if (pack) {
          const definitions: CycleDefinition[] = pack.cycleDefinitions.map((cd) => ({
            kind: cd.kind as any,
            frequency: cd.frequency as any,
            offsetDays: 0,
          }))

          const generatedCycles = generateCycles(start, end, definitions)

          if (generatedCycles.length > 0) {
            await tx.cycle.createMany({
              data: generatedCycles.map((c) => ({
                sellContractId: sellContract.id,
                kind: c.kind,
                dueOn: c.dueOn,
              })),
            })
            sellCyclesCreated = generatedCycles.length
          }
        }
      }

      // If endDate is within 8 weeks, create RolloffEvent
      let rolloff = null
      if (end) {
        const eightWeeksOut = new Date(Date.now() + 8 * 7 * 24 * 60 * 60 * 1000)
        if (end <= eightWeeksOut && end > new Date()) {
          rolloff = await tx.rolloffEvent.create({
            data: {
              sellContractId: sellContract.id,
              endDate: end,
              notified: {},
              checklist: {
                knowledgeTransfer: false,
                finalTimesheet: false,
                accessRevocation: false,
                assets: false,
              },
            },
          })
        }
      }

      // AutomationLog
      await tx.automationLog.create({
        data: {
          companyId,
          action: 'CONTRACT_CREATED',
          summary: `Sell contract created for person ${personId}: $${billRate}/hr to client. ${buyContract ? `Buy contract linked at $${payRate}/hr.` : 'No buy contract linked.'} ${sellCyclesCreated} cycles generated.`,
          reason: 'Contract created via API',
          payload: {
            sellContractId: sellContract.id,
            buyContractId: buyContract?.id ?? null,
            contractLinkId: contractLink?.id ?? null,
            personId,
            billRate,
            payRate: payRate ?? null,
            contractType: contractType ?? null,
            sellCyclesCreated,
            hasRolloff: !!rolloff,
          },
          reversible: false,
        },
      })

      return { sellContract, buyContract, contractLink, sellCyclesCreated, rolloff }
    })

    return NextResponse.json({
      data: {
        sellContract: {
          id: result.sellContract.id,
          personId: result.sellContract.personId,
          state: result.sellContract.state,
          billRate: result.sellContract.billRate,
          startDate: result.sellContract.startDate.toISOString(),
          endDate: result.sellContract.endDate?.toISOString() ?? null,
        },
        buyContract: result.buyContract ? {
          id: result.buyContract.id,
          payRate,
          contractType: result.buyContract.contractType,
          state: result.buyContract.state,
        } : null,
        contractLink: result.contractLink ? { id: result.contractLink.id } : null,
        sellCyclesCreated: result.sellCyclesCreated,
        rolloff: result.rolloff ? { id: result.rolloff.id, endDate: result.rolloff.endDate.toISOString() } : null,
        message: `Contract created with ${result.sellCyclesCreated} cycles${result.rolloff ? ' and rolloff event' : ''}`,
      },
    }, { status: 201 })
  } catch (err: any) {
    console.error('Contract creation failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Contract creation failed' } },
      { status: 500 }
    )
  }
}

/**
 * GET /api/contracts?side=sell|buy
 *
 * Lists sell contracts (default) or buy contracts.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl
  const side = url.searchParams.get('side') ?? 'sell'
  const companyId = url.searchParams.get('companyId')
  const state = url.searchParams.get('state')
  const filterPersonId = url.searchParams.get('personId')
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))

  if (side === 'buy') {
    // Scoped to the caller's company — a missing ?companyId= used to mean
    // "every buy contract in the database".
    const scope = buyContractScope(caller)
    if (!scope) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'No company context' } },
        { status: 403 }
      )
    }

    const where: any = { ...scope }
    if (state) where.state = state.toUpperCase()
    // A person is on a buy contract through a candidate line
    if (filterPersonId) where.candidates = { some: { personId: filterPersonId } }

    const [contracts, total] = await Promise.all([
      prisma.buyContract.findMany({
        where,
        include: {
          candidates: {
            include: { person: { select: { id: true, name: true } } },
            orderBy: { startDate: 'asc' },
          },
          vendorCompany: { select: { id: true, name: true } },
          _count: { select: { buyCycles: true } },
        },
        orderBy: { startDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.buyContract.count({ where }),
    ])

    return NextResponse.json({
      data: {
        contracts: contracts.map((c) => {
          const rates = c.candidates.map((cd) => cd.payRate)
          const single = c.candidates.length === 1 ? c.candidates[0] : null
          return {
            id: c.id,
            side: 'buy' as const,
            // A one-person agreement keeps the familiar shape; a shared one
            // reports headcount and a rate range instead of pretending to a
            // single person or a single rate.
            person: single?.person ?? null,
            headcount: c.candidates.length,
            candidates: c.candidates.map((cd) => ({
              id: cd.id,
              person: cd.person,
              payRate: cd.payRate,
              payCurrency: cd.payCurrency,
              startDate: cd.startDate.toISOString(),
              endDate: cd.endDate?.toISOString() ?? null,
              state: cd.state,
            })),
            vendorCompany: c.vendorCompany,
            state: c.state,
            contractType: c.contractType,
            payRate: single?.payRate ?? null,
            payRateMin: rates.length > 0 ? Math.min(...rates) : null,
            payRateMax: rates.length > 0 ? Math.max(...rates) : null,
            payCurrency: c.payCurrency,
            startDate: c.startDate.toISOString(),
            endDate: c.endDate?.toISOString() ?? null,
            cycles: c._count.buyCycles,
          }
        }),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    })
  }

  // Default: sell contracts — scoped to whichever side of the placement
  // the caller sits on. A client sees contracts at their sites; a vendor
  // sees the ones they sell.
  const scope = sellContractScope(caller)
  if (!scope) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'No company context' } },
      { status: 403 }
    )
  }

  // Inside a firm that separates its accounts, somebody attached to one
  // sees that account and anything under it. Attached to none means the
  // whole firm, which is how a CFO keeps working after the wall goes up.
  // Which side of the contract this caller owns. A buyer's structure is
  // their departments; a supplier's is their accounts, and they are
  // different companies' org charts.
  const wall = await accountFilterFor(
    caller,
    caller.company?.kind === 'CLIENT' ? 'orgUnitId' : 'deliveryUnitId'
  )

  // AND, never a spread. Both fragments express themselves as OR, and
  // spreading one over the other keeps only the second — which is how a
  // walled manager briefly saw every contract on the platform.
  const where: any = andAll(scope, wall.where)
  if (state) where.state = state.toUpperCase()
  if (filterPersonId) where.personId = filterPersonId

  const [contracts, total] = await Promise.all([
    prisma.sellContract.findMany({
      where,
      include: {
        person: { select: { id: true, name: true } },
        clientCompany: { select: { id: true, name: true } },
        endClientCompany: { select: { id: true, name: true } },
        workLocation: { select: { id: true, name: true, city: true, state: true, isRemote: true } },
        engagement: { select: { id: true, title: true } },
        _count: { select: { timesheets: true, sellCycles: true } },
        rolloff: { select: { id: true, endDate: true, outcome: true } },
      },
      orderBy: { startDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.sellContract.count({ where }),
  ])

  return NextResponse.json({
    data: {
      contracts: contracts.map((c) => ({
        id: c.id,
        side: 'sell' as const,
        person: c.person,
        clientCompany: c.clientCompany,
        endClientCompany: c.endClientCompany,
        workLocation: c.workLocation,
        engagement: c.engagement ?? null,
        state: c.state,
        billRate: c.billRate,
        billCurrency: c.billCurrency,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate?.toISOString() ?? null,
        timesheets: c._count.timesheets,
        cycles: c._count.sellCycles,
        rolloff: c.rolloff ? { id: c.rolloff.id, endDate: c.rolloff.endDate.toISOString(), outcome: c.rolloff.outcome } : null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      // Said plainly when somebody is seeing less than the whole firm. A
      // total that silently excludes half the company is worse than a
      // smaller one somebody understands.
      scopedTo: wall.note,
    },
  })
}

function errResponse(message: string, field: string) {
  return NextResponse.json(
    { error: { code: 'VALIDATION', message, field } },
    { status: 422 }
  )
}
