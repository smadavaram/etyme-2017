import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { endClientFilter } from '@/lib/resolve-end-client'
import { resolveClientCompany } from '@/lib/resolve-client-company'
import {
  evaluateRequisition,
  annualisedValueCents,
  type RequisitionFacts,
  type ApprovalRuleFacts,
} from '@/lib/requisition-approval'
import { notifyBulk, type NotifyParams } from '@/lib/notify'

/**
 * GET  /api/requisitions   — what this client has open, with its approval state
 * POST /api/requisitions   — a hiring manager raises one
 *
 * The demand side of the marketplace. Until now a Requirement could only be
 * recorded by a vendor against demand it had heard about second-hand; a
 * client had no way to say what it needed. Everything downstream — budget,
 * governance, vendor distribution, the eventual contract's coding — hangs
 * off this object.
 *
 * Addendum E: most requisitions clear without a human. The decision, and the
 * facts behind it, are recorded either way (src/lib/requisition-approval.ts).
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { client, error: clientError } = await resolveClientCompany(
    caller,
    request.nextUrl.searchParams.get('clientCompanyId')
  )
  if (clientError) return clientError

  const requisitions = await prisma.requirement.findMany({
    where: {
      OR: [
        { companyId: client.id },
        { msa: { clientId: client.id } },
      ],
    },
    include: {
      raisedBy: { select: { id: true, name: true } },
      orgUnit: { select: { id: true, name: true } },
      costCenter: { select: { id: true, code: true, name: true } },
      approvals: {
        include: { approver: { select: { id: true, name: true } } },
        orderBy: { rank: 'asc' },
      },
      _count: { select: { submissions: true, invitations: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    data: {
      client: { id: client.id, name: client.name },
      requisitions: requisitions.map(r => ({
        id: r.id,
        title: r.title,
        skills: r.skills,
        location: r.location,
        headcount: r.headcount,
        billMin: r.billMin,
        billMax: r.billMax,
        months: r.months,
        neededBy: r.neededBy?.toISOString() ?? null,
        justification: r.justification,
        status: r.status,
        approvalState: r.approvalState,
        raisedBy: r.raisedBy,
        orgUnit: r.orgUnit,
        costCenter: r.costCenter,
        approvals: r.approvals.map(a => ({
          id: a.id,
          approver: a.approver,
          rank: a.rank,
          outcome: a.outcome,
          reason: a.reason,
          decidedAt: a.decidedAt?.toISOString() ?? null,
        })),
        counts: {
          submissions: r._count.submissions,
          invitations: r._count.invitations,
        },
        createdAt: r.createdAt.toISOString(),
      })),
      summary: {
        total: requisitions.length,
        awaitingApproval: requisitions.filter(r => r.approvalState === 'PENDING_APPROVAL').length,
        autoCleared: requisitions.filter(r => r.approvalState === 'AUTO_APPROVED').length,
        open: requisitions.filter(r => r.status === 'OPEN').length,
      },
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { client, error: clientError } = await resolveClientCompany(caller, null)
  if (clientError) return clientError

  const body = await request.json()
  const {
    title, skills, location, headcount, billMin, billMax, months,
    neededBy, justification, costCenterId, orgUnitId, raisedById,
  } = body

  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Title is required (min 3 characters)', field: 'title' } },
      { status: 422 }
    )
  }

  const heads = Number.isInteger(headcount) && headcount > 0 ? headcount : 1

  // ── Gather the facts the decision needs ──

  const costCenter = costCenterId
    ? await prisma.costCenter.findFirst({
        where: { id: costCenterId, companyId: client.id },
        include: {
          headcountPlans: { orderBy: { period: 'desc' }, take: 1 },
        },
      })
    : null

  if (costCenterId && !costCenter) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Cost centre not found for this company' } },
      { status: 404 }
    )
  }

  // What is already committed against that cost centre, from live contracts.
  let committedHeads = 0
  let committedSpendCents = 0
  if (costCenter) {
    const allocations = await prisma.contractCostAllocation.findMany({
      where: {
        costCenterId: costCenter.id,
        sellContract: { state: { in: ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION'] } },
      },
      select: { shareBps: true, sellContract: { select: { billRate: true } } },
    })
    committedHeads = allocations.length
    committedSpendCents = allocations.reduce(
      (sum, a) => sum + Math.round((a.sellContract.billRate * 160 * 12 * a.shareBps) / 10_000),
      0
    )
  }

  // What this client already pays for these skills — the comparison that
  // makes a rate check meaningful rather than an abstract band.
  const skillMedianCents = await medianRateForSkills(client.id, Array.isArray(skills) ? skills : [])

  const annualValueCents = annualisedValueCents({
    billMaxCents: billMax ?? null,
    headcount: heads,
    months: months ?? null,
  })

  const facts: RequisitionFacts = {
    annualValueCents,
    headcount: heads,
    billMaxCents: billMax ?? null,
    skillMedianCents,
    months: months ?? null,
    costCenter: costCenter
      ? {
          id: costCenter.id,
          code: costCenter.code,
          approvedHeads: costCenter.headcountPlans[0]?.approvedHeads ?? null,
          committedHeads,
          annualBudgetCents: costCenter.headcountPlans[0]
            ? Math.round(Number(costCenter.headcountPlans[0].annualBudget) * 100)
            : null,
          committedSpendCents,
        }
      : null,
  }

  const ruleRows = await prisma.approvalRule.findMany({
    where: {
      companyId: client.id,
      isActive: true,
      OR: [{ orgUnitId: null }, { orgUnitId: orgUnitId ?? undefined }],
    },
    include: { approver: { select: { id: true, name: true } } },
    orderBy: { rank: 'asc' },
  })

  const rules: ApprovalRuleFacts[] = ruleRows.map(r => ({
    id: r.id,
    name: r.name,
    approverId: r.approverId,
    approverName: r.approver.name,
    thresholdCents: r.thresholdAmount ? Math.round(Number(r.thresholdAmount) * 100) : null,
    rank: r.rank,
  }))

  const decision = evaluateRequisition(facts, rules)

  if (decision.state === 'BLOCKED') {
    return NextResponse.json(
      { error: { code: 'BLOCKED', message: decision.summary, checks: decision.checks } },
      { status: 403 }
    )
  }

  // ── Write it ──

  const requisition = await prisma.$transaction(async (tx) => {
    const req = await tx.requirement.create({
      data: {
        companyId: client.id, // the CLIENT owns this one
        title: title.trim(),
        skills: Array.isArray(skills) ? skills : [],
        location: location ?? null,
        billMin: billMin ?? null,
        billMax: billMax ?? null,
        months: months ?? null,
        headcount: heads,
        neededBy: neededBy ? new Date(neededBy) : null,
        justification: justification ?? null,
        costCenterId: costCenter?.id ?? null,
        orgUnitId: orgUnitId ?? null,
        raisedById: raisedById ?? caller.person.id,
        approvalState: decision.state,
        // Only an approved requisition reaches the market.
        status: decision.state === 'AUTO_APPROVED' ? 'OPEN' : 'DRAFT',
        source: 'MANUAL',
      },
    })

    // Record the decision — the auto-clearance as much as the routing, so a
    // requisition that nobody looked at can still be explained a year later.
    if (decision.state === 'AUTO_APPROVED') {
      await tx.requirementApproval.create({
        data: {
          requirementId: req.id,
          approverId: null,
          rank: 0,
          outcome: 'AUTO_CLEARED',
          reason: decision.summary,
          decidedAt: new Date(),
        },
      })
    } else {
      await tx.requirementApproval.createMany({
        data: decision.route.map(r => ({
          requirementId: req.id,
          approverId: r.approverId,
          rank: r.rank,
          outcome: 'PENDING',
          reason: decision.summary,
        })),
      })
    }

    await tx.automationLog.create({
      data: {
        companyId: client.id,
        action: decision.state === 'AUTO_APPROVED' ? 'REQUISITION_AUTO_CLEARED' : 'REQUISITION_ROUTED',
        summary: `${title.trim()} (${heads} head${heads === 1 ? '' : 's'}) — ${decision.summary}`,
        reason: decision.checks.map(c => `${c.code}: ${c.reason}`).join(' · '),
        payload: {
          requirementId: req.id,
          checks: decision.checks as any,
          annualValueCents,
          route: decision.route.map(r => ({ approverId: r.approverId, name: r.approverName })),
        },
        reversible: true,
      },
    })

    return req
  })

  // Emitted after the transaction, not inside it. An event describing a
  // requisition that then failed to commit is a lie an integration would
  // act on.
  void emit({
    type: 'requisition.raised',
    companyId: client.id,
    subjectType: 'Requirement',
    subjectId: requisition.id,
    actorPersonId: caller.person.id,
    payload: {
      title: title.trim(),
      heads,
      annualValueCents,
      // Whether it needed a human at all. The headline number for any
      // programme is the share that cleared without one.
      autoCleared: decision.state === 'AUTO_APPROVED',
      approverCount: decision.route.length,
    },
  })

  // Tell the approvers there is something waiting.
  if (decision.route.length > 0) {
    const notifications: NotifyParams[] = decision.route.map(r => ({
      personId: r.approverId,
      companyId: client.id,
      type: 'SYSTEM',
      title: `Requisition needs your approval: ${title.trim()}`,
      body: decision.summary,
      entityId: requisition.id,
      data: { requirementId: requisition.id, checks: decision.checks as any },
    }))
    notifyBulk(notifications)
  }

  return NextResponse.json(
    {
      data: {
        requisition: {
          id: requisition.id,
          title: requisition.title,
          headcount: requisition.headcount,
          approvalState: requisition.approvalState,
          status: requisition.status,
        },
        decision: {
          state: decision.state,
          summary: decision.summary,
          checks: decision.checks,
          route: decision.route.map(r => ({ approverId: r.approverId, name: r.approverName, rank: r.rank })),
        },
        annualValue: annualValueCents / 100,
        message: decision.state === 'AUTO_APPROVED'
          ? `Requisition open — ${decision.summary}`
          : `Requisition raised — ${decision.summary}`,
      },
    },
    { status: 201 }
  )
}

/**
 * The median hourly rate this client already pays for any of these skills.
 * Comparing against what they actually pay beats an abstract market band,
 * and it reuses the same signal the org view surfaces as rate variance.
 */
async function medianRateForSkills(
  clientId: string,
  skills: string[]
): Promise<number | null> {
  if (skills.length === 0) return null

  const contracts = await prisma.sellContract.findMany({
    where: {
      ...endClientFilter(clientId),
      state: { in: ['IN_PROGRESS', 'VERIFIED'] },
    },
    select: {
      billRate: true,
      person: { select: { consultant: { select: { skills: true } } } },
    },
  })

  const wanted = new Set(skills.map(s => s.toLowerCase()))
  const rates = contracts
    .filter(c =>
      (c.person.consultant?.skills ?? []).some(s => wanted.has(s.toLowerCase()))
    )
    .map(c => c.billRate)
    .sort((a, b) => a - b)

  if (rates.length === 0) return null
  const mid = Math.floor(rates.length / 2)
  return rates.length % 2 === 0
    ? Math.round((rates[mid - 1] + rates[mid]) / 2)
    : rates[mid]
}
