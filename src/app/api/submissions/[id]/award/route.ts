import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { clientOf, releaseAllAt } from '@/lib/holds'
import { emit } from '@/lib/events'
import { resolveBillingTerms } from '@/lib/billing-cascade'
import { evaluateGovernance } from '@/lib/governance'
import { assessAward, type AwardFacts } from '@/lib/award'
import { notify } from '@/lib/notify'
import {
  checkClassification, checkCover, insuranceRestsWith, type WorkerType,
} from '@/lib/worker-classification'

/**
 * POST /api/submissions/:id/award   { rate?, startDate?, endDate? }
 *
 * Give a candidate one of the positions on a requisition.
 *
 * This is the enforcement point of the demand side. Everything before it is
 * reversible — a requisition can be withdrawn, an invitation expired, a
 * submission ignored, and nobody is worse off. From here a person starts at
 * a client, tenure begins accruing against the cap, co-employment exposure
 * starts and budget is committed. None of that is undone by deleting a row,
 * which is why Addendum E's BLOCK rules are evaluated here and are not
 * anybody's to wave through.
 *
 * Three things the old convert path did not do:
 *
 *   Counts seats. A requisition is N positions; this consumes one and
 *   refuses the N+1th.
 *
 *   Carries the coding onto the contract — cost centre, purchase order,
 *   hiring manager, org unit, end client. Without that the invoice raised
 *   months later has no PO to match against, which is a failure nobody
 *   traces back to the day of the award.
 *
 *   Closes the requisition when the last seat goes, and stands the other
 *   vendors down. Leaving it open costs suppliers real sourcing effort on a
 *   role that no longer exists.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      person: {
        select: {
          id: true, name: true,
          consultant: {
            select: {
              ownCompanyId: true,
              ownCompany: { select: { id: true, name: true } },
            },
          },
        },
      },
      fromCompany: { select: { id: true, name: true } },
      requirement: {
        include: {
          costCenter: { select: { id: true, code: true } },
          raisedBy: { select: { id: true, name: true } },
        },
      },
    },
  })

  if (!submission) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Submission not found' } },
      { status: 404 }
    )
  }

  const req = submission.requirement
  // The buyer awards. A vendor cannot place its own candidate.
  if (caller.company?.id !== req.companyId && caller.company?.id !== submission.toCompanyId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Only the company that raised this requisition can award it' } },
      { status: 403 }
    )
  }

  // Idempotency — awarding twice must not place the person twice.
  const existing = await prisma.sellContract.findFirst({
    where: { requirementId: req.id, personId: submission.personId },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json(
      {
        error: {
          code: 'ALREADY_AWARDED',
          message: `${submission.person.name} already holds a position on this requisition`,
          contractId: existing.id,
        },
      },
      { status: 409 }
    )
  }

  const awardedRate: number = Number.isFinite(body.rate) ? body.rate : submission.rate

  // Seats already taken by live placements against this requisition.
  const alreadyAwarded = await prisma.sellContract.count({
    where: { requirementId: req.id, state: { notIn: ['CANCELLED'] } },
  })

  // The band this vendor was actually given, for the rate note.
  const invitation = await prisma.requirementInvitation.findUnique({
    where: { requirementId_toCompanyId: { requirementId: req.id, toCompanyId: submission.fromCompanyId } },
    select: { payMin: true, payMax: true },
  })

  const endClientId = req.companyId

  // Addendum E's legally grounded gates, delegated to the existing engine.
  const governance = await evaluateGovernance({
    personId: submission.personId,
    endClientCompanyId: endClientId,
    vendorCompanyId: submission.fromCompanyId,
    triggerPoint: 'CONTRACT_START',
    subjectType: 'PERSON',
    subjectId: submission.personId,
    billRate: awardedRate,
    requirementId: req.id,
  })

  const facts: AwardFacts = {
    headcount: req.headcount,
    alreadyAwarded,
    personAlreadyAwarded: false, // handled above, by the database
    personName: submission.person.name,
    requisitionApprovalState: req.approvalState,
    requisitionStatus: req.status,
    awardedRateCents: awardedRate,
    vendorBand: invitation ? { payMin: invitation.payMin, payMax: invitation.payMax } : null,
    ceilingCents: req.billMax,
    governance: {
      blocks: governance.evaluations.filter(e => e.outcome === 'BLOCK').map(e => e.reason),
      warnings: governance.evaluations.filter(e => e.outcome === 'WARN').map(e => e.reason),
    },
  }

  // Which ways of engaging somebody this client accepts. Stored on the
  // governance rule so it is the client's own policy, not ours.
  const classRule = await prisma.governanceRule.findFirst({
    where: {
      ruleType: 'WORKER_CLASSIFICATION',
      isActive: true,
      policy: { companyId: req.companyId, isActive: true },
    },
    select: { parameters: true },
  })
  const allowedTypes = ((classRule?.parameters as any)?.allowed ?? []) as WorkerType[]
  const classification = checkClassification(
    (submission.contractType as WorkerType | null) ?? null,
    allowedTypes
  )

  // A refused way of working is a legal position the client has taken, so
  // it joins the blocks rather than the notes.
  if (classification.outcome === 'BLOCK') {
    facts.governance.blocks.push(
      `${classification.reason}. ${classification.action ?? ''}`.trim()
    )
  } else if (classification.outcome === 'WARN') {
    facts.governance.warnings.push(classification.reason)
  }

  // Whose insurance answers for this person, and is it current?
  //
  // On corp-to-corp the cover belongs to the consultant's own company, not
  // the staffing vendor. The existing INSURANCE_REQUIRED rule checks the
  // vendor every time, which on a C2C placement is the wrong company —
  // that is the gap this closes.
  const workerType = (submission.contractType as WorkerType | null) ?? null
  const responsible = insuranceRestsWith(workerType ?? 'W2')
  const coverCompanyId = responsible === 'CONSULTANT_ENTITY'
    ? submission.person.consultant?.ownCompanyId ?? null
    : submission.fromCompanyId

  const certificates = coverCompanyId
    ? await prisma.verification.findMany({
        where: {
          companyId: coverCompanyId,
          type: { in: ['INSURANCE_GL', 'INSURANCE_WC'] },
        },
        select: { type: true, expiresAt: true, status: true },
      })
    : []

  const cover = checkCover(workerType, {
    certificates,
    consultantCorpName: submission.person.consultant?.ownCompany?.name ?? null,
    corpMissing: responsible === 'CONSULTANT_ENTITY' && !coverCompanyId,
  }, new Date())

  if (cover.outcome === 'BLOCK') {
    facts.governance.blocks.push(cover.reason)
  } else if (cover.outcome === 'WARN') {
    facts.governance.warnings.push(cover.reason)
  }

  const decision = assessAward(facts)

  if (decision.decision === 'BLOCKED') {
    // Refusals are recorded too. A placement that was stopped is a fact the
    // client will be asked about later.
    await prisma.automationLog.create({
      data: {
        companyId: req.companyId,
        action: 'AWARD_BLOCKED',
        summary: `${submission.person.name} could not be placed on ${req.title}`,
        reason: decision.summary,
        payload: { submissionId: id, requirementId: req.id, checks: decision.checks as any },
        reversible: false,
      },
    })
    return NextResponse.json(
      {
        error: {
          code: 'AWARD_BLOCKED',
          message: decision.summary,
          checks: decision.checks.filter(c => c.outcome === 'BLOCK'),
        },
      },
      { status: 409 }
    )
  }

  const start = body.startDate ? new Date(body.startDate) : (req.neededBy ?? new Date())
  const end = body.endDate
    ? new Date(body.endDate)
    : req.months
      ? new Date(new Date(start).setMonth(start.getMonth() + req.months))
      : null

  // Payment terms and currency, resolved down the cascade rather than
  // defaulted. The schema said terms "cascade from the MSA, overridable"
  // and nothing read the agreement — so every contract got net 30 and a
  // client whose signed agreement said net 60 was invoiced on net 30
  // forever. src/lib/billing-cascade.ts
  const [vendorCompany, agreement] = await Promise.all([
    prisma.company.findUnique({
      where: { id: submission.fromCompanyId },
      select: { name: true, currency: true, defaultPaymentTerms: true },
    }),
    prisma.masterAgreement.findFirst({
      where: { vendorId: submission.fromCompanyId, clientId: submission.toCompanyId },
      select: { id: true, paymentTerms: true, currency: true, client: { select: { name: true } } },
    }),
  ])

  // Who gets the invoice.
  //
  // The company they submitted to — not the company that wrote the role
  // down. On a client requisition those are the same. On a vendor's own
  // record of somebody else's advert they are not, and using the second
  // produced a contract where Cloudepa sold to Cloudepa: no counterparty,
  // no approver, nothing to bill.
  const payerId = submission.toCompanyId

  if (payerId === submission.fromCompanyId) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_COUNTERPARTY',
          message:
            'This was submitted to your own company, so there is nobody to bill. Send it on to the client first, or record the role against the company paying for it.',
        },
      },
      { status: 409 }
    )
  }

  const terms = resolveBillingTerms({
    company: {
      name: vendorCompany?.name ?? 'your company',
      paymentTermsDays: vendorCompany?.defaultPaymentTerms ?? null,
      currency: vendorCompany?.currency ?? null,
    },
    agreement: agreement
      ? {
          paymentTermsDays: agreement.paymentTerms,
          currency: agreement.currency,
          counterpartyName: agreement.client.name,
        }
      : null,
    contract: null,
  })

  // ── Something to bill under ──
  //
  // An invoice is raised per engagement, and an engagement hangs off an
  // agreement. An award created neither, so work done through the platform
  // could never be invoiced — the money chain simply stopped.
  //
  // Paper often lags the start date in this business. Recording the
  // relationship that plainly exists, and marking it unsigned, is honest;
  // refusing the placement until somebody uploads a contract is not how
  // anybody actually works.
  const msa =
    agreement ??
    (await prisma.masterAgreement.create({
      data: {
        vendorId: submission.fromCompanyId,
        clientId: payerId,
        paymentTerms: vendorCompany?.defaultPaymentTerms ?? 30,
        currency: vendorCompany?.currency ?? 'USD',
        // Nobody has signed anything. Said in the column rather than
        // assumed away, so "three placements running on a handshake" is a
        // number somebody can pull.
        signedAt: null,
      },
      select: { id: true, paymentTerms: true, currency: true, client: { select: { name: true } } },
    }))

  const engagement =
    (await prisma.engagement.findFirst({
      where: { msaId: msa.id, title: req.title },
      select: { id: true },
    })) ??
    (await prisma.engagement.create({
      data: { msaId: msa.id, title: req.title, invoiceCycle: 'BIWEEKLY' },
      select: { id: true },
    }))

  const result = await prisma.$transaction(async (tx) => {
    // The contract carries the demand-side coding forward. This is the
    // whole point: an invoice raised in four months matches a purchase
    // order because the award attached one, not because somebody
    // remembered to.
    const contract = await tx.sellContract.create({
      data: {
        companyId: submission.fromCompanyId,   // the vendor supplying
        clientCompanyId: payerId,              // who gets the invoice
        // Where the work actually is, when anybody knows. Null means the
        // payer's own site; it used to be set to the payer unconditionally,
        // which made every three-party placement look direct.
        endClientCompanyId: req.endClientCompanyId,
        engagementId: engagement.id,
        msaId: msa.id,
        personId: submission.personId,
        requirementId: req.id,
        hiringManagerId: req.raisedById,
        orgUnitId: req.orgUnitId,
        billRate: awardedRate,
        billCurrency: terms.currency.value,
        paymentTerms: terms.paymentTermsDays.value,
        state: 'DRAFT',
        startDate: start,
        endDate: end,
      },
    })

    // Cost coding, so spend reconciles against the budget that approved it.
    if (req.costCenterId) {
      await tx.contractCostAllocation.create({
        data: { sellContractId: contract.id, costCenterId: req.costCenterId, shareBps: 10_000 },
      })
    }

    // Stamped here, not inferred later. How long a client takes to decide
    // is the number a supplier cares about most.
    await tx.submission.update({ where: { id }, data: { status: 'PLACED', decidedAt: new Date() } })

    let standDown = 0
    let passedOver = 0

    // The last seat closes the requisition, and everyone still working it is
    // stood down rather than left guessing.
    if (decision.fillsRequisition) {
      await tx.requirement.update({ where: { id: req.id }, data: { status: 'FILLED' } })

      const others = await tx.submission.updateMany({
        where: { requirementId: req.id, status: { notIn: ['PLACED', 'REJECTED', 'WITHDRAWN'] } },
        // Being stood down is a decision too, and the slowest ones are
        // exactly the cases a supplier wants counted.
        data: { status: 'NOT_SELECTED', decidedAt: new Date() },
      })
      passedOver = others.count

      const stood = await tx.requirementInvitation.updateMany({
        where: { requirementId: req.id, status: { in: ['SENT', 'ACCEPTED'] } },
        data: { status: 'CLOSED' },
      })
      standDown = stood.count
    }

    return { contract, standDown, passedOver }
  })

  // The hold has done its job. Ending it matters as much as taking it:
  // a placed consultant who is still held cannot be put forward by
  // anybody for a second role at the same client, including by the agency
  // that placed them under a different listing.
  //
  // Everybody who was holding them here, not only the winner — the ones
  // who lost have plainly stopped trying.
  await releaseAllAt({
    personId: submission.personId,
    clientCompanyId: clientOf(req),
    reason: 'They were placed at this client, so every hold here went back.',
  })

  await prisma.automationLog.create({
    data: {
      companyId: req.companyId,
      action: 'CANDIDATE_AWARDED',
      summary: `${submission.person.name} placed on ${req.title} at $${Math.round(awardedRate / 100)}/hr via ${submission.fromCompany.name}`,
      reason: decision.summary,
      payload: {
        submissionId: id,
        requirementId: req.id,
        contractId: result.contract.id,
        rate: awardedRate,
        checks: decision.checks as any,
        seatsAfter: decision.seatsAfter,
        costCenter: req.costCenter?.code ?? null,
      },
      // Reversible only until the person actually starts.
      reversible: true,
    },
  })

  void emit({
    type: 'submission.awarded',
    companyId: req.companyId,
    subjectType: 'Submission',
    subjectId: id,
    actorPersonId: caller.person.id,
    payload: {
      requirementId: req.id,
      contractId: result.contract.id,
      personId: submission.personId,
      personName: submission.person.name,
      vendorCompanyId: submission.fromCompanyId,
      rateCents: awardedRate,
      seatsAfter: decision.seatsAfter,
      costCenterCode: req.costCenter?.code ?? null,
      paymentTermsDays: terms.paymentTermsDays.value,
      // Where the terms came from, so a query about an invoice due date
      // names the level to fix rather than the invoice.
      paymentTermsFrom: terms.paymentTermsDays.source,
      currency: terms.currency.value,
    },
  })

  void emit({
    type: 'contract.created',
    companyId: req.companyId,
    subjectType: 'SellContract',
    subjectId: result.contract.id,
    actorPersonId: caller.person.id,
    payload: {
      fromSubmissionId: id,
      requirementId: req.id,
      personId: submission.personId,
      rateCents: awardedRate,
    },
  })

  // Tell whoever raised it, and the vendor who won it.
  if (req.raisedById) {
    notify({
      personId: req.raisedById,
      companyId: req.companyId,
      type: 'SYSTEM',
      title: `${submission.person.name} placed on ${req.title}`,
      body: decision.fillsRequisition
        ? 'This fills the requisition. The other vendors have been stood down.'
        : `${decision.seatsAfter} position(s) still open.`,
      entityId: req.id,
      data: { requirementId: req.id, contractId: result.contract.id },
    })
  }

  return NextResponse.json(
    {
      data: {
        contractId: result.contract.id,
        person: submission.person,
        vendor: submission.fromCompany,
        rate: awardedRate / 100,
        startDate: start.toISOString().slice(0, 10),
        seatsAfter: decision.seatsAfter,
        requisitionFilled: decision.fillsRequisition,
        vendorsStoodDown: result.standDown,
        candidatesPassedOver: result.passedOver,
        costCenter: req.costCenter?.code ?? null,
        // Not just the number — where it came from. "Net 60, from your
        // agreement with Terumo BCT" names the document to read when
        // somebody queries a due date.
        paymentTerms: {
          days: terms.paymentTermsDays.value,
          from: terms.paymentTermsDays.source,
          because: terms.paymentTermsDays.because,
        },
        currency: terms.currency.value,
        checks: decision.checks,
        notes: decision.checks.filter(c => c.outcome === 'WARN').map(c => c.reason),
        message: decision.summary,
      },
    },
    { status: 201 }
  )
}
