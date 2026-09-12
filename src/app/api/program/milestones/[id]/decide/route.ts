import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { mayBill } from '@/lib/billing-plan'
import {
  REJECTION_REASONS,
  encodeRejection,
  mayDecide,
  mayDecideAs,
  type RejectionReason,
} from '../../acceptance'

/**
 * POST /api/program/milestones/[id]/decide
 *
 * The client's answer: accepted, or rejected with a reason.
 *
 * ── Why a reason is required and why it is a code ────────────────────
 *
 * A rejection with no reason is a state change carrying no information.
 * "Milestone three rejected" tells a delivery manager to send an email.
 * "Rejected on evidence, fourth time this quarter at this client" tells
 * them their acceptance pack is the problem rather than their work — and
 * that second sentence is only possible if the answer came off a button.
 *
 * Twelve months of these, across a supply chain, is the one asset in this
 * product nobody can buy. A text box collects nothing.
 *
 * ── Why the seller cannot click accept ───────────────────────────────
 *
 * The whole worth of `acceptedAt` is that somebody on the other side of
 * the money put their name to it. A system that lets the firm doing the
 * work record its own acceptance has a column that means nothing, and the
 * first time a client asks what they paid for there is no answer.
 *
 * ── Where the reason actually goes today ─────────────────────────────
 *
 * `OrderMilestone` has no `rejectionReason` column, so the code is written
 * into `note` behind a machine prefix and read back with a strict parser.
 * That is a shadow column and it is labelled as one in `acceptance.ts`,
 * along with the four fields that would delete it.
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

  const body = await request.json().catch(() => ({}))
  const accept = body.accept === true
  const reason: string | null = typeof body.reason === 'string' ? body.reason : null
  const note: string | null = typeof body.note === 'string' ? body.note : null

  const milestone = await prisma.orderMilestone.findUnique({
    where: { id },
    select: {
      id: true, name: true, amountCents: true, dueOn: true,
      acceptedAt: true, status: true, note: true,
      order: {
        select: {
          id: true, companyId: true, soldToId: true, billToId: true, payerId: true,
          company: { select: { name: true } },
        },
      },
    },
  })

  if (!milestone) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such milestone.' } },
      { status: 404 }
    )
  }

  const may = mayDecideAs(companyId, {
    sellerCompanyId: milestone.order.companyId,
    clientCompanyIds: [milestone.order.soldToId, milestone.order.billToId, milestone.order.payerId]
      .filter((x): x is string => !!x),
  })
  if (!may.ok) {
    return NextResponse.json({ error: { code: 'NOT_YOURS', message: may.says } }, { status: 403 })
  }

  const move = mayDecide(
    {
      id: milestone.id,
      name: milestone.name,
      amountCents: milestone.amountCents,
      dueOn: milestone.dueOn,
      acceptedAt: milestone.acceptedAt,
      deliveredAt: null,
      status: milestone.status,
    },
    { accept, reason }
  )

  if (!move.ok) {
    return NextResponse.json(
      {
        error: {
          code: accept ? 'CANNOT_ACCEPT' : 'CANNOT_REJECT',
          message: move.says,
          // Handed back so the screen can put the buttons up rather than
          // asking the user to guess what a valid reason looks like.
          reasons: accept ? undefined : REJECTION_REASONS,
        },
      },
      { status: 409 }
    )
  }

  const now = new Date()

  const saved = await prisma.orderMilestone.update({
    where: { id },
    data: accept
      ? {
          status: 'ACCEPTED',
          acceptedAt: now,
          acceptedById: realPersonId(caller),
          note: note && note.trim() ? note.trim() : null,
        }
      : {
          status: 'REJECTED',
          acceptedAt: null,
          acceptedById: null,
          rejectedAt: now,
          // The real column. The labelled shadow prefix in `note` served
          // while this did not exist; rows written that way still decode
          // on read, and nothing writes the prefix any more.
          rejectionReason: reason,
          note: note && note.trim() ? note.trim() : null,
        },
    select: {
      id: true, name: true, amountCents: true, dueOn: true,
      status: true, acceptedAt: true, acceptedById: true,
    },
  })

  return NextResponse.json({
    data: {
      id: saved.id,
      name: saved.name,
      status: saved.status,
      acceptedAt: saved.acceptedAt?.toISOString() ?? null,
      acceptedById: saved.acceptedById,
      reason: accept ? null : reason,
      // Acceptance is what makes it billable, and this says so from the
      // same function the invoice run uses rather than asserting it.
      billable: mayBill(
        {
          id: saved.id,
          name: saved.name,
          amountCents: saved.amountCents,
          dueOn: saved.dueOn,
          acceptedAt: saved.acceptedAt,
          status: saved.status,
        },
        now
      ),
      says: move.says,
    },
  })
}
