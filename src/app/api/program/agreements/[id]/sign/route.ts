import { NextRequest, NextResponse } from 'next/server'
import { executedOn, maySign, signingSays } from '@/lib/agreement-term'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { ensureBaseline, recordVersion, type TermSnapshot } from '../../trail'

/**
 * POST /api/program/agreements/[id]/sign
 *
 * Records that somebody signed the master agreement — which side, who,
 * with what title, on what date, and by what means.
 *
 * ── What this is not ─────────────────────────────────────────────────
 *
 * Not an e-signature service. Nothing here sends an envelope, verifies a
 * certificate or holds a cryptographic signature. `DocInstance.envelopeId`
 * exists for DocuSign and nothing writes it, and that stays true.
 *
 * What this is: a person at this company looked at the executed paper and
 * attested, in a sentence kept word for word, that it says what it says.
 * That is worth exactly what an attestation is worth — which is why the
 * attestor and the moment are both kept, and why the response says so
 * rather than claiming the signature was verified.
 *
 * ── Why two rows and not one date ────────────────────────────────────
 *
 * A master agreement is executed by two parties. Signed on one side is
 * not an executed agreement; it is a document out for counter-signature,
 * which is a different thing to chase and names a different person. So
 * `MasterAgreement.signedAt` is written only when both sides are in, and
 * dated the later of the two — a document signed by the supplier in March
 * and counter-signed by the client in May was executed in May, and dating
 * it March claims two months of cover nobody had.
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
      client: { select: { name: true } },
      vendor: { select: { name: true } },
      signatures: { select: { party: true, signedAt: true } },
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
      noticeDays: true,
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
            ? `These are ${agreement.vendor.name}'s papers to record. You can read them here and they record them.`
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
            'Recording a signature on an agreement is the contracting desk’s work. Ask ' +
            'your contract manager to record it, or an owner to give you rate permissions.',
        },
      },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const now = new Date()

  const input = {
    party: typeof body.party === 'string' ? body.party : '',
    signerName: typeof body.signerName === 'string' ? body.signerName : '',
    signerTitle: typeof body.signerTitle === 'string' ? body.signerTitle : '',
    signedAt: body.signedAt ? new Date(body.signedAt) : null,
    method: typeof body.method === 'string' ? body.method : 'WET_INK',
  }

  const verdict = maySign(input, agreement.signatures, agreement.status, now)
  if (!verdict.ok) {
    return NextResponse.json(
      { error: { code: 'CANNOT_SIGN', message: verdict.says } },
      { status: 409 }
    )
  }

  const who = caller.person.name
  const attestation =
    typeof body.attestation === 'string' && body.attestation.trim()
      ? body.attestation.trim()
      : `${who} confirms this is the executed copy of the agreement between ` +
        `${agreement.vendor.name} and ${agreement.client.name}, signed by ` +
        `${input.signerName.trim()} (${input.signerTitle.trim()}).`

  const signature = await prisma.agreementSignature.create({
    data: {
      agreementId: id,
      party: input.party,
      signerName: input.signerName.trim(),
      signerTitle: input.signerTitle.trim(),
      signerEmail: typeof body.signerEmail === 'string' ? body.signerEmail.trim() || null : null,
      signedAt: input.signedAt!,
      method: input.method,
      attestedById: realPersonId(caller),
      attestation,
    },
    select: { id: true, party: true, signerName: true, signerTitle: true, signedAt: true, method: true },
  })

  const all = [...agreement.signatures, { party: signature.party, signedAt: signature.signedAt }]
  const executed = executedOn(all)

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

  // A signed agreement is no longer a placeholder. DRAFT is the award
  // path's word for "a row so the contract has a parent"; once somebody
  // has put their name to it, it is an agreement.
  const nextStatus = agreement.status === 'DRAFT' ? 'ACTIVE' : agreement.status

  await prisma.masterAgreement.update({
    where: { id },
    data: { signedAt: executed, status: nextStatus },
  })

  const written = await recordVersion({
    agreementId: id,
    action: 'SIGNED',
    changed: ['the signature'],
    changedById: realPersonId(caller),
    reason: attestation,
  })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'AGREEMENT_SIGNED',
      summary:
        `${who} recorded ${signature.signerName}’s signature (${signature.signerTitle}) for the ` +
        `${signature.party === 'VENDOR' ? 'supplier' : 'client'} on the agreement with ` +
        `${agreement.client.name}.`,
      reason: attestation,
      payload: {
        agreementId: id,
        party: signature.party,
        signerName: signature.signerName,
        signerTitle: signature.signerTitle,
        signedAt: signature.signedAt.toISOString(),
        method: signature.method,
        fullyExecuted: Boolean(executed),
        version: written?.version ?? null,
      },
      // A signature recorded against the wrong side is corrected by an
      // amendment, not by deleting the row. The trail keeps both.
      reversible: false,
    },
  })

  return NextResponse.json({
    data: {
      id: signature.id,
      party: signature.party,
      signerName: signature.signerName,
      signerTitle: signature.signerTitle,
      signedAt: signature.signedAt.toISOString(),
      method: signature.method,
      fullyExecutedAt: executed?.toISOString() ?? null,
      signingSays: signingSays(all),
      attestation,
      // Said plainly, because it would be easy to read this as more than
      // it is.
      says: executed
        ? `Both sides are now on file. ${who} attested to the executed copy; nothing here verified it.`
        : `Recorded. ${signingSays(all)}`,
      amendment: written?.version ?? null,
    },
  })
}
