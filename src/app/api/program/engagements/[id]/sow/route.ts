import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { maySignSow, sowFinding, workHasStarted } from '../../../agreements/verdict'

/**
 * PUT /api/program/engagements/[id]/sow
 *
 * The scope of work, and the date somebody signed for it.
 *
 * ── What this refuses ────────────────────────────────────────────────
 *
 * A signature over an empty scope. It is the one combination that is
 * worse than having nothing at all: every screen that checks whether the
 * paper is in order reads it as done, so nobody ever chases it, and the
 * engagement goes to invoice with a signed statement of work that says
 * nothing about what was bought.
 *
 * ── What it does not refuse ──────────────────────────────────────────
 *
 * Work running with no SOW at all. Addendum E allows a block only where
 * there is a legal ground — tenure, work authorisation, insurance,
 * segregation of duties. A missing scope document is a commercial risk and
 * a governance step slower than the workaround produces the workaround. So
 * it warns, with a reason code, and the work goes on.
 */
export async function PUT(
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

  const engagement = await prisma.engagement.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      msa: { select: { vendorId: true, clientId: true } },
      sellContracts: { select: { state: true } },
    },
  })

  if (!engagement) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such engagement.' } },
      { status: 404 }
    )
  }

  if (engagement.msa.vendorId !== companyId) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_YOURS',
          message:
            engagement.msa.clientId === companyId
              ? 'The supplier records the scope. You can read it and sign for it off-platform until the client portal lands.'
              : 'You are not a party to this engagement.',
        },
      },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))

  const scope =
    body.statementOfWork === null
      ? null
      : typeof body.statementOfWork === 'string'
        ? body.statementOfWork.trim()
        : undefined

  if (scope === undefined) {
    return bad('Send the scope text, or null to clear it.', 'statementOfWork')
  }

  let signed: Date | null = null
  if (body.sowSignedAt) {
    signed = new Date(body.sowSignedAt)
    if (isNaN(signed.getTime())) return bad('That is not a date.', 'sowSignedAt')
    if (signed.getTime() > Date.now() + 86_400_000) {
      return bad('A statement of work cannot have been signed in the future.', 'sowSignedAt')
    }
  }

  const verdict = maySignSow({ statementOfWork: scope, signedAt: signed })
  if (!verdict.ok) return bad(verdict.says, 'sowSignedAt')

  const saved = await prisma.engagement.update({
    where: { id },
    data: {
      statementOfWork: scope && scope.length > 0 ? scope : null,
      sowSignedAt: signed,
    },
    select: { id: true, title: true, statementOfWork: true, sowSignedAt: true },
  })

  const liveContracts = engagement.sellContracts.filter((c) => workHasStarted(c.state)).length

  const finding = sowFinding({
    id: saved.id,
    title: saved.title,
    statementOfWork: saved.statementOfWork,
    sowSignedAt: saved.sowSignedAt,
    liveContracts,
  })

  return NextResponse.json({
    data: {
      id: saved.id,
      title: saved.title,
      statementOfWork: saved.statementOfWork,
      sowSignedAt: saved.sowSignedAt?.toISOString() ?? null,
      liveContracts,
      // Said after the save, not instead of it. The scope is recorded
      // either way; this is what is still outstanding about it.
      finding,
      says: verdict.says,
    },
  })
}

function bad(message: string, field: string | null) {
  return NextResponse.json({ error: { code: 'VALIDATION', message, field } }, { status: 400 })
}
