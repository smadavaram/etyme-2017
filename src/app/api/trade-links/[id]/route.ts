import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { notify } from '@/lib/notify'
import { mirrorOf, wordFor } from '@/lib/trade-link'
import type { Relationship } from '@/lib/counterparty'

/**
 * POST /api/trade-links/:id   { action: "accept" | "not-now" }
 *
 * The firm that was asked answers, by whoever keeps its list of
 * companies (`vendors.manage`). On yes, each firm gets its own row on its
 * own register in one transaction — the asker's in the asker's words, the
 * answerer's as its mirror — the same `Counterparty` rows every picker
 * and `workTogether` already read, so agreements and orders can name the
 * other firm at once. Nothing else is written: no agreement, no terms.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Link requests')
  if (notStaff) return notStaff
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const action = String(body.action ?? '')
  if (action !== 'accept' && action !== 'not-now') {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Answer with yes or Not now.' } }, { status: 422 })
  }

  const row = await prisma.tradeLinkRequest.findUnique({
    where: { id },
    select: {
      id: true, relationship: true, answeredAt: true, askedById: true, fromCompanyId: true, toCompanyId: true,
      fromCompany: { select: { name: true, kind: true } },
    },
  })
  const me = caller.company
  if (!row || !me || row.toCompanyId !== me.id) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such ask was made of this company.' } }, { status: 404 })
  }
  if (!hasPermission(caller.permissions, 'vendors.manage')) {
    return NextResponse.json(
      { error: { code: 'NOT_YOURS_TO_ANSWER', message: 'Answering a link is for whoever keeps your list of companies: the owner, or a role that manages suppliers.' } },
      { status: 403 }
    )
  }
  if (row.answeredAt) return NextResponse.json({ data: { id, says: `You already answered ${row.fromCompany.name}.` } })

  const now = new Date()
  const theirs = row.relationship as Relationship
  const mine = mirrorOf(theirs, row.fromCompany.kind)
  if (action === 'accept') {
    await prisma.$transaction([
      prisma.counterparty.upsert({
        where: { companyId_otherCompanyId_relationship: { companyId: row.fromCompanyId, otherCompanyId: me.id, relationship: theirs } },
        update: { status: 'ACTIVE' },
        create: { companyId: row.fromCompanyId, otherCompanyId: me.id, relationship: theirs, status: 'ACTIVE', createdById: row.askedById },
      }),
      prisma.counterparty.upsert({
        where: { companyId_otherCompanyId_relationship: { companyId: me.id, otherCompanyId: row.fromCompanyId, relationship: mine } },
        update: { status: 'ACTIVE' },
        create: { companyId: me.id, otherCompanyId: row.fromCompanyId, relationship: mine, status: 'ACTIVE', createdById: caller.person.id },
      }),
      prisma.tradeLinkRequest.update({ where: { id }, data: { answer: 'ACCEPTED', answeredAt: now, answeredById: caller.person.id } }),
    ])
  } else {
    await prisma.tradeLinkRequest.update({ where: { id }, data: { answer: 'NOT_NOW', answeredAt: now, answeredById: caller.person.id } })
  }

  void notify({
    personId: row.askedById, companyId: row.fromCompanyId, type: 'SYSTEM', entityId: id,
    title: action === 'accept' ? `${me.name} said yes to linking` : `${me.name} answered Not now`,
    body: action === 'accept'
      ? `${caller.person.name} at ${me.name} said yes. ${me.name} is on your companies as your ${wordFor(theirs, row.fromCompany.kind)}.`
      : `${caller.person.name} at ${me.name} answered Not now to your ask to link.`,
    data: { href: '/dashboard/companies' },
  })
  return NextResponse.json({
    data: {
      id,
      linked: action === 'accept',
      says: action === 'accept'
        ? `${row.fromCompany.name} is on your companies as your ${wordFor(mine, me.kind)}, and you are on theirs.`
        : `${row.fromCompany.name} is told Not now. Nothing was recorded.`,
    },
  })
}
