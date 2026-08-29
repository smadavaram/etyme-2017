import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import {
  proposeRun, remittanceAdvice, mayApproveRun, applyRunPayment,
  type PayableBill,
} from '@/lib/ap-delay'

/**
 * Payment runs — how money actually leaves.
 *
 * Not one bill at a time with a date typed on it. In batches: one
 * currency, one day, one file to the bank, one remittance advice per
 * supplier. Everything in `ap-delay.ts` measures `VendorBill.paidAt` and
 * until now nothing set it except a clerk.
 *
 * ── Four refusals, and they are refusals rather than warnings ────────
 *
 * **One currency per run**, because a run is a payment file and a file is
 * denominated. A total across two currencies is a total of nothing, and
 * the place it would be discovered is the bank rejecting the file.
 *
 * **A bill enters one run at a time.** The schema carries the unique key
 * and `proposeRun` says it in words before the database has to.
 *
 * **A disputed bill never enters a run.** Paying something you are
 * arguing about ends the argument in the supplier's favour and no status
 * change undoes it.
 *
 * **The approver is not the creator.** The oldest segregation of duties
 * there is: one person who can both assemble and release a payment file
 * is the entire control on money leaving the building.
 *
 * ── And every exclusion carries a reason ─────────────────────────────
 *
 * A bill that silently misses a run is a supplier who telephones, and
 * "it was not picked up" is not an answer anybody can act on.
 */

/** GET — what a run scheduled for a given day would contain. */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Payment runs')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A payment run belongs to whoever pays' } },
      { status: 403 }
    )
  }
  if (
    !caller.permissions.includes('margin.read') &&
    !caller.permissions.includes('pnl.read')
  ) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'You cannot see what the firm is about to pay.' } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const url = new URL(request.url)
  const currency = (url.searchParams.get('currency') ?? 'USD').toUpperCase()
  const scheduledFor = url.searchParams.get('scheduledFor')
    ? new Date(String(url.searchParams.get('scheduledFor')))
    : new Date()

  if (Number.isNaN(scheduledFor.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'That date could not be read', field: 'scheduledFor' } },
      { status: 422 }
    )
  }

  const { payable, runs } = await loadPayable(companyId)
  const proposed = proposeRun(payable, currency, scheduledFor)

  return NextResponse.json({
    data: {
      currencies: [...new Set(payable.map((b) => b.currency.toUpperCase()))].sort(),
      proposed: {
        currency: proposed.currency,
        scheduledFor: proposed.scheduledFor,
        totalCents: proposed.totalCents,
        vendors: proposed.vendors,
        lines: proposed.lines,
        excluded: proposed.excluded.map((e) => ({
          billId: e.bill.id,
          number: e.bill.number,
          vendorName: e.bill.vendorName,
          totalCents: e.bill.totalCents,
          reason: e.reason,
          says: e.says,
        })),
        says: proposed.says,
      },
      advice: remittanceAdvice(proposed, caller.company.name),
      runs,
      note:
        'One currency, one day, one advice per supplier. A bill that misses a run is ' +
        'listed with the reason — "it was not picked up" is not an answer anybody can act on.',
    },
  })
}

/** POST — assemble a draft run. */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Payment runs')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A payment run belongs to whoever pays' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'payments.record')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Assembling a payment run needs payments.record' } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const body = await request.json().catch(() => ({}))
  const currency = String(body.currency ?? 'USD').toUpperCase()
  const scheduledFor = body.scheduledFor ? new Date(String(body.scheduledFor)) : new Date()

  if (Number.isNaN(scheduledFor.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'That date could not be read', field: 'scheduledFor' } },
      { status: 422 }
    )
  }

  const { payable } = await loadPayable(companyId)
  const proposed = proposeRun(payable, currency, scheduledFor)

  if (proposed.lines.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOTHING_TO_PAY', message: proposed.says } },
      { status: 422 }
    )
  }

  // Only the bills somebody asked for, where they asked for a subset.
  const only: string[] | null = Array.isArray(body.billIds)
    ? body.billIds.map((s: unknown) => String(s))
    : null
  const lines = only ? proposed.lines.filter((l) => only.includes(l.billId)) : proposed.lines

  if (lines.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: 'NOTHING_TO_PAY',
          message:
            'None of the bills named are payable in this run. Every one of them is on the ' +
            'excluded list with a reason.',
        },
      },
      { status: 422 }
    )
  }

  const total = lines.reduce((n, l) => n + l.amountCents, 0)
  const advice = remittanceAdvice({ ...proposed, lines }, caller.company.name)
  const adviceByVendor = new Map(advice.map((a) => [a.vendorCompanyId, a.text]))

  const run = await prisma.paymentRun.create({
    data: {
      companyId,
      currency: proposed.currency,
      status: 'DRAFT',
      scheduledFor,
      totalCents: total,
      createdById: realPersonId(caller),
      items: {
        create: lines.map((l) => ({
          vendorBillId: l.billId,
          amountCents: l.amountCents,
          remittance: adviceByVendor.get(l.vendorCompanyId) ?? null,
        })),
      },
    },
    select: {
      id: true, currency: true, status: true, scheduledFor: true, totalCents: true,
      items: { select: { id: true, vendorBillId: true, amountCents: true } },
    },
  })

  return NextResponse.json(
    {
      data: {
        run,
        advice,
        note:
          `Draft run of ${lines.length} bill${lines.length === 1 ? '' : 's'} in ` +
          `${proposed.currency}. It releases nothing until somebody other than you ` +
          `approves it — one person who can both assemble and release a payment file is ` +
          `the entire control on money leaving the building.`,
      },
    },
    { status: 201 }
  )
}

/** PATCH — approve a draft, or mark an approved run paid. */
export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Payment runs')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A payment run belongs to whoever pays' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'payments.record')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Releasing a payment run needs payments.record' } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const body = await request.json().catch(() => ({}))
  const id = String(body.id ?? '')
  const action = String(body.action ?? '')

  if (!id || !['approve', 'pay', 'cancel'].includes(action)) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Which run, and one of approve, pay or cancel?',
          field: id ? 'action' : 'id',
        },
      },
      { status: 422 }
    )
  }

  const run = await prisma.paymentRun.findUnique({
    where: { id },
    select: {
      id: true, companyId: true, status: true, currency: true, createdById: true,
      scheduledFor: true, totalCents: true,
      items: {
        select: {
          vendorBillId: true, amountCents: true,
          vendorBill: { select: { id: true, totalCents: true, paidCents: true, receivedAt: true } },
        },
      },
    },
  })
  if (!run || run.companyId !== companyId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such payment run here' } },
      { status: 404 }
    )
  }

  const personId = realPersonId(caller)

  if (action === 'cancel') {
    if (run.status === 'PAID') {
      return NextResponse.json(
        {
          error: {
            code: 'ALREADY_PAID',
            message:
              'The money has gone. Cancelling the run would not bring it back — record a ' +
              'refund or a credit from the supplier instead.',
          },
        },
        { status: 422 }
      )
    }
    await prisma.paymentRun.update({ where: { id }, data: { status: 'CANCELLED' } })
    return NextResponse.json({
      data: { id, status: 'CANCELLED', note: 'Cancelled. Every bill in it is payable again.' },
    })
  }

  if (action === 'approve') {
    const verdict = mayApproveRun({ status: run.status, createdById: run.createdById }, personId ?? '')
    if (!verdict.ok) {
      return NextResponse.json(
        { error: { code: 'SEGREGATION', message: verdict.says } },
        { status: 422 }
      )
    }
    const updated = await prisma.paymentRun.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: personId },
      select: { id: true, status: true, totalCents: true, currency: true },
    })
    return NextResponse.json({
      data: {
        run: updated,
        note:
          `Approved by somebody other than whoever assembled it. Nothing is paid until the ` +
          `run is marked paid — approval is a decision, not a transfer.`,
      },
    })
  }

  // action === 'pay'
  if (run.status !== 'APPROVED') {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_APPROVED',
          message:
            `This run is ${run.status.toLowerCase()}. Money leaves on an approved run and ` +
            `on nothing else.`,
        },
      },
      { status: 422 }
    )
  }

  const paidAt = body.paidAt ? new Date(String(body.paidAt)) : new Date()
  if (Number.isNaN(paidAt.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'That paidAt could not be read', field: 'paidAt' } },
      { status: 422 }
    )
  }

  const outcomes = applyRunPayment(
    run.items.map((i) => ({ billId: i.vendorBillId, amountCents: i.amountCents })),
    run.items.map((i) => i.vendorBill),
    paidAt
  )

  await prisma.$transaction(async (tx) => {
    for (const o of outcomes) {
      await tx.vendorBill.update({
        where: { id: o.billId },
        data: { paidCents: o.paidCentsAfter, paidAt: o.paidAt, status: o.status },
      })
    }
    await tx.paymentRun.update({ where: { id }, data: { status: 'PAID', paidAt } })
  })

  const settled = outcomes.filter((o) => o.paidAt != null).length

  return NextResponse.json({
    data: {
      id,
      status: 'PAID',
      paidAt: paidAt.toISOString(),
      bills: outcomes.length,
      settled,
      note:
        `${settled} of ${outcomes.length} bill${outcomes.length === 1 ? '' : 's'} settled in ` +
        `full and carry the paid date. A part payment carries none — the obligation is ` +
        `still open, and dating it now would report the first instalment as the day the ` +
        `supplier was paid, which is the figure every float number counts to.`,
    },
  })
}

// ── Shared loading ────────────────────────────────────────────────────

async function loadPayable(companyId: string) {
  const [bills, liveRuns] = await Promise.all([
    prisma.vendorBill.findMany({
      where: { companyId, status: { notIn: ['CANCELLED'] } },
      select: {
        id: true, number: true, currency: true, totalCents: true, paidCents: true,
        dueAt: true, status: true,
        vendorCompany: { select: { id: true, name: true } },
        paymentRunItems: {
          where: { run: { status: { in: ['DRAFT', 'APPROVED'] } } },
          select: { runId: true },
        },
      },
      orderBy: { dueAt: 'asc' },
      take: 5_000,
    }),
    prisma.paymentRun.findMany({
      where: { companyId },
      select: {
        id: true, currency: true, status: true, scheduledFor: true, paidAt: true,
        totalCents: true,
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  const payable: PayableBill[] = bills.map((b) => ({
    id: b.id,
    number: b.number,
    vendorCompanyId: b.vendorCompany.id,
    vendorName: b.vendorCompany.name,
    currency: b.currency,
    totalCents: b.totalCents,
    paidCents: b.paidCents,
    dueAt: b.dueAt,
    status: b.status,
    inRunId: b.paymentRunItems[0]?.runId ?? null,
  }))

  return { payable, runs: liveRuns }
}
