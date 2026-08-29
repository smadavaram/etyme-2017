import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { mayBill } from '@/lib/billing-plan'
import {
  acceptanceGap,
  decodeRejection,
  humanNote,
  lateness,
  mayDecideAs,
  mayDeliverAs,
  standing,
  type Milestone,
} from './acceptance'

/**
 * GET  /api/program/milestones   — what has been handed over, and what is waiting
 * POST /api/program/milestones   — add a deliverable to an order
 *
 * ── The gap this exists to show ──────────────────────────────────────
 *
 * Delivered, accepted, invoiced, paid. Every ageing report in this
 * industry starts at "invoiced", and on a milestone-billed project the
 * invoice cannot exist until the client accepts. So the weeks between
 * handing something over and somebody agreeing it was handed over are
 * invisible, and they are usually the largest single piece of working
 * capital on the engagement.
 *
 * ── What is honestly missing ─────────────────────────────────────────
 *
 * `OrderMilestone` has no `deliveredAt`. The gap arithmetic is written and
 * tested; there is nowhere to read the delivery date from, so it comes
 * back null with the reason said rather than substituted from `createdAt`.
 * Four columns would finish it and they are named at the bottom of
 * `acceptance.ts`.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'You must belong to a company.' } },
      { status: 403 }
    )
  }

  const orderId = request.nextUrl.searchParams.get('orderId')

  const orders = await prisma.salesOrder.findMany({
    where: {
      ...(orderId ? { id: orderId } : {}),
      OR: [
        { companyId },
        { soldToId: companyId },
        { billToId: companyId },
        { payerId: companyId },
      ],
    },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      billingBasis: true,
      currency: true,
      ceilingCents: true,
      companyId: true,
      soldToId: true,
      billToId: true,
      payerId: true,
      company: { select: { id: true, name: true } },
      soldTo: { select: { id: true, name: true } },
      milestones: {
        select: {
          id: true, name: true, amountCents: true, dueOn: true,
          acceptedAt: true, acceptedById: true, note: true,
          deliveredAt: true, rejectionReason: true,
          status: true, sortOrder: true, createdAt: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const now = new Date()

  const rows = orders.map((o) => {
    const sides = {
      sellerCompanyId: o.companyId,
      clientCompanyIds: [o.soldToId, o.billToId, o.payerId].filter((x): x is string => !!x),
    }

    const milestones: Milestone[] = o.milestones.map((m) => ({
      id: m.id,
      name: m.name,
      amountCents: m.amountCents,
      dueOn: m.dueOn,
      acceptedAt: m.acceptedAt,
      // The column exists now. Rows from before it stay null and the gap
      // arithmetic says so, rather than backdating them to createdAt.
      deliveredAt: m.deliveredAt,
      status: m.status,
    }))

    const canDeliver = mayDeliverAs(companyId, sides).ok
    const canDecide = mayDecideAs(companyId, sides).ok

    return {
      id: o.id,
      number: o.number,
      title: o.title,
      status: o.status,
      billingBasis: o.billingBasis,
      currency: o.currency,
      ceilingCents: o.ceilingCents,
      seller: o.company,
      client: o.soldTo,
      /** Which side of this order the reader is on. */
      yourRole: companyId === o.companyId ? 'SELLER' : 'CLIENT',
      may: { deliver: canDeliver, decide: canDecide },
      standing: standing(milestones, now),
      milestones: o.milestones.map((m, i) => {
        const pure = milestones[i]
        const rejected = decodeRejection(m.note)
        const gap = acceptanceGap(pure, now)
        const late = lateness(pure, now)
        return {
          id: m.id,
          name: m.name,
          amountCents: m.amountCents,
          dueOn: m.dueOn?.toISOString() ?? null,
          status: m.status,
          acceptedAt: m.acceptedAt?.toISOString() ?? null,
          acceptedById: m.acceptedById,
          deliveredAt: m.deliveredAt?.toISOString() ?? null,
          note: humanNote(m.note),
          // The real column first; the labelled shadow prefix only for
          // rows written before the column existed.
          rejectionReason: m.rejectionReason ?? rejected?.reason ?? null,
          billable: mayBill(
            { id: m.id, name: m.name, amountCents: m.amountCents, dueOn: m.dueOn, acceptedAt: m.acceptedAt, status: m.status },
            now
          ),
          waited: { days: gap.days, unknowns: gap.unknowns, says: gap.says },
          late: late.late ? { onUs: late.onUs, days: late.days, says: late.says } : null,
        }
      }),
    }
  })

  const everyMilestone = rows.flatMap((r) =>
    r.milestones.map((m) => ({
      id: m.id,
      name: m.name,
      amountCents: m.amountCents,
      dueOn: m.dueOn ? new Date(m.dueOn) : null,
      acceptedAt: m.acceptedAt ? new Date(m.acceptedAt) : null,
      deliveredAt: m.deliveredAt ? new Date(m.deliveredAt) : null,
      status: m.status,
    }))
  )

  return NextResponse.json({
    data: {
      orders: rows,
      // The same split across everything, because a delivery manager
      // running six orders wants one answer to "what is stuck".
      overall: standing(everyMilestone, now),
      // Said out loud rather than left as a suspiciously empty column.
      unknowns:
        everyMilestone.length > 0
          ? ['No delivery date is stored, so how long the client has been sitting on anything cannot be measured.']
          : [],
    },
  })
}

/**
 * A deliverable on an order.
 *
 * Raised by the firm doing the work. A client adding a milestone to
 * somebody else's order is a change to the commercial deal and belongs in
 * a variation, not a POST.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'You must belong to a company.' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const { orderId, name, amountCents, dueOn, sortOrder } = body

  if (typeof orderId !== 'string' || !orderId) return bad('Which order is this on?', 'orderId')
  if (typeof name !== 'string' || name.trim().length < 2) {
    return bad('A milestone needs a name the client will recognise.', 'name')
  }
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    return bad('A milestone is worth a whole number of cents, above zero.', 'amountCents')
  }

  const order = await prisma.salesOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true, companyId: true, soldToId: true, billToId: true, payerId: true,
      billingBasis: true, status: true,
    },
  })

  if (!order) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such order.' } }, { status: 404 })
  }

  const may = mayDeliverAs(companyId, {
    sellerCompanyId: order.companyId,
    clientCompanyIds: [order.soldToId, order.billToId, order.payerId].filter((x): x is string => !!x),
  })
  if (!may.ok) {
    return NextResponse.json({ error: { code: 'NOT_YOURS', message: may.says } }, { status: 403 })
  }

  if (order.status === 'CLOSED' || order.status === 'CANCELLED') {
    return bad(`That order is ${order.status.toLowerCase()}. Nothing more can be delivered under it.`, 'orderId')
  }

  // A milestone on a time-and-materials order will never bill: billing-plan
  // only reads milestones where the basis is MILESTONE or BOTH. Refused
  // rather than created, because a deliverable that silently cannot be
  // invoiced is worse than one that could not be added.
  if (order.billingBasis === 'TIME') {
    return bad(
      'This order bills on time, so a milestone on it would never reach an invoice. Change the basis to MILESTONE or BOTH first.',
      'orderId'
    )
  }

  let due: Date | null = null
  if (dueOn) {
    due = new Date(dueOn)
    if (isNaN(due.getTime())) return bad('That is not a date.', 'dueOn')
  }

  const created = await prisma.orderMilestone.create({
    data: {
      orderId: order.id,
      name: name.trim(),
      amountCents,
      dueOn: due,
      sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
      status: 'PENDING',
    },
    select: { id: true, name: true, amountCents: true, dueOn: true, status: true, sortOrder: true },
  })

  return NextResponse.json(
    {
      data: {
        ...created,
        dueOn: created.dueOn?.toISOString() ?? null,
        says: `${created.name} added. It bills when the client accepts it, not when its date passes.`,
      },
    },
    { status: 201 }
  )
}

function bad(message: string, field: string | null) {
  return NextResponse.json({ error: { code: 'VALIDATION', message, field } }, { status: 400 })
}
