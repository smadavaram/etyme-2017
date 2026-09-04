import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { generateCycles } from '@/lib/cycle-generator'
import type { CycleDefinition } from '@/lib/cycle-generator'
import { getTemplatePack } from '@/lib/template-packs'
import { evaluateGovernance } from '@/lib/governance'

/**
 * POST /api/submissions/:id/convert
 *
 * Converts a PLACED submission into a SellContract (and optionally a BuyContract).
 *
 * Body: {
 *   billRate: number,        // cents per hour (required)
 *   payRate?: number,        // cents per hour — creates BuyContract + ContractLink
 *   startDate: string,       // ISO date
 *   endDate?: string,        // ISO date
 *   engagementId?: string,
 *   msaId?: string,
 *   endClientCompanyId?: string,
 *   workLocationId?: string,
 * }
 *
 * CLAUDE.md invariant: writes AutomationLog with plain-English reason and honest reversible flag.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json()
  const {
    billRate,
    payRate,
    startDate,
    endDate,
    engagementId,
    msaId,
    endClientCompanyId,
    workLocationId,
  } = body

  // Validate required fields
  if (typeof billRate !== 'number' || billRate <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'billRate must be a positive number (cents/hr)', field: 'billRate' } },
      { status: 422 }
    )
  }

  if (!startDate) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'startDate is required', field: 'startDate' } },
      { status: 422 }
    )
  }

  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : null

  if (isNaN(start.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Invalid startDate', field: 'startDate' } },
      { status: 422 }
    )
  }

  if (end && isNaN(end.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Invalid endDate', field: 'endDate' } },
      { status: 422 }
    )
  }

  if (end && end <= start) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'endDate must be after startDate', field: 'endDate' } },
      { status: 422 }
    )
  }

  // Load submission with related data
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, name: true } },
      requirement: { select: { id: true, title: true, companyId: true } },
      fromCompany: { select: { id: true, name: true, templatePack: true } },
      toCompany: { select: { id: true, name: true } },
    },
  })

  if (!submission) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Submission not found' } },
      { status: 404 }
    )
  }

  if (submission.status !== 'PLACED') {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: `Submission status is ${submission.status}, must be PLACED to convert` } },
      { status: 409 }
    )
  }

  // ── Governance check before creating contract ──
  const resolvedEndClient = endClientCompanyId ?? submission.toCompanyId
  const governance = await evaluateGovernance({
    personId: submission.personId,
    endClientCompanyId: resolvedEndClient,
    vendorCompanyId: submission.fromCompanyId,
    triggerPoint: 'CONTRACT_START',
    subjectType: 'SELL_CONTRACT',
    subjectId: id, // submission ID as proxy until contract is created
    billRate,
  })

  if (!governance.canProceed) {
    return NextResponse.json(
      {
        error: {
          code: 'GOVERNANCE_BLOCK',
          message: governance.summary,
          evaluations: governance.evaluations,
        },
      },
      { status: 403 }
    )
  }

  // Warnings are allowed to proceed — contract starts in DRAFT,
  // governance will be re-checked on activation

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Create SellContract: vendor (fromCompany) sells to client (toCompany)
      const sellContract = await tx.sellContract.create({
        data: {
          companyId: submission.fromCompanyId,
          clientCompanyId: submission.toCompanyId,
          endClientCompanyId: endClientCompanyId ?? null,
          workLocationId: workLocationId ?? null,
          personId: submission.personId,
          engagementId: engagementId ?? null,
          msaId: msaId ?? null,
          billRate,
          state: 'DRAFT',
          startDate: start,
          endDate: end,
        },
      })

      // Optionally create BuyContract + ContractLink
      let buyContract = null
      let contractLink = null

      if (payRate && typeof payRate === 'number' && payRate > 0) {
        buyContract = await tx.buyContract.create({
          data: {
            companyId: submission.fromCompanyId,
            contractType: 'W2',
            state: 'DRAFT',
            startDate: start,
            endDate: end,
            candidates: {
              create: {
                personId: submission.personId,
                payRate,
                startDate: start,
                endDate: end,
              },
            },
          },
        })

        contractLink = await tx.contractLink.create({
          data: {
            sellContractId: sellContract.id,
            buyContractId: buyContract.id,
            effectiveFrom: start,
            effectiveTo: end,
          },
        })
      }

      // Generate sell-side cycles from template pack (same pattern as POST /api/contracts)
      let sellCyclesCreated = 0
      if (submission.fromCompany.templatePack && end) {
        const pack = getTemplatePack(submission.fromCompany.templatePack)
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

      // AutomationLog — CLAUDE.md: plain-English reason and honest reversible flag
      await tx.automationLog.create({
        data: {
          companyId: submission.fromCompanyId,
          action: 'PLACEMENT_CONVERTED',
          summary: `${submission.person.name}'s placement for "${submission.requirement.title}" converted to sell contract at $${(billRate / 100).toFixed(2)}/hr.${buyContract ? ` Buy contract linked at $${(payRate / 100).toFixed(2)}/hr.` : ''} ${sellCyclesCreated} cycles generated.`,
          reason: `Submission ${id} placed and converted to contract by ${caller.person.name}`,
          payload: {
            submissionId: id,
            sellContractId: sellContract.id,
            buyContractId: buyContract?.id ?? null,
            contractLinkId: contractLink?.id ?? null,
            personId: submission.personId,
            requirementId: submission.requirementId,
            billRate,
            payRate: payRate ?? null,
            sellCyclesCreated,
          },
          reversible: false,
        },
      })

      return { sellContract, buyContract, contractLink, sellCyclesCreated }
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
        message: `Placement converted to contract with ${result.sellCyclesCreated} cycles`,
      },
    }, { status: 201 })
  } catch (err: any) {
    console.error('Placement conversion failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Placement conversion failed' } },
      { status: 500 }
    )
  }
}
