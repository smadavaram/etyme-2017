import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_CURRENCY, rate } from '@/lib/money-display'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { isConsultantSeat } from '@/lib/seat'
import { lineFor, settleApproved, payPeriodsReached } from '@/lib/rate-line'
import { assessRateChange } from '@/lib/contract-rate'
import { proposeBackPay } from '@/lib/money/back-pay'

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
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Deciding a rate change',
            needs: ['rates.write', 'assignments.write'],
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
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

  // ── Only a desk at a party to the line decides it ────────────────────
  //
  // This checked the permission and nothing else, so a firm that was
  // party to nothing approved a rate somebody else's stranger had
  // written on a third firm's contract, and the approval stood. The
  // desks that decide a rate are at the two firms the rate is between.
  // A stranger is told there is nothing here, the same as for a row
  // that does not exist.
  const line = await lineFor(amendment.contractType, amendment.contractId)
  const mine = caller.company?.id ?? null
  if (!line || !mine || isConsultantSeat(caller) || !line.parties.includes(mine)) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_FOUND',
          message:
            'There is no rate change here on a contract your company is a party to. ' +
            'A rate is decided only by the firms it is between.',
        },
      },
      { status: 404 }
    )
  }

  if (amendment.contractType.toUpperCase() === 'BUY' && !hasPermission(caller.permissions, 'consultants.cost')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Deciding what somebody is paid',
            needs: 'consultants.cost',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  // Which currency this rate is in. `RateHistory` carries a rate and no
  // currency, and `contractId` is polymorphic, so the contract it amends
  // is the only place the answer lives.
  const currency = line.currency ?? DEFAULT_CURRENCY

  // Nobody approves their own rate change. It was only a rise, on the
  // reasoning that a cut costs nobody — but a change that reached this
  // desk is one that needed a second person, and the proposer is the one
  // person who is not a second person. Withdrawing your own proposal is
  // still yours to do, which is a rejection.
  const assessment = assessRateChange(amendment.previousRate ?? 0, amendment.rate, currency)
  if (amendment.changedById === caller.person.id && action === 'approve') {
    return NextResponse.json(
      {
        error: {
          code: 'SELF_APPROVAL',
          message:
            assessment.direction === 'INCREASE'
              ? 'You proposed this increase, so it is not yours to approve. Send it to somebody else.'
              : 'You proposed this change, so it is not yours to approve. Send it to somebody else.',
        },
      },
      { status: 403 }
    )
  }

  const now = new Date()
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.rateHistory.update({
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
    // An approved change takes its place in the line's history: what was
    // in force closes the day before it, and where nothing was written
    // down, the line's own rate becomes the opening row. The line's
    // recorded rate is never overwritten (lib/rate-line).
    if (action === 'approve') await settleApproved(tx, row, line, caller.person.id)
    return row
  })

  const onBuy = amendment.contractType.toUpperCase() === 'BUY'

  // Which invoices this decision has just changed the answer for. An
  // approval that silently makes three held invoices payable is worth
  // saying out loud. On a pay line there are no invoice lines to count:
  // what a pay change reaches is pay periods, and whether any of them
  // were already paid at the old rate.
  const affected = onBuy
    ? 0
    : await prisma.invoiceLine.count({
        where: {
          sellContractId: amendment.contractId,
          timesheet: { periodStart: { gte: amendment.fromDate } },
          invoice: { status: { notIn: ['PAID', 'VOID', 'CANCELLED'] } },
        },
      })
  const reached = onBuy && action === 'approve'
    ? await payPeriodsReached(amendment.contractId, amendment.fromDate, amendment.toDate)
    : []
  const paidAlready = reached.filter((p) => p.paid)
  // Where a period was already paid at the old rate, the difference is
  // worked out and proposed — never paid. A payroll desk approves it as
  // an off-cycle payment (lib/money/back-pay).
  const backPay = onBuy && action === 'approve' && paidAlready.length > 0 ? await proposeBackPay(id) : null

  await prisma.automationLog.create({
    data: {
      companyId: caller.company?.id ?? '',
      action: action === 'approve' ? 'RATE_AMENDMENT_APPROVED' : 'RATE_AMENDMENT_REJECTED',
      summary: `${caller.person.name} ${action === 'approve' ? 'approved' : 'rejected'} a rate change to ${rate(amendment.rate, currency)} effective ${amendment.fromDate.toISOString().slice(0, 10)}`,
      reason: assessment.reason,
      payload: {
        rateHistoryId: id,
        contractId: amendment.contractId,
        fromCents: amendment.previousRate,
        toCents: amendment.rate,
        effectiveFrom: amendment.fromDate.toISOString(),
        invoiceLinesAffected: affected,
        payPeriodsAffected: reached.map((p) => p.label),
        backPayProposedCents: backPay?.applies ? backPay.figure.totalCents : null,
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
      // On a pay line: every pay period the change reaches with hours in
      // it, and whether a run already paid it at the old rate.
      payPeriodsAffected: onBuy ? reached : null,
      // What is owed on days already paid at the old rate, proposed for a
      // payroll desk to approve. Null where nothing was paid yet.
      backPay: backPay
        ? backPay.applies
          ? {
              totalCents: backPay.figure.totalCents,
              currency: backPay.currency,
              weeks: backPay.figure.weeks,
              payments: backPay.figure.periods.map((p) => ({
                periodStart: p.periodStart, label: p.label, amountCents: p.amountCents,
                sellContractId: p.sellContractId, personId: p.personId, weeks: p.weeks,
              })),
              says: backPay.says,
            }
          : { totalCents: null, currency, weeks: [], payments: [], says: backPay.says }
        : null,
      message: action === 'approve'
        ? onBuy
          ? reached.length === 0
            ? `Approved. ${rate(amendment.rate, currency)} is paid from ${amendment.fromDate.toISOString().slice(0, 10)}. No hours worked since then yet.`
            : `Approved. ${rate(amendment.rate, currency)} is paid from ${amendment.fromDate.toISOString().slice(0, 10)}, which reaches ` +
              `${reached.length} pay period${reached.length === 1 ? '' : 's'} already worked: ${reached.map((p) => p.label).join(', ')}.` +
              (paidAlready.length > 0
                ? ` ${paidAlready.map((p) => p.label).join(', ')} ${paidAlready.length === 1 ? 'was' : 'were'} already paid at the old rate. ` +
                  (backPay?.says ?? '')
                : ' None of them has been paid yet, so each is paid at the new rate when it runs.')
          : affected > 0
          ? `Approved. ${rate(amendment.rate, currency)} applies from ${amendment.fromDate.toISOString().slice(0, 10)}, and ${affected} unpaid invoice ${affected === 1 ? 'line now bills' : 'lines now bill'} at it.`
          : `Approved. ${rate(amendment.rate, currency)} applies from ${amendment.fromDate.toISOString().slice(0, 10)}.`
        : `Rejected. The contracted rate is unchanged, so invoices billing the new rate will keep failing the price check.`,
    },
  })
}
