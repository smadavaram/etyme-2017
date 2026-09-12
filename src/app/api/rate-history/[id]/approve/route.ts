import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { hasPermission } from '@/lib/permissions'
import { assessRateChange } from '@/lib/contract-rate'

/**
 * POST /api/rate-history/:id/approve   { action: 'approve' | 'reject', reason? }
 *
 * The remedy an AP clerk is sent to when an invoice fails the PRICE check.
 *
 * Refusing the waiver and pointing at a door is only defensible if the door
 * exists. Until a change is approved it does not bill (src/lib/contract-rate.ts),
 * so this is what turns a proposed amendment into the contracted rate — and
 * with it, an invoice that matches because it is right rather than excused.
 *
 * Whoever proposed a rate rise may not approve their own proposal. That is
 * the one segregation rule worth enforcing here: everything else about a
 * rate change is commercial judgment, but signing off your own price
 * increase is not judgment, it is an absence of a control.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  // Procurement owns price, so rates.write is the permission that matters
  // here; contract writers can also decide one, since they can set the rate
  // outright anyway.
  const mayDecide =
    hasPermission(caller.permissions, 'rates.write') ||
    hasPermission(caller.permissions, 'assignments.write')
  if (!mayDecide) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Deciding a rate amendment needs rates.write — this is procurement\'s call' } },
      { status: 403 }
    )
  }

  const { id } = await params
  const body = await request.json()
  const { action, reason } = body

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: "action must be 'approve' or 'reject'", field: 'action' } },
      { status: 422 }
    )
  }

  if (action === 'reject' && !String(reason ?? '').trim()) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A reason is required when rejecting an amendment', field: 'reason' } },
      { status: 422 }
    )
  }

  const amendment = await prisma.rateHistory.findUnique({ where: { id } })
  if (!amendment) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Rate amendment not found' } },
      { status: 404 }
    )
  }

  if (amendment.approvalState !== 'PROPOSED') {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_STATE',
          message: `This amendment is already ${amendment.approvalState.toLowerCase()}, so there is nothing to decide`,
        },
      },
      { status: 409 }
    )
  }

  // Nobody approves their own rate rise.
  const assessment = assessRateChange(amendment.previousRate ?? 0, amendment.rate)
  if (amendment.changedById === caller.person.id && assessment.direction === 'INCREASE') {
    return NextResponse.json(
      {
        error: {
          code: 'SELF_APPROVAL',
          message: 'You proposed this increase, so it is not yours to approve. Send it to somebody else.',
        },
      },
      { status: 403 }
    )
  }

  const now = new Date()
  const updated = await prisma.rateHistory.update({
    where: { id },
    data: {
      approvalState: action === 'approve' ? 'APPROVED' : 'REJECTED',
      approvedById: caller.person.id,
      approvedAt: now,
      // The decision is appended rather than replacing why it was proposed.
      reason: reason
        ? `${amendment.reason ?? ''}${amendment.reason ? ' · ' : ''}${action === 'approve' ? 'Approved' : 'Rejected'}: ${String(reason).trim()}`
        : amendment.reason,
    },
  })

  // Which invoices this decision has just changed the answer for. An
  // approval that silently makes three held invoices payable is worth
  // saying out loud.
  const affected = await prisma.invoiceLine.count({
    where: {
      sellContractId: amendment.contractId,
      timesheet: { periodStart: { gte: amendment.fromDate } },
      invoice: { status: { notIn: ['PAID', 'VOID', 'CANCELLED'] } },
    },
  })

  await prisma.automationLog.create({
    data: {
      companyId: caller.company?.id ?? '',
      action: action === 'approve' ? 'RATE_AMENDMENT_APPROVED' : 'RATE_AMENDMENT_REJECTED',
      summary: `${caller.person.name} ${action === 'approve' ? 'approved' : 'rejected'} a rate change to $${Math.round(amendment.rate / 100)}/hr effective ${amendment.fromDate.toISOString().slice(0, 10)}`,
      reason: assessment.reason,
      payload: {
        rateHistoryId: id,
        contractId: amendment.contractId,
        fromCents: amendment.previousRate,
        toCents: amendment.rate,
        effectiveFrom: amendment.fromDate.toISOString(),
        invoiceLinesAffected: affected,
      },
      // An approval can be withdrawn while nothing has been paid against it.
      reversible: action === 'approve',
    },
  })

  void emit({
    type: action === 'approve' ? 'rate.amendment_approved' : 'rate.amendment_rejected',
    companyId: caller.company?.id ?? null,
    subjectType: 'RateHistory',
    subjectId: id,
    actorPersonId: caller.person.id,
    payload: {
      contractId: amendment.contractId,
      fromCents: amendment.previousRate,
      toCents: amendment.rate,
      effectiveFrom: amendment.fromDate.toISOString(),
      invoiceLinesAffected: affected,
    },
  })

  return NextResponse.json({
    data: {
      id,
      action,
      approvalState: updated.approvalState,
      rate: amendment.rate / 100,
      effectiveFrom: amendment.fromDate.toISOString().slice(0, 10),
      decidedBy: caller.person.name,
      invoiceLinesAffected: affected,
      message: action === 'approve'
        ? affected > 0
          ? `Approved. $${Math.round(amendment.rate / 100)}/hr applies from ${amendment.fromDate.toISOString().slice(0, 10)}, and ${affected} unpaid invoice line(s) now bill at it.`
          : `Approved. $${Math.round(amendment.rate / 100)}/hr applies from ${amendment.fromDate.toISOString().slice(0, 10)}.`
        : `Rejected. The contracted rate is unchanged, so invoices billing the new rate will keep failing the price check.`,
    },
  })
}
