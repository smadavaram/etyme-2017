import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import { advanceApprovalChain } from '@/lib/requisition-approval'

/**
 * POST /api/requisitions/:id/approve
 *
 * Body: { action: 'approve' | 'reject', reason?: string }
 *
 * Decides one rank of a routed requisition. Ranks clear in order: rank 1
 * approves before rank 2 is asked, so a chain never bothers three people
 * with a request the first one would have rejected.
 *
 * A requisition only reaches the market when every rank has approved —
 * that is what makes the approval mean anything. Rejection is terminal and
 * requires a reason, because the person who raised it has to be told
 * something they can act on.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json()
  const { action, reason } = body

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: "action must be 'approve' or 'reject'", field: 'action' } },
      { status: 422 }
    )
  }

  if (action === 'reject' && (!reason || String(reason).trim().length === 0)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A reason is required when rejecting', field: 'reason' } },
      { status: 422 }
    )
  }

  const requisition = await prisma.requirement.findUnique({
    where: { id },
    include: {
      approvals: { orderBy: { rank: 'asc' } },
      raisedBy: { select: { id: true, name: true } },
      costCenter: { select: { code: true } },
    },
  })

  if (!requisition) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Requisition not found' } },
      { status: 404 }
    )
  }

  if (requisition.approvalState !== 'PENDING_APPROVAL') {
    return NextResponse.json(
      { error: { code: 'INVALID_STATE', message: `Requisition is ${requisition.approvalState}, nothing to decide` } },
      { status: 409 }
    )
  }

  // Rank ordering, terminality of rejection and the open-only-when-complete
  // rule all live in one tested place (src/lib/requisition-approval.ts).
  const advance = advanceApprovalChain(
    requisition.approvals.map(a => ({
      id: a.id, approverId: a.approverId, rank: a.rank, outcome: a.outcome,
    })),
    action,
    caller.person.id
  )

  if (advance.refusal === 'NOTHING_PENDING') {
    return NextResponse.json(
      { error: { code: 'INVALID_STATE', message: 'No pending approval on this requisition' } },
      { status: 409 }
    )
  }

  if (advance.refusal === 'NOT_YOUR_APPROVAL') {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'This approval is not yours to decide' } },
      { status: 403 }
    )
  }

  const current = advance.current!

  const now = new Date()
  const decisionReason = String(reason ?? '').trim() || `${action === 'approve' ? 'Approved' : 'Rejected'} by ${caller.person.name}`

  const result = await prisma.$transaction(async (tx) => {
    await tx.requirementApproval.update({
      where: { id: current.id },
      data: {
        outcome: action === 'approve' ? 'APPROVED' : 'REJECTED',
        reason: decisionReason,
        decidedAt: now,
      },
    })

    // Rejection is terminal — later ranks are closed, never asked.
    if (advance.nextState === 'REJECTED') {
      await tx.requirementApproval.updateMany({
        where: { requirementId: id, outcome: 'PENDING' },
        data: { outcome: 'REJECTED', reason: `Chain closed: ${decisionReason}`, decidedAt: now },
      })
    }

    // Only a completed chain changes the requisition itself.
    const updated = advance.nextStatus
      ? await tx.requirement.update({
          where: { id },
          data: { approvalState: advance.nextState!, status: advance.nextStatus },
        })
      : requisition

    return {
      updated,
      fullyApproved: advance.completesChain && advance.nextState === 'APPROVED',
      remaining: advance.remaining.length,
    }
  })

  await prisma.automationLog.create({
    data: {
      companyId: requisition.companyId,
      action: action === 'approve' ? 'REQUISITION_APPROVED' : 'REQUISITION_REJECTED',
      summary: `${requisition.title} — ${action === 'approve' ? 'approved' : 'rejected'} by ${caller.person.name}`,
      reason: decisionReason,
      payload: {
        requirementId: id,
        rank: current.rank,
        fullyApproved: result.fullyApproved,
        remainingRanks: result.remaining,
      },
      // An approval can be withdrawn before anyone is placed; a rejection
      // is reversed by raising a fresh requisition, not by undoing this one.
      reversible: action === 'approve',
    },
  })

  void emit({
    type: action === 'approve' ? 'requisition.approved' : 'requisition.rejected',
    companyId: requisition.companyId,
    subjectType: 'Requirement',
    subjectId: id,
    actorPersonId: caller.person.id,
    payload: {
      title: requisition.title,
      rank: current.rank,
      fullyApproved: result.fullyApproved,
      remainingRanks: result.remaining,
      reason: decisionReason,
    },
  })

  // Tell whoever raised it what happened to their request.
  if (requisition.raisedById) {
    notify({
      personId: requisition.raisedById,
      companyId: requisition.companyId,
      type: 'SYSTEM',
      title: action === 'approve'
        ? (result.fullyApproved ? `Requisition approved: ${requisition.title}` : `Requisition cleared one approval: ${requisition.title}`)
        : `Requisition rejected: ${requisition.title}`,
      body: result.fullyApproved
        ? `${caller.person.name} approved it. It is now open to your vendors.`
        : action === 'approve'
          ? `${caller.person.name} approved it. ${result.remaining} further approval(s) to go.`
          : `${caller.person.name} rejected it: ${decisionReason}`,
      entityId: id,
      data: { requirementId: id, action },
    })
  }

  // Hand the next rank their turn.
  if (action === 'approve' && !result.fullyApproved) {
    const next = advance.remaining[0]
    if (next?.approverId) {
      notify({
        personId: next.approverId,
        companyId: requisition.companyId,
        type: 'SYSTEM',
        title: `Requisition needs your approval: ${requisition.title}`,
        body: `${caller.person.name} approved at rank ${current.rank}. Your approval is next.`,
        entityId: id,
        data: { requirementId: id },
      })
    }
  }

  return NextResponse.json({
    data: {
      id,
      action,
      approvalState: result.updated.approvalState,
      status: result.updated.status,
      fullyApproved: result.fullyApproved,
      remainingApprovals: result.remaining,
      decidedBy: caller.person.name,
      reason: decisionReason,
      message: action === 'reject'
        ? `Requisition rejected: ${decisionReason}`
        : result.fullyApproved
          ? 'Requisition approved — now open to vendors'
          : `Approved. ${result.remaining} further approval(s) required.`,
    },
  })
}
