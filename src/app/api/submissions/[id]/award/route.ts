import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { clientOf, releaseAllAt } from '@/lib/holds'
import { emit } from '@/lib/events'
import { resolveBillingTerms } from '@/lib/billing-cascade'
import { evaluateGovernance } from '@/lib/governance'
import { assessAward, buySide, orderCeiling, lineAgreesWithHeader, type AwardFacts } from '@/lib/award'
import { annualValue } from '@/lib/requisition-approval'
import { headerFor, lineTermsFrom } from '../../order-header'
import { orderFor } from '@/lib/order-postings'
import { notify } from '@/lib/notify'
import {
  checkClassification, checkCover, insuranceRestsWith, type WorkerType,
} from '@/lib/worker-classification'
import { writeCyclesFor } from '@/lib/contract-cycles'
import { awardHandoff } from '@/lib/papering'
import { loadContractHolidays } from '@/lib/holidays'

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
 *   Carries the coding onto the contract — cost center, purchase order,
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
      fromCompany: { select: { id: true, name: true, templatePack: true } },
      // Who the supplier bills, by name. The papering notice has to say
      // it, and reading it off the requirement would name the site
      // rather than the counterparty on a three-party placement.
      toCompany: { select: { id: true, name: true } },
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

  // And within the buying company, the desk that owns the requisition.
  //
  // The line above asks which company. It does not ask which seat, so a
  // client's Viewer — a role whose entire blurb is "Reads the program.
  // Changes nothing." — could award a placement worth six figures, and so
  // could the AP clerk and the compliance officer. The governance chain
  // that runs a few lines below is about the money on the requisition,
  // never about who is clicking.
  //
  // `requirements.write` is the permission because awarding is an act on
  // the requisition rather than on the person: it consumes one of the
  // seats, closes the role when the last one goes and stands the other
  // suppliers down. The same permission already gates the two decisions
  // before it on the same candidate — proposing a round
  // (`submissions/[id]/interviews`) and deciding one (`interviews/[id]`) —
  // and this is the last and heaviest decision in that sequence, so a
  // desk that may not book the interview may not hand out the job.
  //
  // At a client that is the hiring manager and the program manager, and
  // deliberately not the approver, the HR partner, the procurement lead,
  // the AP clerk, the compliance officer or the viewer
  // (`lib/company-defaults`).
  if (!hasPermission(caller.permissions, 'requirements.write')) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_HIRING',
          message:
            `Awarding a position is for whoever is hiring at ${caller.company?.name ?? 'your company'} — ` +
            `a hiring or program manager. Ask them to award ${submission.person.name}.`,
        },
      },
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
  //
  // It is written DRAFT, which is the honest name for what it is: a row
  // so the contract has a parent, not an agreement anybody negotiated. A
  // DRAFT with people under it raises MSA_UNSIGNED and MSA_NO_TERM on the
  // agreements screen, and the first recorded signature makes it ACTIVE
  // (`api/program/agreements/[id]/sign`). The alternative — refusing the
  // award — would stop the ten-station path in CLAUDE.md Phase 1 at
  // station three, and would move the placement into email where nothing
  // can see it at all.
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
        status: 'DRAFT',
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

  // The hop below, where there is one. A submission that was forwarded
  // to us came from somebody, and that somebody is who this firm buys
  // from — at what they asked for.
  const suppliedBy = submission.parentSubmissionId
    ? await prisma.submission.findUnique({
        where: { id: submission.parentSubmissionId },
        select: { id: true, fromCompanyId: true, rate: true, requirementId: true },
      })
    : null

  // Their contract, where the hop below has already been awarded. Either
  // order happens in practice — a client can award before its prime has
  // settled with the sub, or after — so the edge is written from
  // whichever end arrives second. See lib/work-chain.
  const supplierContract = suppliedBy
    ? await prisma.sellContract.findFirst({
        where: {
          companyId: suppliedBy.fromCompanyId,
          personId: submission.personId,
          requirementId: suppliedBy.requirementId,
        },
        select: { id: true },
      })
    : null

  // Both calendars, so a due date lands on nobody's holiday. Loaded
  // before the transaction: it is a read, and it needs the years.
  // Where the work is: the client's primary site. A holiday marked for
  // another country on either calendar does not move this site's dates.
  const site = await prisma.companyLocation.findFirst({
    where: { companyId: payerId },
    orderBy: [{ isPrimary: 'desc' }],
    select: { id: true, country: true },
  })
  const holidays = end
    ? await loadContractHolidays(submission.fromCompanyId, payerId, start.getFullYear(), end.getFullYear(), site?.country ?? null)
    : new Set<string>()

  // ── The header this line goes on ────────────────────────────────────
  //
  // A purchase order is a header and its lines. The header is the
  // commitment to a counterparty — who, how much, over what dates, on
  // what terms; the line is one person at one rate at one site, and
  // `SellContract` is that line. Until this was written the award made
  // the line and never the header, so `WorkOrder` had zero rows for the
  // life of the product: no ceiling for an invoice to match against, no
  // milestones, and `cron/auto-approve` reading the client's own term
  // off a row that did not exist, which is why it had approved nothing
  // since the day it was written. CLAUDE.md, 2026-09-18.
  //
  // Who is who on it, and why the award may raise it at all: the client
  // is the buyer and the supplier is the seller, the awarding company
  // recorded it, and the permission that got this far is
  // `requirements.write` rather than `invoices.issue` — because this is
  // not somebody raising an order from the purchase orders screen. It is
  // the paper consequence of the award they just made, and the ceiling
  // on it is the one their own approval chain already signed.
  //
  // The buy side is decided here too, one screen earlier than it used
  // to be, because whether there is a sub-vendor below decides whether
  // there is a second header at all. It is pure arithmetic over facts
  // already read.
  const buy = buySide({
    awardedCompanyId: submission.fromCompanyId,
    suppliedByCompanyId: suppliedBy?.fromCompanyId ?? null,
    suppliedRateCents: suppliedBy?.rate ?? null,
    agreedRateCents: typeof body?.payRate === 'number' ? body.payRate : null,
  })

  // What the client's order may authorize in total. The requisition's
  // own approved value, extended over its term and rounded up to the
  // thousand — the rule and the arithmetic are in `lib/award`, and the
  // arithmetic is `annualValue`, which is the same function that decided
  // who had to approve the requisition in the first place. Null where
  // nothing supports a figure, and then no order is raised: a ceiling
  // nobody can stand behind is worse than none, because an invoice would
  // be matched against a number nobody chose.
  const ceiling = orderCeiling({
    budgetCents: req.budgetCents,
    billMaxCents: req.billMax,
    headcount: req.headcount,
    months: req.months,
    hoursPerWeek: req.hoursPerWeek,
    awardedRateCents: awardedRate,
    annualValue,
  })

  // The agreement under our own order to a sub-vendor, where there is
  // one. Read, never created: papering our relationship with a supplier
  // is the supplier desk's act, not a side effect of a client's award.
  const buyAgreement = buy.vendorCompanyId
    ? await prisma.masterAgreement.findFirst({
        where: { vendorId: buy.vendorCompanyId, clientId: submission.fromCompanyId },
        select: { id: true, paymentTerms: true, currency: true },
      })
    : null

  // What we pay down the chain, valued the same way. The client's
  // ceiling is what the client authorized; ours to a sub-vendor is our
  // own money and is never the client's number.
  const buyCeiling = buy.vendorCompanyId && buy.rateKnown
    ? orderCeiling({
        budgetCents: null,
        billMaxCents: buy.payRateCents,
        headcount: 1,
        months: req.months,
        hoursPerWeek: req.hoursPerWeek,
        awardedRateCents: buy.payRateCents,
        annualValue,
      })
    : null

  const result = await prisma.$transaction(async (tx) => {
    // One open order per buyer-and-seller pair: found, or raised with
    // this line. `order-header.ts`, beside this route, because the
    // convert path creates the same pair and a second implementation of
    // this rule would quietly raise a second document.

    // The client's order to the supplier. Raised only where a ceiling
    // could be stated at all.
    const sellHeader = ceiling
      ? await headerFor(tx, {
          buyerId: payerId,
          sellerId: submission.fromCompanyId,
          // Whoever awarded typed it in. Ordinarily the buyer; on a
          // three-party placement the company that raised the
          // requisition, which the column exists to record.
          recordedById: caller.company?.id ?? payerId,
          title: `Contingent staffing — ${submission.fromCompany.name}`,
          amountDollars: ceiling.dollars,
          currency: terms.currency.value,
          paymentTerms: terms.paymentTermsDays.value,
          msaId: msa.id,
          engagementId: engagement.id,
          shipToId: site?.id ?? null,
          start, end,
        })
      : null

    // The line takes its rhythm and its terms from the header it is on,
    // but only where this award raised that header. Joining an order
    // somebody else raised is not license to rewrite a term they agreed:
    // where the two differ, the line keeps what the agreement cascade
    // gave it and the difference is written down below, in words, rather
    // than silently resolved in favor of whichever row was read last.
    const lineTerms = lineTermsFrom(sellHeader, terms.paymentTermsDays.value)

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
        // Copied from the role, not read through it. A contract carries
        // its rate; it carries its overtime terms the same way, so
        // editing the requisition later cannot reprice a live week.
        overtimeAfterHours: req.overtimeAfterHours ?? null,
        overtimeMultiplierBps: req.overtimeMultiplierBps ?? 15_000,
        billCurrency: terms.currency.value,
        // ── The line, on its header ──────────────────────────────────
        //
        // Four of the six fields that sit on both rows, written from the
        // order this line hangs on so they cannot disagree on the day
        // they are made. The other two are the dates, which are not
        // copies: a header covers several lines and outlives each of
        // them, so the line's dates sit inside the header's window
        // rather than equalling it.
        ...lineTerms,
        workOrderId: sellHeader?.id ?? null,
        state: 'DRAFT',
        startDate: start,
        endDate: end,
      },
    })

    // ── The other half of the deal ──────────────────────────────────
    //
    // Awarding created a sell contract and nothing else, so every
    // placement had a price and no cost. Profitability then read the
    // missing pay rate as zero and reported a hundred per cent margin
    // on the whole book — confidently wrong, and it looks like good
    // news, which is the kind nobody audits.
    //
    // You cannot place somebody without knowing what you pay them, so
    // the buy side is raised here. Where the submission came from
    // another firm, what they asked for IS the cost — that is the whole
    // arrangement, and defaulting to it is right rather than lazy.
    //
    // `buy` is decided above the transaction now, because whether there
    // is a sub-vendor below is what decides whether this firm's own
    // order to that sub-vendor exists at all.

    // ── Our own order to the sub-vendor, where there is one ──────────
    //
    // Only where we buy from another firm. A W2 line hangs on no order:
    // you do not raise a purchase order to your own employee, which is
    // the reason `BuyContract.workOrderId` is nullable and why
    // `POST /api/contracts` refuses a W2 carrying one. SAP agrees — an
    // employee is HCM master data, not a vendor.
    //
    // Null too where nobody has said what we pay yet: an order needs a
    // ceiling, and a ceiling over a pay rate nobody has agreed is a
    // number invented on the way past. The supplier desk raises it from
    // the purchase orders screen when the rate is settled.
    const buyHeader = buy.vendorCompanyId && buyCeiling
      ? await headerFor(tx, {
          buyerId: submission.fromCompanyId,
          sellerId: buy.vendorCompanyId,
          // Our own order, recorded by us. The client that awarded has
          // no part in what we pay below us and never sees this row.
          recordedById: submission.fromCompanyId,
          title: `Subcontract — ${req.title}`,
          amountDollars: buyCeiling.dollars,
          currency: terms.currency.value,
          // Our agreement with that supplier where we have one, and the
          // client's terms otherwise — never a third number.
          paymentTerms: buyAgreement?.paymentTerms ?? terms.paymentTermsDays.value,
          msaId: buyAgreement?.id ?? null,
          // The engagement above is the client's deal, not this one.
          engagementId: null,
          shipToId: site?.id ?? null,
          start, end,
        })
      : null

    const buyContract = await tx.buyContract.create({
      data: {
        companyId: submission.fromCompanyId,
        // Null where we employ them ourselves; the supplier where we do
        // not. The model has meant this from the first commit.
        vendorCompanyId: buy.vendorCompanyId,
        payCurrency: terms.currency.value,
        contractType: buy.contractType,
        // DRAFT until somebody confirms the rate. A placement whose cost
        // nobody has agreed is not ready to pay against, and pretending
        // otherwise is how the wrong number reaches a payroll file.
        state: 'DRAFT',
        // The rung below, so the hours this firm bills for can be found
        // at all. Null on a W2 placement, where there is no rung below.
        supplierSellContractId: supplierContract?.id ?? null,
        // The header this line hangs on: our order to the sub-vendor,
        // and null for our own employee.
        workOrderId: buyHeader?.id ?? null,
        startDate: start,
        endDate: end,
      },
    })

    await tx.buyContractCandidate.create({
      data: {
        buyContractId: buyContract.id,
        personId: submission.personId,
        // Zero where nobody has said yet. Visibly missing beats a
        // plausible guess — profitability refuses to show a margin on it
        // rather than inventing one.
        payRate: buy.payRateCents,
        payCurrency: terms.currency.value,
        startDate: start,
        endDate: end,
      },
    })

    // The join that makes margin readable. It has existed in the schema
    // from the start and nothing ever created one.
    await tx.contractLink.create({
      data: {
        sellContractId: contract.id,
        buyContractId: buyContract.id,
        effectiveFrom: start,
        effectiveTo: end,
      },
    })

    // Its due dates. The contract-creating route wrote them and this
    // one did not, so a placement made the way a client actually makes
    // one — by awarding — had no hours due, no pay day and no invoice
    // date, and its thread read "no cycles have been generated". Same
    // helper the seeds use; no end date, no cycles, which is the rule.
    const cycles = await writeCyclesFor(tx, {
      sell: { id: contract.id, startDate: start, endDate: end },
      buy: { id: buyContract.id, contractType: buy.contractType, vendorCompanyId: buy.vendorCompanyId },
      packId: submission.fromCompany.templatePack ?? 'US_IT',
      holidays,
    })

    // The other direction. This award has just created a sell contract
    // for a firm that somebody above may already have raised a buy
    // contract against — the client awarded first and the prime settled
    // with its sub afterwards, which is the ordinary order of events.
    // The edge is completed here rather than left null, because a null
    // there means "we employ them" and this is the case where we do not.
    const above = await tx.submission.findMany({
      where: { parentSubmissionId: id, status: 'PLACED' },
      select: { fromCompanyId: true, requirementId: true },
    })
    for (const hop of above) {
      const theirSell = await tx.sellContract.findFirst({
        where: {
          companyId: hop.fromCompanyId,
          personId: submission.personId,
          requirementId: hop.requirementId,
        },
        select: { buyLinks: { select: { buyContractId: true } } },
      })
      for (const link of theirSell?.buyLinks ?? []) {
        await tx.buyContract.updateMany({
          where: { id: link.buyContractId, supplierSellContractId: null },
          data: { supplierSellContractId: contract.id },
        })
      }
    }

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
      // Filled is a placement's word; the requirement is put away with
      // that as its reason, and found under Archived — not under a tab
      // of its own.
      await tx.requirement.update({ where: { id: req.id }, data: { status: 'FILLED', archivedAt: new Date() } })

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

    // Whether the line and the header it landed on say the same thing.
    // Empty where this award raised the header, because both came from
    // one computation; a sentence each where the line joined an order
    // somebody else raised on other terms, so the difference is said out
    // loud instead of being discovered on an invoice.
    const disagreements = sellHeader
      ? lineAgreesWithHeader(
          {
            billFrequency: sellHeader.billFrequency,
            billAnchor: sellHeader.billAnchor,
            billStraddle: sellHeader.billStraddle,
            paymentTerms: sellHeader.paymentTerms,
            startDate: sellHeader.startDate,
            endDate: sellHeader.endDate,
          },
          {
            billFrequency: contract.billFrequency,
            billAnchor: contract.billAnchor,
            billStraddle: contract.billStraddle,
            paymentTerms: contract.paymentTerms,
            startDate: contract.startDate,
            endDate: contract.endDate,
          }
        )
      : []

    return { contract, buyContract, standDown, passedOver, cycles, sellHeader, buyHeader, disagreements }
  })

  // ── The cost object ─────────────────────────────────────────────────
  //
  // Opened here so both sides of the deal land on the same order from the
  // first day. A requisition for six people is one piece of work with six
  // consultants on it — the case the old spreadsheet could not add up,
  // because the customer lived inside the consultant's name.
  const orderId = await orderFor(result.contract.id)
  if (orderId) {
    await prisma.buyContract.update({
      where: { id: result.buyContract.id },
      // The project order, which is what orderFor opens and returns.
      //
      // Written to internalOrderId, which is the *client's* own coding
      // and a different table entirely, this violated the foreign key
      // and threw — after the transaction above had already committed.
      // So every award through this route returned a 500 to the person
      // who pressed the button while quietly having placed somebody.
      data: { projectOrderId: orderId },
    })
  }

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
        cycles: { sell: result.cycles.sell, buy: result.cycles.buy },
        // The paper the award raised, and the number on it. A ceiling is
        // money, so it carries where it came from — never a bare figure.
        order: result.sellHeader
          ? {
              workOrderId: result.sellHeader.id,
              number: result.sellHeader.number,
              raised: result.sellHeader.raised,
              ceilingDollars: ceiling?.dollars ?? null,
              ceilingBasis: ceiling?.basis ?? null,
              says: ceiling?.says ?? null,
            }
          : null,
        subOrder: result.buyHeader
          ? { workOrderId: result.buyHeader.id, number: result.buyHeader.number, raised: result.buyHeader.raised }
          : null,
        lineDisagreesWithOrder: result.disagreements,
      },
      // Reversible only until the person actually starts.
      reversible: true,
    },
  })

  // ── The order is paper, so it is logged as paper ────────────────────
  //
  // Its own line in the client's automation log, in the words an AP desk
  // uses: a number, a ceiling and who it authorizes. The award above is
  // about a person; this is about money, and somebody auditing the
  // ceiling should not have to read a placement record to find it.
  if (result.sellHeader?.raised && ceiling) {
    await prisma.automationLog.create({
      data: {
        companyId: payerId,
        action: 'PURCHASE_ORDER_RAISED',
        summary:
          `${result.sellHeader.number} — $${ceiling.dollars.toLocaleString()} authorized to ` +
          `${submission.fromCompany.name}, with ${submission.person.name} as its first line`,
        reason: ceiling.says,
        payload: {
          workOrderId: result.sellHeader.id,
          number: result.sellHeader.number,
          supplierId: submission.fromCompanyId,
          amount: ceiling.dollars,
          basis: ceiling.basis,
          requirementId: req.id,
          contractId: result.contract.id,
        },
        reversible: true,
      },
    })

    void emit({
      type: 'purchase_order.raised',
      companyId: payerId,
      subjectType: 'WorkOrder',
      subjectId: result.sellHeader.id,
      actorPersonId: caller.person.id,
      payload: {
        number: result.sellHeader.number,
        supplierCompanyId: submission.fromCompanyId,
        supplierName: submission.fromCompany.name,
        amount: ceiling.dollars,
        currency: terms.currency.value,
        startDate: result.sellHeader.startDate.toISOString(),
        endDate: result.sellHeader.endDate?.toISOString() ?? null,
        contractsAttached: 1,
        raisedByAward: true,
        ceilingBasis: ceiling.basis,
      },
    })
  }

  // The order below, where this firm bought from a sub-vendor. Logged
  // against the firm that raised it, never against the client — what a
  // prime pays its sub is not the client's to read.
  if (result.buyHeader?.raised && buyCeiling) {
    await prisma.automationLog.create({
      data: {
        companyId: submission.fromCompanyId,
        action: 'PURCHASE_ORDER_RAISED',
        summary:
          `${result.buyHeader.number} — $${buyCeiling.dollars.toLocaleString()} authorized to the supplier of ` +
          `${submission.person.name}`,
        reason: buyCeiling.says,
        payload: {
          workOrderId: result.buyHeader.id,
          number: result.buyHeader.number,
          supplierId: buy.vendorCompanyId,
          amount: buyCeiling.dollars,
          basis: buyCeiling.basis,
          buyContractId: result.buyContract.id,
        },
        reversible: true,
      },
    })
  }

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

  // ── The baton passes ────────────────────────────────────────────────
  //
  // The founder's question: "how will the placed transition to contract
  // from account manager to contract manager, and at what point?" Here,
  // and nowhere else. `company-defaults` already separates the desks —
  // an Account Manager submits and cannot write a contract; a Contract
  // Manager writes contracts and cannot submit — and until now the award
  // told neither. It told the client's own requisition raiser and left a
  // DRAFT contract on nobody's desk at the supplier.
  //
  // So the supplier's seats are read and split by what they may actually
  // do: whoever can paper it is asked to, by email as well as in the app,
  // and whoever sells is told it was won and who has it now. Nobody is
  // handed a job they would be refused on arrival. src/lib/papering.ts
  const seats = await prisma.context.findMany({
    where: { companyId: submission.fromCompanyId, revokedAt: null, type: 'EMPLOYEE' },
    select: {
      personId: true,
      person: { select: { name: true } },
      role: { select: { name: true, permissions: true } },
    },
  })

  const handoff = awardHandoff(
    {
      personName: submission.person.name,
      clientName: submission.toCompany.name,
      roleTitle: req.title,
      rateCents: awardedRate,
      currency: terms.currency.value,
      startDate: start,
    },
    seats.map((s) => ({
      personId: s.personId,
      personName: s.person.name,
      roleName: s.role?.name ?? null,
      permissions: s.role?.permissions ?? [],
    }))
  )

  for (const notice of [handoff.toPaper, handoff.toSell]) {
    if (!notice) continue
    for (const personId of notice.personIds) {
      void notify({
        personId,
        companyId: submission.fromCompanyId,
        type: 'CONTRACT',
        // Email as well as in the app. A desk that only hears when it
        // happens to open the app is a desk that hears late.
        channel: 'EMAIL',
        title: notice.title,
        body: notice.body,
        entityId: result.contract.id,
        data: { contractId: result.contract.id, requirementId: req.id, href: '/dashboard/contracts' },
      })
    }
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
        // ── The paper the award raised ─────────────────────────────────
        //
        // The client reads this row as its purchase order and the
        // supplier reads the same row as its sales order, which is why
        // both numbers are here and neither is called a "work order" on
        // a screen (`lib/order-naming` decides which word each reader
        // sees). The ceiling carries its basis, because a figure nobody
        // can stand behind is worse than a blank.
        order: result.sellHeader
          ? {
              id: result.sellHeader.id,
              number: result.sellHeader.number,
              raised: result.sellHeader.raised,
              says: result.sellHeader.says,
              ceiling: ceiling
                ? { amount: ceiling.dollars, currency: terms.currency.value, basis: ceiling.basis, because: ceiling.says }
                : null,
              // Said out loud rather than resolved behind somebody's
              // back. Empty on an order this award raised.
              differsFromLine: result.disagreements,
            }
          : {
              id: null,
              raised: false,
              says:
                'No ceiling could be stated — the requisition carries no budget, no rate ceiling and no rate ' +
                'on the award — so no purchase order was raised. Raise one from the purchase orders screen.',
              ceiling: null,
              differsFromLine: [],
            },
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
        // Where it went next, in the supplier's own words. The award is
        // the handoff, and saying so is how a person learns the rule
        // without being trained on it.
        handoff: {
          desk: handoff.deskPhrase,
          told: (handoff.toPaper?.personIds.length ?? 0) + (handoff.toSell?.personIds.length ?? 0),
          says: handoff.says,
        },
        message: decision.summary,
      },
    },
    { status: 201 }
  )
}
