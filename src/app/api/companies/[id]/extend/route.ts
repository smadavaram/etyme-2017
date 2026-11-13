import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, type CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { recordRefusal } from '@/lib/access-log'
import { workTogether } from '@/lib/company-create'
import { mayExtend, mayRemovePosition, readExtendAs, POSITION_WORDS } from '@/lib/counterparty'
import { positionsFor, writeCustomerPosition, writeSupplierPosition, workOnPosition, removePosition, historyOf } from '../../positions'

/**
 * GET    /api/companies/:id/extend — where this company sits with you, and its history on your list
 * POST   /api/companies/:id/extend — { as: 'SUPPLIER' | 'CUSTOMER' }: give it that position
 * DELETE /api/companies/:id/extend?as=SUPPLIER|CUSTOMER — take that position off
 *
 * Founder, 2026-11-12: "Classify later = extend." A position lives on the
 * register row between the two firms (and, for a Customer, the agreement
 * record beside it), never on the company: extending never reads or
 * changes the Kind, one company may hold both positions at once, and
 * taking one off leaves the other and the Kind as they were. Every change
 * is one automation-log row with who, when and the position. Nothing is
 * emailed and no notice is written. Every refusal is written to the
 * access log before it is sent.
 */

type Params = { params: { id: string } }

const OTHER = { id: true, name: true, slug: true, kind: true, claimedAt: true, listedById: true, isDemo: true } as const

async function open(request: NextRequest, id: string) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { error }
  const notStaff = staffOnly(caller, 'Companies')
  if (notStaff) return { error: notStaff }
  if (!caller.company) {
    return { error: NextResponse.json({ error: { code: 'NO_COMPANY', message: 'A company’s positions belong to a company, and you are not signed in at one.' } }, { status: 403 }) }
  }
  const other = await prisma.company.findUnique({ where: { id }, select: OTHER })
  // A sandbox never reaches a real book, nor a real book a sandbox.
  if (!other || other.isDemo !== (caller.company.isDemo === true)) {
    return { error: await refuse(caller, id, 404, 'NOT_FOUND', 'That company is not on your Companies list.') }
  }
  return { caller, other }
}

async function refuse(caller: CallerContext, otherId: string, status: number, code: string, says: string, field?: string): Promise<NextResponse> {
  await recordRefusal([{ companyId: otherId }], {
    actorPersonId: caller.isService ? undefined : caller.person.id,
    actorCompanyId: caller.company?.id,
    action: 'CONTRACT_VIEW',
    reason: `Refused a change to what ${otherId} is to ${caller.company?.name ?? 'the caller'}: ${says}`,
  })
  return NextResponse.json({ error: { code, message: says, ...(field ? { field } : {}) } }, { status })
}

async function readOne(me: string, other: { id: string; kind: string; claimedAt: Date | null; listedById: string | null }) {
  return (await positionsFor(me, [other])).get(other.id)!
}

export async function GET(request: NextRequest, { params }: Params) {
  const o = await open(request, params.id)
  if (o.error) return o.error
  const { caller, other } = o
  const me = caller.company!.id
  const read = await readOne(me, other)
  // Only a company on the caller's own list, or one it works with.
  if (!read.mine && read.positions.length === 0 && !(await workTogether(me, other.id))) {
    return refuse(caller, other.id, 404, 'NOT_FOUND', 'That company is not on your Companies list.')
  }
  return NextResponse.json({
    data: {
      companyId: other.id,
      kind: other.kind,
      ...read,
      history: await historyOf(me, other.id),
    },
  })
}

export async function POST(request: NextRequest, { params }: Params) {
  const o = await open(request, params.id)
  if (o.error) return o.error
  const { caller, other } = o
  const me = caller.company!
  const body = await request.json().catch(() => ({}))
  const before = await readOne(me.id, other)
  const verdict = mayExtend({
    as: body?.as,
    me: { id: me.id, name: me.name },
    permissions: caller.permissions,
    // No Kind is handed to the rule, on purpose.
    other: { id: other.id, name: other.name, claimedAt: other.claimedAt, listedById: other.listedById, slug: other.slug },
    worksTogether: await workTogether(me.id, other.id),
    positions: before.positions,
  })
  if (!verdict.ok) return refuse(caller, other.id, verdict.status, verdict.code, verdict.says, verdict.field)

  if (!verdict.already) {
    await prisma.$transaction(async (tx) => {
      const msa = verdict.as === 'CUSTOMER'
        ? await writeCustomerPosition(tx, { me: me.id, otherId: other.id, byId: caller.person.id })
        : (await writeSupplierPosition(tx, { me: me.id, otherId: other.id, byId: caller.person.id }), null)
      await tx.automationLog.create({
        data: {
          companyId: me.id,
          action: 'COMPANY_EXTENDED',
          summary: `${caller.person.name} extended ${other.name} to ${POSITION_WORDS[verdict.as]}`,
          reason: verdict.says,
          payload: {
            otherCompanyId: other.id, position: verdict.as, relationship: verdict.relationship,
            byName: caller.person.name, personId: caller.person.id,
            msaId: msa?.msaId ?? null, madeAgreement: msa?.madeAgreement ?? false,
          },
          reversible: true,
        },
      })
    })
  }
  const after = await readOne(me.id, other)
  return NextResponse.json({ data: { companyId: other.id, kind: other.kind, ...after, changed: !verdict.already, message: verdict.says } }, { status: verdict.already ? 200 : 201 })
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const o = await open(request, params.id)
  if (o.error) return o.error
  const { caller, other } = o
  const me = caller.company!
  const asked = request.nextUrl.searchParams.get('as') ?? (await request.json().catch(() => ({})))?.as
  const as = readExtendAs(asked)
  const before = await readOne(me.id, other)
  const verdict = mayRemovePosition({
    as: asked,
    me: { id: me.id, name: me.name },
    permissions: caller.permissions,
    other: { id: other.id, name: other.name },
    positions: before.positions,
    work: as ? await workOnPosition(me.id, other.id, as) : { orders: 0, lines: 0, bills: 0, signedAgreement: false, submissions: 0, openInvitations: 0, supplierRequests: 0 },
  })
  if (!verdict.ok) return refuse(caller, other.id, verdict.status, verdict.code, verdict.says, verdict.field)

  await prisma.$transaction(async (tx) => {
    const gone = await removePosition(tx, { me: me.id, otherId: other.id, as: verdict.as })
    await tx.automationLog.create({
      data: {
        companyId: me.id,
        action: 'COMPANY_POSITION_REMOVED',
        summary: `${caller.person.name} took ${POSITION_WORDS[verdict.as]} off ${other.name}`,
        reason: verdict.says,
        payload: {
          otherCompanyId: other.id, position: verdict.as, relationship: verdict.relationship,
          byName: caller.person.name, personId: caller.person.id, agreementRemoved: gone.agreementRemoved,
        },
        reversible: true,
      },
    })
  })
  const after = await readOne(me.id, other)
  return NextResponse.json({ data: { companyId: other.id, kind: other.kind, ...after, message: verdict.says } })
}
