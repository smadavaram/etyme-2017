import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, type CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { recordRefusal } from '@/lib/access-log'
import { workTogether } from '@/lib/company-create'
import { dealsWith, NOT_ON_YOUR_LIST } from '../../dealing'
import { dealingsWithSides } from '../../dealings'
import { notLinkedYet, isMine, mayEditRecord, mayExtend, mayRemovePosition, maySetRecordedKind, readExtendAs, workEndsAt, POSITION_WORDS, KINDS_TO_SET, type ExtendAs } from '@/lib/counterparty'
import { mayOpen } from '@/lib/nav-table'
import { positionsFor, writeCustomerPosition, writeSupplierPosition, workOnPosition, removePosition, historyOf, agreementKeepsPosition } from '../../positions'

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

const OTHER = { id: true, name: true, slug: true, kind: true, claimedAt: true, listedById: true, isDemo: true, _count: { select: { contexts: true } } } as const

async function open(request: NextRequest, id: string, opts: { listed?: boolean } = {}) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { error }
  const notStaff = staffOnly(caller, 'Companies')
  if (notStaff) return { error: notStaff }
  if (!caller.company) {
    return { error: NextResponse.json({ error: { code: 'NO_COMPANY', message: 'A company’s positions belong to a company, and you are not signed in at one.' } }, { status: 403 }) }
  }
  const other = await prisma.company.findUnique({ where: { id }, select: OTHER })
  // A sandbox never reaches a real book, nor a real book a sandbox. And a
  // company the caller neither recorded, nor holds on its own register,
  // nor works with is answered exactly as an id that does not exist, so
  // this door never says a stranger's name or that it is on Etyme
  // (review, 2026-11-13).
  if (!other || other.isDemo !== (caller.company.isDemo === true) || !((await dealsWith(caller.company.id, other)) || (opts.listed && (await onTheList(caller, other))))) {
    return { error: await refuse(caller, id, 404, 'NOT_FOUND', NOT_ON_YOUR_LIST) }
  }
  return { caller, other }
}

/**
 * Whether the Companies list draws this company for the caller in full:
 * the list's own reader (`dealingsWithSides`), less a firm on Etyme reached
 * only by the caller's own writing, which the list draws as "Not linked
 * yet" and whose drawer calls no route. So every row the list draws opens
 * in its drawer (2026-11-15: a sub-vendor's list drew the site its people
 * work at, and the drawer refused it). Only the drawer's read asks this;
 * every change still asks its own rule.
 */
async function onTheList(caller: CallerContext, other: { id: string; claimedAt: Date | null; listedById: string | null }): Promise<boolean> {
  const sides = await dealingsWithSides(caller, false)
  if (!sides.ids.has(other.id)) return false
  return !(await drawnNotLinked(caller, other, sides.ownSideOnly))
}

/**
 * Whether the Companies list draws this company as "Not linked yet", by
 * the list's own rule (`notLinkedYet`) and the list's own count of seats.
 * Such a row's drawer opens nothing, so its read is answered as the list
 * answers it: as an id that is not on the list. One rule for a firm the
 * caller only wrote on its register and one it only sent a job to
 * (2026-11-15: the first answered its Kind and positions, the second 404).
 */
async function drawnNotLinked(
  caller: CallerContext,
  other: { id: string; claimedAt: Date | null; listedById: string | null },
  ownSideOnly?: ReadonlySet<string>,
): Promise<boolean> {
  const sides = ownSideOnly ?? (await dealingsWithSides(caller, false)).ownSideOnly
  if (!sides.has(other.id)) return false
  const seats = other.claimedAt != null ? 1 : await prisma.context.count({ where: { companyId: other.id, roleId: { not: null } } })
  return notLinkedYet({ ownSideOnly: true, onEtyme: other.claimedAt != null || seats > 0, mine: isMine(other, caller.company!.id) })
}

/** Where the work keeping a position is ended, for this seat: a page it may open and an act it may do, or null. */
function endsAt(caller: CallerContext, work: Parameters<typeof workEndsAt>[0]) {
  const at = workEndsAt(work, caller.permissions)
  return at && mayOpen(at.href, caller.permissions) ? at : null
}

async function refuse(caller: CallerContext, otherId: string, status: number, code: string, says: string, field?: string, link?: { href: string; words: string } | null): Promise<NextResponse> {
  await recordRefusal([{ companyId: otherId }], {
    actorPersonId: caller.isService ? undefined : caller.person.id,
    actorCompanyId: caller.company?.id,
    action: 'CONTRACT_VIEW',
    reason: `Refused a change to what ${otherId} is to ${caller.company?.name ?? 'the caller'}: ${says}`,
  })
  return NextResponse.json({ error: { code, message: says, ...(field ? { field } : {}), ...(link ? { link } : {}) } }, { status })
}

async function readOne(me: string, other: { id: string; kind: string; claimedAt: Date | null; listedById: string | null }) {
  return (await positionsFor(me, [other])).get(other.id)!
}

export async function GET(request: NextRequest, { params }: Params) {
  const o = await open(request, params.id, { listed: true })
  if (o.error) return o.error
  const { caller, other } = o
  const me = caller.company!.id
  if (await drawnNotLinked(caller, other)) return refuse(caller, other.id, 404, 'NOT_FOUND', NOT_ON_YOUR_LIST)
  const read = await readOne(me, other)
  // Only a company on the caller's own list, one it works with, or one the
  // Companies list draws in full (the site a sub-vendor's people work at).
  const worksTogether = read.mine || read.positions.length > 0 || (await workTogether(me, other.id))
  if (!worksTogether && !(await onTheList(caller, other))) {
    return refuse(caller, other.id, 404, 'NOT_FOUND', NOT_ON_YOUR_LIST)
  }
  // What the drawer may press, asked of the rules POST, DELETE and the
  // kind route ask, so a button is drawn only where its route takes it
  // and a removal it would refuse is said in its own sentence instead.
  const meAt = { id: me, name: caller.company!.name }
  const extend = (as: ExtendAs) => {
    const v = mayExtend({
      as, me: meAt, permissions: caller.permissions, worksTogether, positions: read.positions,
      other: { id: other.id, name: other.name, claimedAt: other.claimedAt, listedById: other.listedById },
    })
    return v.ok && !v.already
  }
  const remove: Partial<Record<ExtendAs, { ok: boolean; says: string; code?: string; link?: { href: string; words: string } | null }>> = {}
  for (const as of ['CUSTOMER', 'SUPPLIER'] as const) {
    if (!read.positions.includes(as)) continue
    const work = await workOnPosition(me, other.id, as)
    const v = mayRemovePosition({
      as, me: meAt, permissions: caller.permissions, positions: read.positions,
      other: { id: other.id, name: other.name },
      work,
      heldByAgreement: await agreementKeepsPosition(me, other, as),
    })
    const link = !v.ok && v.code === 'STILL_IN_USE' ? endsAt(caller, work) : null
    remove[as] = v.ok
      ? { ok: true, says: v.says }
      : { ok: false, says: v.says, code: v.code, ...(link ? { link } : {}) }
  }
  const kindVerdict = maySetRecordedKind({
    to: other.kind === 'VENDOR' ? 'CLIENT' : 'VENDOR',
    me: meAt,
    permissions: caller.permissions,
    other: { id: other.id, name: other.name, kind: other.kind, claimedAt: other.claimedAt, listedById: other.listedById, seats: other._count.contexts },
  })
  // Correcting the name, the typed domain and the entity type: only on the
  // caller's own record nobody has claimed (PATCH /api/companies/:id/record).
  const editVerdict = mayEditRecord({
    me: meAt,
    permissions: caller.permissions,
    other: { id: other.id, name: other.name, claimedAt: other.claimedAt, listedById: other.listedById, seats: other._count.contexts },
  })
  return NextResponse.json({
    data: {
      companyId: other.id,
      kind: other.kind,
      ...read,
      history: await historyOf(me, other.id, { positions: read.positions, removable: remove }),
      may: {
        edit: editVerdict.ok,
        extend: { SUPPLIER: extend('SUPPLIER'), CUSTOMER: extend('CUSTOMER') },
        remove,
        setKind: kindVerdict.ok,
        // Said only where the reader cannot set it, so the drawer says why.
        setKindSays: kindVerdict.ok ? null : kindVerdict.says,
        kinds: [...KINDS_TO_SET],
      },
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
    other: { id: other.id, name: other.name, claimedAt: other.claimedAt, listedById: other.listedById },
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
          // Undone from the company's History on Companies, never from the
          // activity log, whose Reverse changes no position (UNDONE_ON_COMPANIES).
          reversible: false,
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
  const work = as ? await workOnPosition(me.id, other.id, as) : { orders: 0, lines: 0, bills: 0, signedAgreement: false, submissions: 0, openInvitations: 0, supplierRequests: 0 }
  const verdict = mayRemovePosition({
    as: asked,
    me: { id: me.id, name: me.name },
    permissions: caller.permissions,
    other: { id: other.id, name: other.name },
    positions: before.positions,
    work,
    heldByAgreement: as ? await agreementKeepsPosition(me.id, other, as) : false,
  })
  // Work keeping the position: the refusal carries where it is ended.
  if (!verdict.ok) return refuse(caller, other.id, verdict.status, verdict.code, verdict.says, verdict.field, verdict.code === 'STILL_IN_USE' ? endsAt(caller, work) : null)

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
        // Put back by extending again on Companies, never from the activity log.
        reversible: false,
      },
    })
  })
  const after = await readOne(me.id, other)
  return NextResponse.json({ data: { companyId: other.id, kind: other.kind, ...after, message: verdict.says } })
}
