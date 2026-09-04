import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { mayDeliver, mayDeliverAs } from '../../acceptance'

/**
 * POST /api/program/milestones/[id]/deliver
 *
 * "Here it is." The step that was missing in front of `acceptedAt`, which
 * was a column nothing wrote to.
 *
 * ── Why it refuses a second submission ───────────────────────────────
 *
 * Handing the same thing over twice resets the clock on how long the
 * client has had it, and that clock is the only number this flow produces
 * that nobody else can compute. A resubmission after a rejection is a
 * different thing and is allowed — the rejection is what stops the count.
 *
 * ── What is not recorded, and should be ──────────────────────────────
 *
 * When. `OrderMilestone` has no `deliveredAt`, so this writes a status and
 * the date is lost. Nothing here substitutes `createdAt` for it. The
 * columns are named at the bottom of `acceptance.ts`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'You must belong to a company.' } },
      { status: 403 }
    )
  }

  const milestone = await prisma.orderMilestone.findUnique({
    where: { id },
    select: {
      id: true, name: true, amountCents: true, dueOn: true,
      acceptedAt: true, status: true,
      order: {
        select: { id: true, companyId: true, soldToId: true, billToId: true, payerId: true, soldTo: { select: { name: true } } },
      },
    },
  })

  if (!milestone) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such milestone.' } },
      { status: 404 }
    )
  }

  const may = mayDeliverAs(companyId, {
    sellerCompanyId: milestone.order.companyId,
    clientCompanyIds: [milestone.order.soldToId, milestone.order.billToId, milestone.order.payerId]
      .filter((x): x is string => !!x),
  })
  if (!may.ok) {
    return NextResponse.json({ error: { code: 'NOT_YOURS', message: may.says } }, { status: 403 })
  }

  const move = mayDeliver({
    id: milestone.id,
    name: milestone.name,
    amountCents: milestone.amountCents,
    dueOn: milestone.dueOn,
    acceptedAt: milestone.acceptedAt,
    deliveredAt: null,
    status: milestone.status,
  })

  if (!move.ok) {
    return NextResponse.json(
      { error: { code: 'CANNOT_DELIVER', message: move.says } },
      { status: 409 }
    )
  }

  const saved = await prisma.orderMilestone.update({
    where: { id },
    data: {
      status: move.status,
      // The columns exist now, so the gap arithmetic gets real dates.
      deliveredAt: new Date(),
      deliveredById: caller.person.id,
      // A resubmission after a rejection clears the old reason. Leaving it
      // would show a milestone waiting on the client and rejected at the
      // same time, which is two different states in one row.
      rejectedAt: null,
      rejectionReason: null,
      note: null,
    },
    select: { id: true, name: true, status: true, amountCents: true },
  })

  return NextResponse.json({
    data: {
      ...saved,
      says: `${saved.name} submitted to ${milestone.order.soldTo.name} for acceptance.`,
      // Reported rather than swallowed. A caller building on this needs to
      // know the clock is not running.
      unknowns: ['No delivery date was recorded — OrderMilestone has no column for one.'],
    },
  })
}
