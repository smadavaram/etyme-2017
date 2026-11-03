import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { contractSide } from '@/lib/resolve-client-company'
import { holdsContractDesk } from '@/lib/papering'
import { termsOnRecordFor } from '@/lib/award/terms-on-record'
import { recordRefusal, logAccess, accessActor } from '@/lib/access-log'
import { payLineView } from '@/lib/money/pay-line-repair'

/**
 * GET /api/contracts/:id/pay-line
 *
 * Whether a buy line stands behind this placement, and where none does,
 * the sentence and the door that writes one: the terms page, for the
 * contract manager at the firm that holds the person (`payLineView`). A
 * client reads nothing here, because what a supplier pays is its own.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params

  const sell = await prisma.sellContract.findUnique({
    where: { id },
    select: {
      id: true, companyId: true, clientCompanyId: true, endClientCompanyId: true, personId: true, requirementId: true,
      person: { select: { name: true } },
      company: { select: { name: true } },
      _count: { select: { buyLinks: true } },
    },
  })
  if (!sell) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Contract not found' } }, { status: 404 })

  const side = contractSide(caller, sell)
  if (!side) {
    await recordRefusal([sell.personId], {
      ...accessActor(caller), action: 'CONTRACT_VIEW', reason: 'Asked about a placement’s pay line, at a firm not party to it.',
    })
    return NextResponse.json(
      { error: { code: 'NOT_A_PARTY', message: `${caller.company?.name ?? 'Your company'} is not a party to this placement.` } },
      { status: 403 },
    )
  }
  if (side !== 'SUPPLIER' || sell._count.buyLinks > 0) {
    return NextResponse.json({ data: { hasBuyLine: sell._count.buyLinks > 0, says: null, door: null } })
  }

  const terms = (await termsOnRecordFor([sell.id])).get(sell.id) ?? null
  const hopZeroFirm = terms?.firmCompanyId ?? sell.companyId
  const hopZeroSell = terms?.hopZeroSellId && terms.hopZeroSellId !== sell.id
    ? await prisma.sellContract.findUnique({ where: { id: terms.hopZeroSellId }, select: { requirementId: true, company: { select: { name: true } } } })
    : null
  const submission = await prisma.submission.findFirst({
    where: {
      fromCompanyId: hopZeroFirm,
      personId: sell.personId,
      requirementId: hopZeroSell?.requirementId ?? sell.requirementId ?? undefined,
    },
    orderBy: { submittedAt: 'desc' },
    select: { id: true },
  })
  logAccess({
    subjectId: sell.personId, ...accessActor(caller), action: 'CONTRACT_VIEW',
    reason: 'Read whether a placement has a pay line behind it.',
  })
  const view = payLineView({
    readerIsSupplier: true,
    hasBuyLine: false,
    termsSays: terms?.says ?? null,
    onRecord: terms?.onRecord ?? false,
    readerIsHopZeroFirm: caller.company?.id === hopZeroFirm,
    readerHoldsContractDesk: holdsContractDesk(caller.permissions ?? []),
    hopZeroSubmissionId: submission?.id ?? null,
    personName: sell.person.name,
    firmName: hopZeroSell?.company.name ?? sell.company.name,
  })
  return NextResponse.json({ data: { hasBuyLine: false, ...view } })
}
