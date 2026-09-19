import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { writeCyclesFor } from '@/lib/contract-cycles'
import { loadContractHolidays } from '@/lib/holidays'
import { evaluateGovernance } from '@/lib/governance'
import { orderCeiling } from '@/lib/award'
import { annualValue } from '@/lib/requisition-approval'
import { headerFor, lineTermsFrom } from '../../order-header'

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
      requirement: {
        select: {
          id: true, title: true, companyId: true,
          // What the order's ceiling is computed from — the same
          // figures the approval chain routed the requisition on.
          budgetCents: true, billMax: true, headcount: true,
          months: true, hoursPerWeek: true,
        },
      },
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

  // The two parties to the submission, and nobody else. This route
  // predates the award path and kept none of its checks: any signed-in
  // account could turn any placed submission into a contract, at a rate
  // of its choosing. The vendor who sent it and the company it was sent
  // to are the only two with any standing here.
  const party =
    caller.company?.id === submission.fromCompanyId || caller.company?.id === submission.toCompanyId
  if (!party) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_A_PARTY',
          message: `Only ${submission.fromCompany.name} or ${submission.toCompany.name} can record a contract from this submission.`,
        },
      },
      { status: 403 }
    )
  }

  if (submission.status !== 'PLACED') {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: `Submission status is ${submission.status}, must be PLACED to convert` } },
      { status: 409 }
    )
  }

  // Awarding already wrote the contract, on the requisition it answers.
  // Converting the same submission again is the same person placed
  // twice — two tenure legs, two invoices — which the award route refuses
  // and this one did not.
  const already = await prisma.sellContract.findFirst({
    where: { requirementId: submission.requirementId, personId: submission.personId },
    select: { id: true },
  })
  if (already) {
    return NextResponse.json(
      {
        error: {
          code: 'ALREADY_AWARDED',
          message: `${submission.person.name} already holds a contract on "${submission.requirement.title}".`,
          contractId: already.id,
        },
      },
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

  // ── The header this line goes on ──────────────────────────────────
  //
  // A purchase order is a header and its lines, and this route creates a
  // line. It is the older path to the same pair the award creates, and
  // until now it left the line on no document at all — so a placement
  // recorded this way had no ceiling to match an invoice against and no
  // order to carry the client's own timesheet terms.
  //
  // The ceiling is the requisition's own approved value, by the one rule
  // in `lib/award`, falling back to the rate being recorded where the
  // requisition states neither a budget nor a ceiling. Null means no
  // figure anybody can stand behind, and then no order is raised.
  const ceiling = orderCeiling({
    budgetCents: submission.requirement.budgetCents,
    billMaxCents: submission.requirement.billMax,
    headcount: submission.requirement.headcount,
    months: submission.requirement.months,
    hoursPerWeek: submission.requirement.hoursPerWeek,
    awardedRateCents: billRate,
    annualValue,
  })

  // Where the work happens, for the order's ship-to.
  const site = await prisma.companyLocation.findFirst({
    where: { companyId: submission.toCompanyId },
    orderBy: [{ isPrimary: 'desc' }],
    select: { id: true },
  })

  // The terms on the paper, where the two firms have an agreement. Read
  // rather than created: this route records a deal somebody already did.
  const agreement = await prisma.masterAgreement.findFirst({
    where: { vendorId: submission.fromCompanyId, clientId: submission.toCompanyId },
    select: { id: true, paymentTerms: true, currency: true },
  })
  const vendorCompany = await prisma.company.findUnique({
    where: { id: submission.fromCompanyId },
    select: { currency: true, defaultPaymentTerms: true },
  })
  const paymentTerms = agreement?.paymentTerms ?? vendorCompany?.defaultPaymentTerms ?? 30
  const currency = agreement?.currency ?? vendorCompany?.currency ?? 'USD'

  try {
    const result = await prisma.$transaction(async (tx) => {
      // One open order per buyer-and-seller pair, through the same door
      // the award uses — never a second implementation of the rule.
      const header = ceiling
        ? await headerFor(tx, {
            buyerId: submission.toCompanyId,
            sellerId: submission.fromCompanyId,
            recordedById: caller.company?.id ?? submission.toCompanyId,
            title: `Contingent staffing — ${submission.fromCompany.name}`,
            amountDollars: ceiling.dollars,
            currency,
            paymentTerms,
            msaId: msaId ?? agreement?.id ?? null,
            engagementId: engagementId ?? null,
            shipToId: site?.id ?? null,
            start, end,
          })
        : null

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
          // The line, on its header: four fields written from the
          // document so they cannot disagree on the day they are made.
          ...lineTermsFrom(header, paymentTerms),
          workOrderId: header?.id ?? null,
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
            // W2 on this path, and so no order: you do not raise a
            // purchase order to your own employee. A placement bought
            // from a sub-vendor comes through the award, which raises
            // the order to that sub.
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

      // The dates this pair owes, through the one door that knows them.
      //
      // This route used to split the pack and call the generator itself,
      // six lines copied from POST /api/contracts. That was survivable
      // until a company could choose which way its dates move off a
      // weekend or a holiday (`lib/cycle-shift`): the helper reads that
      // answer off the company holding the contract and this copy did
      // not, so a placement made by converting a submission was paid on
      // the shipped default while the identical placement made by an
      // award was paid on the day the company asked for. Nothing on any
      // screen would have said why the two differed.
      //
      // Whatever is added to the helper next — a final partial period, a
      // salary lag — now reaches this path without anybody remembering
      // it exists.
      let sellCyclesCreated = 0
      if (submission.fromCompany.templatePack && end) {
        // Both calendars, unioned. A pay day on the client's holiday is
        // as wrong as one on ours.
        const holidays = await loadContractHolidays(
          submission.fromCompanyId, sellContract.clientCompanyId, start.getFullYear(), end.getFullYear()
        )

        const written = await writeCyclesFor(tx, {
          sell: { id: sellContract.id, startDate: start, endDate: end },
          buy: buyContract
            ? {
                id: buyContract.id,
                contractType: buyContract.contractType,
                vendorCompanyId: buyContract.vendorCompanyId,
              }
            : null,
          packId: submission.fromCompany.templatePack,
          holidays,
        })
        sellCyclesCreated = written.sell
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
            // The document it went on, and the ceiling with the basis
            // it was computed from — never a bare figure.
            workOrderId: header?.id ?? null,
            orderNumber: header?.number ?? null,
            orderRaised: header?.raised ?? false,
            ceiling: ceiling ? { amount: ceiling.dollars, basis: ceiling.basis, says: ceiling.says } : null,
          },
          reversible: false,
        },
      })

      return { sellContract, buyContract, contractLink, sellCyclesCreated, header }
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
        // The document the line hangs on. Neutral in the payload;
        // `lib/order-naming` decides whether a reader is shown
        // "purchase order" or "sales order".
        order: result.header
          ? {
              id: result.header.id,
              number: result.header.number,
              raised: result.header.raised,
              ceiling: ceiling ? { amount: ceiling.dollars, currency, basis: ceiling.basis, because: ceiling.says } : null,
            }
          : null,
        message: `Placement converted to contract with ${result.sellCyclesCreated} cycles`,
      },
    }, { status: 201 })
  } catch (err: any) {
    reportError('Placement conversion failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Placement conversion failed' } },
      { status: 500 }
    )
  }
}
