import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { ladderFor, rateWords } from '@/lib/billing-cascade'

/**
 * GET  /api/purchase-orders/:id/discounts — the rungs on this order
 * POST /api/purchase-orders/:id/discounts — agree one
 *
 * "2/10 net 30" — two per cent off if it is settled within ten days. The
 * rungs live on the document they were agreed in: the agreement carries
 * the standing ladder, and an order narrows it for its own spend.
 *
 * ── Whose to say ─────────────────────────────────────────────────────
 *
 * The company that raised the order. A purchase order belongs to whoever
 * pays, and the discount on it is what the payer gets for paying early —
 * so the supplier being paid may read it and never write it. A rate a
 * counterparty could set on your own order is a rate nobody agreed to.
 *
 * ── What it refuses ──────────────────────────────────────────────────
 *
 * A rung with no discount on it, which is not a term. And anything above
 * ten per cent, which at prompt-payment scale is a renegotiation wearing
 * a discount's clothes — one and two are ordinary, three is generous,
 * and thirty is a typo somebody would have honored.
 *
 * Zero days is not refused, and is the point: net zero is settlement on
 * the day, and it carries the best rate precisely because it is hardest
 * to hit.
 */

const CAP_BPS = 1_000

async function mine(id: string, companyId: string) {
  return prisma.workOrder.findFirst({
    where: { id, OR: [{ issuedById: companyId }, { issuedToId: companyId }] },
    select: {
      id: true, number: true, issuedById: true,
      issuedTo: { select: { name: true } },
      issuedBy: { select: { name: true } },
    },
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Purchase orders belong to a company' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'invoices.read')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Seeing purchase orders needs invoices.read' } },
      { status: 403 }
    )
  }

  const { id } = await params
  const po = await mine(id, caller.company.id)
  if (!po) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Purchase order not found' } },
      { status: 404 }
    )
  }

  const rows = await prisma.earlyPaymentDiscount.findMany({
    where: { workOrderId: id },
    orderBy: { withinDays: 'asc' },
  })
  const ladder = ladderFor({ order: rows })

  return NextResponse.json({
    data: {
      workOrder: { id: po.id, number: po.number },
      rungs: ladder.rungs,
      says: ladder.says,
      // Only the payer sets them. The supplier reads what it has been
      // offered and cannot change it.
      mayAgree:
        po.issuedById === caller.company.id &&
        hasPermission(caller.permissions, 'invoices.issue'),
    },
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Purchase orders belong to a company' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Agreeing payment terms needs invoices.issue' } },
      { status: 403 }
    )
  }

  const { id } = await params
  const po = await mine(id, caller.company.id)
  if (!po) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Purchase order not found' } },
      { status: 404 }
    )
  }

  if (po.issuedById !== caller.company.id) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_THE_PAYER',
          message:
            `${po.number} is ${po.issuedBy.name}'s order. The discount on it is what they get ` +
            'for paying early, so it is theirs to agree and yours to read.',
        },
      },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const withinDays = Number(body.withinDays)
  const discountBps = Number(body.discountBps)

  if (!Number.isInteger(withinDays) || withinDays < 0 || withinDays > 365) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          field: 'withinDays',
          message: 'A discount window is a whole number of days, from zero — settlement on the day — to a year.',
        },
      },
      { status: 422 }
    )
  }

  if (!Number.isInteger(discountBps) || discountBps <= 0) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          field: 'discountBps',
          message:
            'A rung with nothing off it is not a term. Say what comes off for paying by then, ' +
            'in basis points — 200 is two per cent.',
        },
      },
      { status: 422 }
    )
  }

  if (discountBps > CAP_BPS) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          field: 'discountBps',
          message:
            `${rateWords(discountBps)} is not a prompt-payment discount, it is a renegotiation. ` +
            'One or two per cent is ordinary and three is generous. Check the number.',
        },
      },
      { status: 422 }
    )
  }

  try {
    const row = await prisma.earlyPaymentDiscount.upsert({
      // One rate per window per document — a second rung at ten days
      // would mean two answers to one question, so agreeing it again
      // moves the rate rather than stacking.
      where: { workOrderId_withinDays: { workOrderId: id, withinDays } },
      create: {
        workOrderId: id,
        withinDays,
        discountBps,
        note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
      },
      update: {
        discountBps,
        ...(typeof body.note === 'string' && body.note.trim() ? { note: body.note.trim() } : {}),
      },
    })

    const rows = await prisma.earlyPaymentDiscount.findMany({
      where: { workOrderId: id },
      orderBy: { withinDays: 'asc' },
    })
    const ladder = ladderFor({ order: rows })

    return NextResponse.json(
      {
        data: {
          rung: { id: row.id, withinDays: row.withinDays, discountBps: row.discountBps, note: row.note },
          rungs: ladder.rungs,
          says:
            `${rateWords(discountBps)} off ${po.number} for settling within ` +
            `${withinDays === 0 ? 'the day' : `${withinDays} days`}, agreed with ${po.issuedTo.name}.`,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    reportError('Agreeing an early-payment discount failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Could not record the discount' } },
      { status: 500 }
    )
  }
}
