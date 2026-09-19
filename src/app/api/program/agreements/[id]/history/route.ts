import { NextRequest, NextResponse } from 'next/server'
import { STATUS_SAYS, termsOn } from '@/lib/agreement-term'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { paymentDaysSays } from '../../verdict'

/**
 * GET /api/program/agreements/[id]/history
 *
 * Every amendment to this agreement, newest first, and every signature on
 * it — with an optional `?on=YYYY-MM-DD` that answers the only question
 * anybody asks of an amendment trail: what were the terms on that day.
 *
 * ── Why both sides may read it ───────────────────────────────────────
 *
 * The margin floor is the vendor's own pricing policy and never leaves
 * their side, the way it does not on the agreements list. Everything else
 * here is a bilateral term — the payment days, the term, the signatures —
 * and a client who cannot see when the payment days changed cannot check
 * an invoice against them, which is the entire use for this endpoint.
 *
 * ── Why a day before the agreement existed returns nothing ───────────
 *
 * Handing back the earliest version for a date that predates the
 * agreement would read as an authoritative statement about a period this
 * company has no record of. A blank with a sentence is the honest answer.
 */
export async function GET(
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
      createdAt: true,
      status: true,
      endedAt: true,
      endedReason: true,
      client: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
    },
  })

  if (!agreement) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such agreement.' } },
      { status: 404 }
    )
  }

  const seller = agreement.vendorId === companyId
  if (!seller && agreement.clientId !== companyId) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_YOURS',
          message:
            'You are not a party to this agreement, so its history is not yours to read.',
        },
      },
      { status: 403 }
    )
  }

  const [versions, signatures] = await Promise.all([
    prisma.masterAgreementVersion.findMany({
      where: { agreementId: id },
      orderBy: { version: 'desc' },
      include: { changedBy: { select: { id: true, name: true } } },
      take: 500,
    }),
    prisma.agreementSignature.findMany({
      where: { agreementId: id },
      orderBy: { signedAt: 'asc' },
      include: { attestedBy: { select: { id: true, name: true } } },
    }),
  ])

  const shape = (v: (typeof versions)[number]) => ({
    version: v.version,
    action: v.action,
    changed: v.changed,
    reason: v.reason,
    changedAt: v.changedAt.toISOString(),
    changedBy: v.changedBy ? { id: v.changedBy.id, name: v.changedBy.name } : null,
    terms: {
      paymentTermsDays: v.paymentTerms,
      paymentTermsSays: paymentDaysSays(v.paymentTerms),
      paymentTermsFrom: v.paymentTermsFrom,
      currency: v.currency,
      // The floor is the selling firm's own pricing policy. It does not
      // cross to the client here for the same reason it does not on the
      // list — and being left out of one branch by hand is how it would
      // eventually cross.
      minMarginPct: seller ? v.minMarginPct : null,
      capacity: v.capacity,
      effectiveDate: v.effectiveDate?.toISOString() ?? null,
      expiresAt: v.expiresAt?.toISOString() ?? null,
      renewalKind: v.renewalKind,
      renewalMonths: v.renewalMonths,
      noticeDays: v.noticeDays,
      status: v.status,
      signedAt: v.signedAt?.toISOString() ?? null,
      executedFileName: v.executedFileName,
    },
    says: sentence(v),
  })

  // ── What were the terms on a day ──────────────────────────────────
  const onParam = new URL(request.url).searchParams.get('on')
  let asOf: { on: string; found: boolean; says: string; terms: unknown } | null = null

  if (onParam) {
    const on = new Date(onParam)
    if (Number.isNaN(on.getTime())) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'That is not a date. Ask for a day like 2026-03-03.',
          },
        },
        { status: 400 }
      )
    }

    const inForce = termsOn(versions, on)
    const day = on.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    })

    asOf = inForce
      ? {
          on: on.toISOString(),
          found: true,
          says:
            `On ${day} this agreement was on amendment ${inForce.version}: ` +
            `${paymentDaysSays(inForce.paymentTerms).replace(/\.$/, '')}.`,
          terms: shape(inForce).terms,
        }
      : {
          on: on.toISOString(),
          found: false,
          says:
            versions.length === 0
              ? 'Nothing was ever recorded against this agreement, so there is no answer for that day.'
              : `This agreement has no record before ${agreement.createdAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}, so nothing here can say what its terms were on ${day}.`,
          terms: null,
        }
  }

  return NextResponse.json({
    data: {
      id: agreement.id,
      role: seller ? 'VENDOR' : 'CLIENT',
      counterparty: seller ? agreement.client : agreement.vendor,
      status: agreement.status,
      statusSays: STATUS_SAYS[agreement.status as keyof typeof STATUS_SAYS] ?? agreement.status,
      endedAt: agreement.endedAt?.toISOString() ?? null,
      endedReason: agreement.endedReason,
      amendments: versions.map(shape),
      signatures: signatures.map((s) => ({
        party: s.party,
        signerName: s.signerName,
        signerTitle: s.signerTitle,
        signerEmail: s.signerEmail,
        signedAt: s.signedAt.toISOString(),
        method: s.method,
        attestedBy: s.attestedBy ? { id: s.attestedBy.id, name: s.attestedBy.name } : null,
        attestedAt: s.attestedAt.toISOString(),
        attestation: s.attestation,
      })),
      asOf,
      says:
        versions.length === 0
          ? 'Nothing has been amended since this agreement was recorded.'
          : `${versions.length} ${versions.length === 1 ? 'entry' : 'entries'} on file, newest first.`,
    },
  })
}

/** One line per entry, in the words the person who made it would use. */
function sentence(v: {
  action: string
  changed: string[]
  version: number
  changedBy: { name: string } | null
}): string {
  const who = v.changedBy?.name ?? 'The nightly term watch'
  switch (v.action) {
    case 'RECORDED':
      return 'The terms as they stood when the agreement was recorded.'
    case 'SIGNED':
      return `${who} recorded a signature.`
    case 'DOCUMENT_ATTACHED':
      return `${who} attached the executed document.`
    case 'RENEWED':
      return 'The agreement renewed itself for a further term, as the paper says it does.'
    case 'EXPIRED':
      return 'The term ran out.'
    case 'TERMINATED':
      return `${who} ended the agreement.`
    default:
      return v.changed.length
        ? `${who} changed ${v.changed.join(', ')} — amendment ${v.version}.`
        : `${who} made amendment ${v.version}.`
  }
}
