import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { maySignSow } from '../agreements/verdict'

/**
 * POST /api/program/engagements
 *
 * An engagement under a master agreement — the project or statement of
 * work that several people and several contracts hang off.
 *
 * ── Why the SOW is a field and not a model ───────────────────────────
 *
 * The statement of work IS the engagement. A separate SowDocument row
 * would be the same thing recorded twice, and two records of one fact
 * disagree the first time somebody edits the wrong one. The scope text and
 * the signature date live on the engagement, and everything that already
 * points at the engagement — contracts, invoices, sales orders, project
 * orders — points at the scope for free.
 */
export async function POST(request: NextRequest) {
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
  const { msaId, title, invoiceCycle, statementOfWork, sowSignedAt } = body

  if (typeof msaId !== 'string' || !msaId) return bad('Which agreement is this under?', 'msaId')
  if (typeof title !== 'string' || title.trim().length < 2) {
    return bad('An engagement needs a name somebody will recognise on an invoice.', 'title')
  }

  const msa = await prisma.masterAgreement.findUnique({
    where: { id: msaId },
    select: { id: true, vendorId: true, clientId: true, client: { select: { name: true } } },
  })

  if (!msa) return NextResponse.json(
    { error: { code: 'NOT_FOUND', message: 'No such agreement.' } },
    { status: 404 }
  )

  if (msa.vendorId !== companyId) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_YOURS',
          message: 'Engagements are opened by the firm doing the work.',
        },
      },
      { status: 403 }
    )
  }

  const scope = typeof statementOfWork === 'string' ? statementOfWork.trim() : null
  const signed = sowSignedAt ? new Date(sowSignedAt) : null
  if (signed && isNaN(signed.getTime())) return bad('That is not a date.', 'sowSignedAt')

  const sow = maySignSow({ statementOfWork: scope, signedAt: signed })
  if (!sow.ok) return bad(sow.says, 'sowSignedAt')

  const engagement = await prisma.engagement.create({
    data: {
      msaId: msa.id,
      title: title.trim(),
      invoiceCycle: typeof invoiceCycle === 'string' ? invoiceCycle : 'MONTHLY',
      statementOfWork: scope && scope.length > 0 ? scope : null,
      sowSignedAt: signed,
    },
    select: {
      id: true,
      title: true,
      invoiceCycle: true,
      statementOfWork: true,
      sowSignedAt: true,
    },
  })

  return NextResponse.json(
    {
      data: {
        ...engagement,
        sowSignedAt: engagement.sowSignedAt?.toISOString() ?? null,
        says: `${engagement.title} opened under the ${msa.client.name} agreement.`,
      },
    },
    { status: 201 }
  )
}

function bad(message: string, field: string | null) {
  return NextResponse.json({ error: { code: 'VALIDATION', message, field } }, { status: 400 })
}
