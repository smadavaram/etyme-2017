import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { settlementPlan, settlementBalances, type OrderStatus, type Posting } from '@/lib/order'
import { postSettlement } from '@/lib/order-postings'

/**
 * Settlement and close — where a finished project's balance goes.
 *
 * ── Half of this control already existed ─────────────────────────────
 *
 * `order-postings.ts` has always refused to write into a SETTLED order:
 * posting into a period somebody has already reported silently changes a
 * number that has left the building. What was missing was the act that
 * makes an order settled in the first place, so the refusal guarded a
 * state nothing could reach.
 *
 * ── Always a pair ────────────────────────────────────────────────────
 *
 * Moving a balance is two postings: the amount out of the order and the
 * same amount into wherever it went. Writing only the first makes money
 * disappear from the group's books — it balances on the order and on
 * nothing above it. The pair also means the movement is visible from both
 * ends, which is the question a controller actually asks at year end:
 * what arrived in this cost centre, and from where.
 *
 * ── And LOCKED, which is the state finance actually works in ─────────
 *
 * Books close on the 5th and corrections to the month just closed keep
 * arriving for a fortnight. LOCKED means no new work posts here and
 * corrections still may. Most systems make people fake it by leaving the
 * period open, which is how a closed month quietly changes.
 */

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Closing an order')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'An order belongs to a company' } },
      { status: 403 }
    )
  }
  // Closing a period is a controller's act, gated with the figure it
  // moves rather than with the screen it appears on.
  if (!hasPermission(caller.permissions, 'pnl.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Locking or settling an order is a controller’s decision.',
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const body = await request.json().catch(() => ({}))
  const projectOrderId = String(body.projectOrderId ?? '')
  const action = String(body.action ?? '')
  const dryRun = body.dryRun === true

  if (!projectOrderId || !['lock', 'unlock', 'settle', 'close'].includes(action)) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Which order, and one of lock, unlock, settle or close?',
          field: projectOrderId ? 'action' : 'projectOrderId',
        },
      },
      { status: 422 }
    )
  }

  const order = await prisma.projectOrder.findUnique({
    where: { id: projectOrderId },
    select: {
      id: true, companyId: true, code: true, name: true, status: true, currency: true,
      settledAt: true,
      settlesTo: { select: { id: true, code: true, name: true } },
      postings: {
        where: {},
        select: {
          id: true, kind: true, amountCents: true, currency: true, postedAt: true,
          says: true, reversalOfId: true, settledAt: true, settledCents: true,
        },
        take: 20_000,
      },
    },
  })

  if (!order || order.companyId !== companyId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such order here' } },
      { status: 404 }
    )
  }

  const status = order.status as OrderStatus

  // ── Lock and unlock ─────────────────────────────────────────────────

  if (action === 'lock' || action === 'unlock') {
    if (status === 'SETTLED' || status === 'CLOSED') {
      return NextResponse.json(
        {
          error: {
            code: 'ALREADY_SETTLED',
            message:
              `This order is ${status.toLowerCase()}. Its balance has already moved out, so ` +
              `there is no month left to open or close.`,
          },
        },
        { status: 422 }
      )
    }

    const next = action === 'lock' ? 'LOCKED' : 'OPEN'
    await prisma.projectOrder.update({ where: { id: projectOrderId }, data: { status: next } })

    await prisma.automationLog.create({
      data: {
        companyId,
        action: action === 'lock' ? 'ORDER_LOCKED' : 'ORDER_UNLOCKED',
        summary: `${order.code} ${action === 'lock' ? 'locked' : 'reopened'}`,
        reason: body.reason ? String(body.reason) : `By ${caller.person.name}`,
        payload: { projectOrderId, from: status, to: next },
        reversible: true,
      },
    })

    return NextResponse.json({
      data: {
        projectOrderId,
        status: next,
        note:
          action === 'lock'
            ? 'Locked. No new work posts here and corrections still may — which is the ' +
              'state a finance team actually operates in for the fortnight after a month end.'
            : 'Reopened. New work posts here again.',
      },
    })
  }

  // ── Settle ──────────────────────────────────────────────────────────

  const closingOn = body.closingOn ? new Date(String(body.closingOn)) : new Date()
  if (Number.isNaN(closingOn.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'That closing date could not be read', field: 'closingOn' } },
      { status: 422 }
    )
  }

  const postings: Posting[] = order.postings.map((p) => ({
    id: p.id,
    kind: p.kind as Posting['kind'],
    amountCents: p.amountCents,
    postedAt: p.postedAt,
    says: p.says,
    reversalOfId: p.reversalOfId,
    currency: p.currency,
    settledAt: p.settledAt,
    settledCents: p.settledCents,
  }))

  const plan = settlementPlan({
    status,
    settlesToCode: order.settlesTo?.code ?? null,
    settlesToName: order.settlesTo?.name ?? null,
    currency: order.currency,
    postings,
    closingOn,
  })

  if (action === 'close' && !plan.ok && plan.refusal === 'NOTHING_TO_MOVE') {
    // An order that nets to nothing needs no settlement pair. Two rows
    // moving zero would be noise in the ledger for ever.
    await prisma.projectOrder.update({
      where: { id: projectOrderId },
      data: { status: 'CLOSED', settledAt: closingOn },
    })
    return NextResponse.json({
      data: { projectOrderId, status: 'CLOSED', balanceCents: 0, note: plan.says },
    })
  }

  if (!plan.ok) {
    return NextResponse.json(
      { error: { code: plan.refusal!, message: plan.says } },
      { status: 422 }
    )
  }

  if (dryRun) {
    return NextResponse.json({
      data: {
        projectOrderId,
        preview: true,
        balanceCents: plan.balanceCents,
        settlesTo: order.settlesTo,
        postings: plan.postings,
        postedAt: plan.postedAt,
        note: plan.says,
      },
    })
  }

  if (!settlementBalances(plan.postings)) {
    // Belt and braces. A settlement that does not net to nothing is a
    // half-movement, and a half-movement is money created or destroyed.
    return NextResponse.json(
      {
        error: {
          code: 'UNBALANCED',
          message:
            'The settlement pair does not net to nothing. Nothing has been written — a ' +
            'half-movement is money created or destroyed on the way out of an order.',
        },
      },
      { status: 500 }
    )
  }

  // Where the cost centre has an order of its own to collect into, the
  // other leg lands there. Where it has none, both legs sit on this order
  // so the pair still nets to nothing rather than half a movement.
  const collector = order.settlesTo
    ? await prisma.projectOrder.findFirst({
        where: { companyId, isOverheadPool: true, currency: order.currency },
        select: { id: true },
      })
    : null

  const written = await prisma.$transaction(async (tx) => {
    const pair = await postSettlement({
      projectOrderId,
      settlesToProjectOrderId: collector?.id ?? null,
      companyId,
      balanceCents: plan.balanceCents,
      currency: order.currency,
      postedAt: plan.postedAt!,
      saysOut: plan.postings[0].says,
      saysIn: plan.postings[1].says,
      createdById: realPersonId(caller),
    })

    await tx.projectOrder.update({
      where: { id: projectOrderId },
      data: { status: action === 'close' ? 'CLOSED' : 'SETTLED', settledAt: closingOn },
    })

    await tx.automationLog.create({
      data: {
        companyId,
        action: 'ORDER_SETTLED',
        summary:
          `${order.code} settled — ${(plan.balanceCents / 100).toFixed(2)} ${order.currency} ` +
          `to ${order.settlesTo?.code ?? 'its cost centre'}`,
        reason: body.reason ? String(body.reason) : `Closed by ${caller.person.name}`,
        payload: {
          projectOrderId,
          balanceCents: plan.balanceCents,
          settlesToId: order.settlesTo?.id ?? null,
          collectedIntoOrderId: collector?.id ?? null,
          postedAt: plan.postedAt!.toISOString(),
        },
        // Reversed by a matching pair the other way, which is its own
        // decision in its own period. Not an undo button.
        reversible: false,
      },
    })

    return pair
  })

  return NextResponse.json(
    {
      data: {
        projectOrderId,
        status: action === 'close' ? 'CLOSED' : 'SETTLED',
        balanceCents: plan.balanceCents,
        settledAt: closingOn.toISOString(),
        postings: written.map((p) => ({ id: p.id, amountCents: p.amountCents, says: p.says })),
        note:
          plan.says +
          (collector
            ? ''
            : ' The cost centre has no order of its own to collect into, so both legs sit ' +
              'on this order — the pair still nets to nothing, which is what stops a ' +
              'settlement creating or destroying money on the way out.'),
      },
    },
    { status: 201 }
  )
}
