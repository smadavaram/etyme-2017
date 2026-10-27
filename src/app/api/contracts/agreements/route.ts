import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { actingDesk } from '@/lib/program-seat'
import { notAtACompany } from '@/app/api/people/not-at-a-company'
import { readAgreementTerms, mayRecordAgreement } from '@/lib/money/agreement-record'
import { AGREEMENT_TERMS_SELECT, termsFor } from '@/lib/money/order-terms'
import { currentTerms, ensureBaseline, recordVersion } from '@/app/api/program/agreements/trail'

const RHYTHM_WORDS: Record<string, string> = {
  WEEKLY: 'weekly', BIWEEKLY: 'every other week', SEMIMONTHLY: 'twice a month', MONTHLY: 'monthly',
}
const FROM_WORDS: Record<string, string> = {
  PERIOD_END: 'the end of the work period',
  INVOICE_DATE: 'the invoice date',
  RECEIPT_DATE: 'the day the invoice is received',
  APPROVAL_DATE: 'the day the invoice is approved',
}

/**
 * POST /api/contracts/agreements: record an agreement two firms signed.
 *
 * ── Why here ─────────────────────────────────────────────────────────
 *
 * Release walk, 2026-10-27: a sub-vendor could not record its agreement
 * with a prime on any screen, because no route created one with terms.
 * `api/clients`, `api/suppliers` and `api/supplier-requests/[id]` write
 * an unsigned placeholder at thirty days; `api/program/agreements` reads,
 * amends, signs and ends what is there. This is the one door that puts a
 * signed agreement's own terms on file, and it writes the same row and
 * the same amendment trail those routes read, so the agreements list,
 * the signature, the amendment and the end all work on it unchanged.
 *
 * Body:
 *   otherCompanyId  the firm on the other side, from the caller's register
 *   callerSells     true where the caller sells to them (the caller is the
 *                   vendor on the agreement); false where it buys from them
 *   paymentTerms    net days, required: every agreement states them
 *   paymentTermsFrom, billFrequency, currency, effectiveDate, expiresAt,
 *   executedFileUrl, executedFileName   optional; blank is silence
 *
 * The rules, and why each holds, are in `lib/money/agreement-record`.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const desk = await actingDesk(caller)
  if (!desk) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: notAtACompany('An agreement') } },
      { status: 403 }
    )
  }
  // The desk that owns prices records the terms everything is priced on,
  // the same desk that may amend them and record a signature.
  if (!hasPermission(desk.permissions, 'rates.write') && !hasPermission(desk.permissions, 'settings.manage')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            'Recording an agreement is for the contract manager. Ask your contract manager to record it, ' +
            'or an owner to give you rate permissions.',
        },
      },
      { status: 403 }
    )
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const read = readAgreementTerms(body)
  if (!read.ok) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: read.says, field: read.field } }, { status: 422 })
  }
  const terms = read.terms
  if (terms.paymentTerms == null) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say the net days the agreement sets, such as 30 or 45.', field: 'paymentTerms' } },
      { status: 422 }
    )
  }
  if (typeof body.callerSells !== 'boolean') {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Say which way the agreement runs: you sell to this firm, or you buy from them.',
          field: 'callerSells',
        },
      },
      { status: 422 }
    )
  }

  const me = desk.companyId
  const otherId = body.otherCompanyId ? String(body.otherCompanyId) : ''
  const [mine, other] = await Promise.all([
    prisma.company.findUnique({ where: { id: me }, select: { id: true, name: true, currency: true } }),
    otherId
      ? prisma.company.findUnique({ where: { id: otherId }, select: { id: true, name: true, claimedAt: true } })
      : Promise.resolve(null),
  ])
  if (!mine) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: notAtACompany('An agreement') } }, { status: 403 })
  }

  // Whether the two already trade, either way round: an agreement, the
  // register, an order, a contract, or a job one sent the other.
  const relationshipExists = other
    ? Boolean(
        (await prisma.masterAgreement.findFirst({
          where: { OR: [{ vendorId: me, clientId: other.id }, { vendorId: other.id, clientId: me }] },
          select: { id: true },
        })) ??
          (await prisma.counterparty.findFirst({
            where: { OR: [{ companyId: me, otherCompanyId: other.id }, { companyId: other.id, otherCompanyId: me }] },
            select: { id: true },
          })) ??
          (await prisma.workOrder.findFirst({
            where: { OR: [{ issuedById: me, issuedToId: other.id }, { issuedById: other.id, issuedToId: me }] },
            select: { id: true },
          })) ??
          (await prisma.sellContract.findFirst({
            where: { OR: [{ companyId: me, clientCompanyId: other.id }, { companyId: other.id, clientCompanyId: me }] },
            select: { id: true },
          })) ??
          (await prisma.requirementInvitation.findFirst({
            where: {
              OR: [
                { toCompanyId: me, requirement: { companyId: other.id } },
                { toCompanyId: other.id, requirement: { companyId: me } },
              ],
            },
            select: { id: true },
          }))
      )
    : false

  const vendorId = body.callerSells ? me : otherId
  const clientId = body.callerSells ? otherId : me
  const live = other
    ? await prisma.masterAgreement.findFirst({
        where: { vendorId, clientId, endedAt: null },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, createdAt: true, paymentTerms: true, paymentTermsFrom: true, billFrequency: true,
          effectiveDate: true, expiresAt: true, signedAt: true, executedFileName: true,
          _count: { select: { signatures: true, versions: true } },
        },
      })
    : null

  const verdict = mayRecordAgreement({
    caller: { id: mine.id, name: mine.name },
    other,
    callerSells: body.callerSells,
    relationshipExists,
    existing: live
      ? { ...live, signatures: live._count.signatures, versions: live._count.versions }
      : null,
  })
  if (!verdict.ok) {
    const status = verdict.says.includes('already on file') ? 409 : verdict.field === 'otherCompanyId' && other ? 403 : 422
    return NextResponse.json({ error: { code: status === 409 ? 'DUPLICATE' : 'NOT_YOURS', message: verdict.says, field: verdict.field } }, { status })
  }

  const data = {
    paymentTerms: terms.paymentTerms,
    // What the agreement did not say keeps the column's documented
    // reading (from the period end) and the firm's own currency.
    ...(terms.paymentTermsFrom ? { paymentTermsFrom: terms.paymentTermsFrom } : {}),
    billFrequency: terms.billFrequency,
    currency: terms.currency ?? mine.currency ?? 'USD',
    effectiveDate: terms.effectiveDate,
    expiresAt: terms.expiresAt,
    executedFileName: terms.executedFileName,
    executedFileUrl: terms.executedFileUrl,
    status: 'ACTIVE',
  }

  const now = new Date()
  let agreementId: string
  if (verdict.fillId) {
    const before = await currentTerms(verdict.fillId)
    if (before) await ensureBaseline(verdict.fillId, before, now)
    await prisma.masterAgreement.update({ where: { id: verdict.fillId }, data })
    agreementId = verdict.fillId
  } else {
    const created = await prisma.masterAgreement.create({
      data: { vendorId: verdict.vendorId, clientId: verdict.clientId, ...data },
      select: { id: true },
    })
    agreementId = created.id
  }
  await recordVersion({
    agreementId,
    action: 'RECORDED',
    changed: ['payment days', 'what payment days run from', 'billing rhythm', 'currency', 'term', 'signed copy'],
    changedById: caller.person.id,
    reason: verdict.fillId
      ? `Recorded by ${caller.person.name} from the signed agreement, over the unsigned placeholder.`
      : `Recorded by ${caller.person.name} from the signed agreement.`,
  })

  // On the caller's register, so the firm is on Companies beside it.
  await prisma.counterparty.upsert({
    where: {
      companyId_otherCompanyId_relationship: {
        companyId: me,
        otherCompanyId: otherId,
        relationship: body.callerSells ? 'CLIENT' : 'SUPPLIER',
      },
    },
    update: {},
    create: {
      companyId: me,
      otherCompanyId: otherId,
      relationship: body.callerSells ? 'CLIENT' : 'SUPPLIER',
      createdById: caller.person.id,
      since: terms.effectiveDate ?? now,
    },
  })

  const agreement = await prisma.masterAgreement.findUnique({
    where: { id: agreementId },
    select: {
      id: true, vendorId: true, clientId: true, paymentTerms: true, paymentTermsFrom: true,
      billFrequency: true, currency: true, effectiveDate: true, expiresAt: true,
      executedFileName: true, executedFileUrl: true, status: true,
      vendor: { select: { name: true } }, client: { select: { name: true } },
    },
  })

  // What every bill and payment between the two now follows, read back
  // through the one door every money reader uses, so the sentence on the
  // screen is the answer the bills will get.
  const asRead = await prisma.masterAgreement.findUniqueOrThrow({ where: { id: agreementId }, select: AGREEMENT_TERMS_SELECT })
  const follows = termsFor(body.callerSells ? 'SELL' : 'BUY', {}, asRead)
  const rhythmSays =
    follows.source.frequency === 'AGREEMENT'
      ? `billed ${RHYTHM_WORDS[follows.frequency] ?? follows.frequency.toLowerCase()}`
      : 'billed on each order\u2019s own rhythm, because the agreement does not say'
  const followsSays =
    `Bills between them follow it: ${rhythmSays}, net ${follows.paymentTermsDays ?? terms.paymentTerms} ` +
    `from ${FROM_WORDS[follows.paymentTermsFrom ?? 'PERIOD_END']}, in ${follows.currency ?? data.currency}.`

  return NextResponse.json(
    {
      data: {
        agreement,
        filledPlaceholder: Boolean(verdict.fillId),
        follows: {
          frequency: follows.frequency, paymentTermsDays: follows.paymentTermsDays,
          paymentTermsFrom: follows.paymentTermsFrom, currency: follows.currency, source: follows.source,
        },
        message: `${verdict.says} ${followsSays}`,
      },
    },
    { status: verdict.fillId ? 200 : 201 }
  )
}
