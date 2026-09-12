import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { paymentDaysSays, marginFloorSays } from '../verdict'

/**
 * PATCH /api/program/agreements/[id]
 *
 * The terms of a master agreement: payment days, margin floor, headcount
 * cap, currency, and the date somebody actually signed it.
 *
 * ── Why only the vendor ──────────────────────────────────────────────
 *
 * The margin floor is the selling firm's own pricing policy — the number
 * below which a recruiter needs approval. It is not a term of the deal and
 * the client should never see it, let alone set it. The rest of the terms
 * are bilateral in life and unilateral here, because Phase 1 is vendor-
 * side: the vendor is recording what was agreed, not negotiating it in the
 * product. When the client portal lands this becomes a proposal both sides
 * accept, and that is a different endpoint rather than a looser check.
 *
 * ── Why the signature is a date and not a checkbox ───────────────────
 *
 * The schema is explicit that a null signature means work is running on a
 * handshake, which is the ordinary state of this industry between an offer
 * and a start date and worth being able to count. A boolean would lose
 * when — and "signed six months after the first invoice" is the finding an
 * auditor stops on.
 */
export async function PATCH(
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

  const agreement = await prisma.masterAgreement.findUnique({
    where: { id },
    select: {
      id: true,
      vendorId: true,
      clientId: true,
      client: { select: { name: true } },
      vendor: { select: { name: true } },
    },
  })

  if (!agreement) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such agreement.' } },
      { status: 404 }
    )
  }

  if (agreement.vendorId !== companyId) {
    const asClient = agreement.clientId === companyId
    return NextResponse.json(
      {
        error: {
          code: 'NOT_YOURS',
          message: asClient
            ? `These are ${agreement.vendor.name}'s terms to record. You can read them here and they change them.`
            : 'You are not a party to this agreement.',
        },
      },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  if ('paymentTerms' in body) {
    const days = body.paymentTerms
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 0 || days > 365) {
      return bad('Payment terms are whole days between 0 and 365.', 'paymentTerms')
    }
    data.paymentTerms = days
  }

  if ('minMarginPct' in body) {
    const pct = body.minMarginPct
    if (pct !== null) {
      if (typeof pct !== 'number' || !Number.isInteger(pct) || pct < 0 || pct > 99) {
        // 100% would mean paying nothing, which is not a floor, it is a
        // typo that would flag every placement on the agreement.
        return bad('A margin floor is a whole percentage between 0 and 99, or nothing at all.', 'minMarginPct')
      }
    }
    data.minMarginPct = pct
  }

  if ('capacity' in body) {
    const cap = body.capacity
    if (cap !== null) {
      if (typeof cap !== 'number' || !Number.isInteger(cap) || cap < 1) {
        // Null is uncapped. Zero would read as an agreement that permits
        // nobody, which nobody would ever sign.
        return bad('Capacity is at least one person, or nothing at all for uncapped.', 'capacity')
      }
    }
    data.capacity = cap
  }

  if ('currency' in body) {
    const cur = body.currency
    if (typeof cur !== 'string' || !/^[A-Z]{3}$/.test(cur)) {
      return bad('Currency is a three-letter code.', 'currency')
    }
    data.currency = cur
  }

  if ('signedAt' in body) {
    const at = body.signedAt
    if (at === null) {
      data.signedAt = null
    } else {
      const d = new Date(at)
      if (isNaN(d.getTime())) return bad('That is not a date.', 'signedAt')
      if (d.getTime() > Date.now() + 86_400_000) {
        return bad('An agreement cannot have been signed in the future.', 'signedAt')
      }
      data.signedAt = d
    }
  }

  if (Object.keys(data).length === 0) {
    return bad('Nothing to change.', null)
  }

  const updated = await prisma.masterAgreement.update({
    where: { id },
    data,
    select: {
      id: true,
      paymentTerms: true,
      minMarginPct: true,
      capacity: true,
      currency: true,
      signedAt: true,
    },
  })

  return NextResponse.json({
    data: {
      id: updated.id,
      terms: {
        paymentTermsDays: updated.paymentTerms,
        paymentTermsSays: paymentDaysSays(updated.paymentTerms),
        minMarginPct: updated.minMarginPct,
        marginFloorSays: marginFloorSays(updated.minMarginPct),
        capacity: updated.capacity,
        currency: updated.currency,
        signedAt: updated.signedAt?.toISOString() ?? null,
      },
      changedBy: realPersonId(caller),
      says: `Terms recorded against ${agreement.client.name}.`,
    },
  })
}

function bad(message: string, field: string | null) {
  return NextResponse.json(
    { error: { code: 'VALIDATION', message, field } },
    { status: 400 }
  )
}
