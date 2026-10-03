import { NextRequest, NextResponse } from 'next/server'
import { mayEnd } from '@/lib/agreement-term'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { ensureBaseline, recordVersion, type TermSnapshot } from '../../trail'
import { workHasStarted } from '../../verdict'

/**
 * POST /api/program/agreements/[id]/end
 *
 * Ends a master agreement.
 *
 * ── Why this route had to exist ──────────────────────────────────────
 *
 * There was no way to end one. An agreement somebody tore up stayed
 * live-looking forever, and its capacity and its margin floor went on
 * enforcing against contracts nobody was allowed to write.
 *
 * ── Why it does not refuse while people are working ──────────────────
 *
 * Because that is the normal case. An agreement is terminated with
 * notice and the people under it run to the end of their contracts; a
 * product that refused would produce an agreement nobody ever ends, which
 * is where this started. So it proceeds, says how many people are still
 * on site under it, and puts that count in the record — Addendum E's rule
 * for everything that is not legally grounded: warn, capture a reason,
 * proceed. Never silently permit.
 *
 * ── Why the reason is required ───────────────────────────────────────
 *
 * An agreement torn up for no recorded reason is the one nobody can
 * explain two years later, and the whole point of this work is that the
 * question has an answer.
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

  const agreement = await prisma.masterAgreement.findUnique({
    where: { id },
    select: {
      id: true,
      vendorId: true,
      clientId: true,
      status: true,
      createdAt: true,
      noticeDays: true,
      client: { select: { name: true } },
      vendor: { select: { name: true } },
      sellContracts: { select: { state: true } },
      paymentTerms: true,
      paymentTermsFrom: true,
      currency: true,
      minMarginPct: true,
      capacity: true,
      disclosesSubVendors: true,
      effectiveDate: true,
      expiresAt: true,
      renewalKind: true,
      renewalMonths: true,
      signedAt: true,
      executedFileName: true,
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
            ? `This is ${agreement.vendor.name}'s record of the agreement. Ending it here would ` +
              `not end it on their side. Tell them, and they end it.`
            : 'You are not a party to this agreement.',
        },
      },
      { status: 403 }
    )
  }

  if (
    !hasPermission(caller.permissions, 'rates.write') &&
    !hasPermission(caller.permissions, 'settings.manage')
  ) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_ALLOWED',
          message:
            'Ending an agreement is the contracting desk’s work — everything underneath it ' +
            'inherits its terms. Ask your contract manager to end it, or an owner to give ' +
            'you rate permissions.',
        },
      },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  const verdict = mayEnd(agreement.status, reason)
  if (!verdict.ok) {
    return NextResponse.json(
      { error: { code: 'CANNOT_END', message: verdict.says } },
      { status: 409 }
    )
  }

  const live = agreement.sellContracts.filter((c) => workHasStarted(c.state)).length
  const endedAt = body.endedAt ? new Date(body.endedAt) : new Date()
  if (Number.isNaN(endedAt.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'That is not a date. Give the day it ends.' } },
      { status: 400 }
    )
  }

  const before: TermSnapshot = {
    paymentTerms: agreement.paymentTerms,
    paymentTermsFrom: agreement.paymentTermsFrom,
    currency: agreement.currency,
    minMarginPct: agreement.minMarginPct,
    capacity: agreement.capacity,
    // (etyme-architect, 2026-09-17 — the sub-vendor disclosure term
    // travels on the version trail like every other term.)
    disclosesSubVendors: agreement.disclosesSubVendors,
    effectiveDate: agreement.effectiveDate,
    expiresAt: agreement.expiresAt,
    renewalKind: agreement.renewalKind,
    renewalMonths: agreement.renewalMonths,
    noticeDays: agreement.noticeDays,
    status: agreement.status,
    signedAt: agreement.signedAt,
    executedFileName: agreement.executedFileName,
  }
  await ensureBaseline(id, before, agreement.createdAt)

  await prisma.masterAgreement.update({
    where: { id },
    data: {
      status: 'TERMINATED',
      endedAt,
      endedReason: reason,
      endedById: realPersonId(caller),
    },
  })

  const written = await recordVersion({
    agreementId: id,
    action: 'TERMINATED',
    changed: ['its standing'],
    changedById: realPersonId(caller),
    reason,
  })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'AGREEMENT_ENDED',
      summary:
        `${caller.person.name} ended the agreement with ${agreement.client.name}` +
        (live > 0
          ? `, with ${live} ${live === 1 ? 'person' : 'people'} still working under it.`
          : '.'),
      reason,
      payload: {
        agreementId: id,
        counterparty: agreement.client.name,
        endedAt: endedAt.toISOString(),
        stillWorking: live,
        noticeDays: agreement.noticeDays,
        version: written?.version ?? null,
      },
      // Undoing this means recording a new agreement, not flipping a
      // column back: the contracts written in between were written under
      // something.
      reversible: false,
    },
  })

  return NextResponse.json({
    data: {
      id,
      status: 'TERMINATED',
      endedAt: endedAt.toISOString(),
      endedReason: reason,
      stillWorking: live,
      says:
        live > 0
          ? `Ended. ${live} ${live === 1 ? 'person is' : 'people are'} still working under it — ` +
            `their contracts run on, and nothing new may be written against this agreement. ` +
            `Record what replaces it before the next placement.`
          : 'Ended. Nothing new may be written under it.',
      amendment: written?.version ?? null,
    },
  })
}
