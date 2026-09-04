import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { register, mayRemove, riskJudgement, RELATIONSHIPS } from '@/lib/counterparty'

/**
 * GET  /api/counterparties — the register: who we work with, and as what
 * POST /api/counterparties — put a firm on it
 *
 * The register derives what agreements already prove and adds what they
 * cannot hold — the prospect being courted, the prime with no paper yet.
 * Deriving instead of duplicating means the two can never disagree.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Counterparties')
  if (notStaff) return notStaff

  const companyId = caller.company!.id

  const [stored, msas] = await Promise.all([
    prisma.counterparty.findMany({
      where: { companyId },
      include: { otherCompany: { select: { id: true, name: true } } },
    }),
    prisma.masterAgreement.findMany({
      where: { OR: [{ vendorId: companyId }, { clientId: companyId }] },
      include: {
        vendor: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
    }),
  ])

  const rows = register(
    companyId,
    stored.map((c) => ({
      otherCompanyId: c.otherCompanyId,
      otherCompanyName: c.otherCompany.name,
      relationship: c.relationship,
      status: c.status,
    })),
    msas.map((m) => ({
      vendorId: m.vendorId,
      clientId: m.clientId,
      otherName: m.vendorId === companyId ? m.client.name : m.vendor.name,
    }))
  )

  // How many people we know at each of them. A counterparty with no
  // contact is a firm you cannot actually call.
  const contactCounts = await prisma.companyContact.groupBy({
    by: ['atCompanyId'],
    where: { companyId },
    _count: true,
  })
  const counts = new Map(contactCounts.map((c) => [c.atCompanyId, c._count]))

  return NextResponse.json({
    data: {
      rows: rows.map((r) => ({ ...r, contacts: counts.get(r.otherCompanyId) ?? 0 })),
      relationships: Object.entries(RELATIONSHIPS).map(([key, v]) => ({ key, ...v })),
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Counterparties')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))

  const relationship = String(body?.relationship ?? '')
  if (!(relationship in RELATIONSHIPS)) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: `Say what they are to you: ${Object.keys(RELATIONSHIPS).join(', ')}.`,
          field: 'relationship',
        },
      },
      { status: 422 }
    )
  }

  const otherCompanyId = String(body?.otherCompanyId ?? '')
  if (!otherCompanyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say which company.', field: 'otherCompanyId' } },
      { status: 422 }
    )
  }
  if (otherCompanyId === companyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A firm cannot be its own counterparty.' } },
      { status: 422 }
    )
  }

  const row = await prisma.counterparty.upsert({
    where: {
      companyId_otherCompanyId_relationship: { companyId, otherCompanyId, relationship },
    },
    update: { status: body?.status === 'PROSPECT' ? 'PROSPECT' : 'ACTIVE' },
    create: {
      companyId,
      otherCompanyId,
      relationship,
      status: body?.status === 'PROSPECT' ? 'PROSPECT' : 'ACTIVE',
      notes: body?.notes ? String(body.notes).trim() : null,
      createdById: caller.person.id,
    },
    include: { otherCompany: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ data: { row } }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Counterparties')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const url = new URL(request.url)
  const otherCompanyId = url.searchParams.get('otherCompanyId') ?? ''
  const relationship = url.searchParams.get('relationship') ?? ''

  // Not while money or people are live between you — removing the row
  // would only hide the contracts from the one screen that lists who you
  // deal with.
  const [liveContracts, unpaid] = await Promise.all([
    prisma.sellContract.count({
      where: {
        state: { in: ['IN_PROGRESS', 'PAUSED'] },
        OR: [
          { companyId, clientCompanyId: otherCompanyId },
          { companyId: otherCompanyId, clientCompanyId: companyId },
        ],
      },
    }),
    prisma.invoice.count({
      where: {
        status: { notIn: ['PAID', 'CANCELLED'] },
        engagement: {
          msa: {
            OR: [
              { vendorId: companyId, clientId: otherCompanyId },
              { vendorId: otherCompanyId, clientId: companyId },
            ],
          },
        },
      },
    }),
  ])

  const verdict = mayRemove(liveContracts, unpaid)
  if (!verdict.may) {
    return NextResponse.json(
      { error: { code: 'STILL_LIVE', message: verdict.says } },
      { status: 409 }
    )
  }

  await prisma.counterparty.deleteMany({ where: { companyId, otherCompanyId, relationship } })
  return NextResponse.json({ data: { says: verdict.says } })
}

/**
 * PATCH /api/counterparties — set the risk judgement on a register row.
 *
 * The supplier-risk watchlist read these columns before anything could
 * write them, and said so. This is the writer.
 */
export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Counterparties')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))
  const otherCompanyId = String(body?.otherCompanyId ?? '')
  const relationship = String(body?.relationship ?? '')
  const level = String(body?.riskLevel ?? '')
  const reviewBy = body?.riskReviewBy ? new Date(String(body.riskReviewBy)) : null

  const verdict = riskJudgement(level, reviewBy && !isNaN(reviewBy.getTime()) ? reviewBy : null, new Date())
  if (!verdict.ok) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: verdict.says } },
      { status: 422 }
    )
  }

  const updated = await prisma.counterparty.updateMany({
    where: { companyId, otherCompanyId, relationship },
    data: { riskLevel: level, riskReviewBy: reviewBy },
  })
  if (updated.count === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No register row for that pair and relationship.' } },
      { status: 404 }
    )
  }
  return NextResponse.json({ data: { says: verdict.says } })
}
