import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { recordRefusal } from '@/lib/access-log'
import { roleWords } from '@/lib/access-grant'
import { writeRecordAction, LedgerRefusal } from '@/lib/record-ledger'
import { workTogether } from '@/lib/company-create'
import { mayClassify, mayExtend, readClassifyAsk, classifiedSays, END_CLIENT_ROW } from '@/lib/counterparty'
import { dealsWith, NOT_ON_YOUR_LIST } from '../../dealing'
import { positionsFor, writeCustomerPosition } from '../../positions'

/**
 * PATCH /api/companies/:id/classify — { customer: boolean, client: boolean, actingEntityId? }
 *
 * Say what a company on your own list is to you (record 110, A1):
 * "Customer: pays us", "Client: where our people work", or both. For the
 * Owner, an Admin or the seat that manages who the firm trades with.
 *
 * What it writes, on the caller's own register only: the day and the
 * person on the CLIENT row for "customer", and an END_CLIENT row for
 * "client". Saying it again with other answers changes it. The Kind is
 * never read as an answer and never changed. Each save is one row on the
 * record ledger with who and when. Nothing is emailed. Every refusal is
 * written to the access log before it is sent.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Companies')
  if (notStaff) return notStaff
  if (!caller.company || caller.isService) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Classifying a company is done by a person with a seat at a company.' } }, { status: 403 })
  }
  const me = caller.company
  const body = await request.json().catch(() => ({}))
  const other = await prisma.company.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, kind: true, claimedAt: true, listedById: true, isDemo: true },
  })

  const refuse = async (status: number, code: string, says: string, field?: string) => {
    await recordRefusal([{ companyId: other?.id ?? me.id }], {
      actorPersonId: caller.person.id,
      actorCompanyId: me.id,
      action: 'CONTRACT_VIEW',
      reason: `Refused classifying ${other?.id ?? params.id} on ${me.name}'s list: ${says}`,
    })
    return NextResponse.json({ error: { code, message: says, ...(field ? { field } : {}) } }, { status })
  }

  // A company the caller has no business with is answered as an id that does not exist.
  if (!other || other.isDemo !== (me.isDemo === true) || !(await dealsWith(me.id, other))) return refuse(404, 'NOT_FOUND', NOT_ON_YOUR_LIST)

  const [entities, role, held] = await Promise.all([
    prisma.legalEntity.findMany({ where: { companyId: me.id }, select: { id: true } }),
    caller.context.roleId ? prisma.role.findUnique({ where: { id: caller.context.roleId }, select: { name: true } }) : null,
    positionsFor(me.id, [other]),
  ])
  const positions = held.get(other.id)?.positions ?? []
  // Who may, before what was typed: a seat that may not classify is told
  // so whatever it sent.
  const may = mayClassify({ me, permissions: caller.permissions, other, positions, customer: true })
  if (!may.ok) return refuse(may.status, may.code, may.says)
  const ask = readClassifyAsk(body, entities.length > 0, other.name)
  if (!ask.ok) return refuse(422, 'VALIDATION', ask.says, ask.field)
  const verdict = mayClassify({ me, permissions: caller.permissions, other, positions, customer: ask.customer })
  if (!verdict.ok) return refuse(verdict.status, verdict.code, verdict.says)

  // A Customer position it does not hold yet is given by Extend's own rule.
  if (ask.customer && !positions.includes('CUSTOMER')) {
    const extend = mayExtend({
      as: 'CUSTOMER', me, permissions: caller.permissions, positions,
      other: { id: other.id, name: other.name, claimedAt: other.claimedAt, listedById: other.listedById },
      worksTogether: await workTogether(me.id, other.id),
    })
    if (!extend.ok) return refuse(extend.status, extend.code, extend.says)
  }

  const now = new Date()
  const stamp = { classifiedAt: now, classifiedById: caller.person.id }
  const message = classifiedSays(caller.person.name, other.name, ask)
  try {
    await prisma.$transaction(async (tx) => {
      if (ask.customer) {
        await writeCustomerPosition(tx, { me: me.id, otherId: other.id, byId: caller.person.id })
        await tx.counterparty.updateMany({ where: { companyId: me.id, otherCompanyId: other.id, relationship: 'CLIENT' }, data: stamp })
      } else {
        // The row stays as it was loaded; only the person's word comes off it.
        await tx.counterparty.updateMany({ where: { companyId: me.id, otherCompanyId: other.id, relationship: 'CLIENT' }, data: { classifiedAt: null, classifiedById: null } })
      }
      if (ask.client) {
        await tx.counterparty.upsert({
          where: { companyId_otherCompanyId_relationship: { companyId: me.id, otherCompanyId: other.id, relationship: END_CLIENT_ROW } },
          update: stamp,
          create: { companyId: me.id, otherCompanyId: other.id, relationship: END_CLIENT_ROW, status: 'ACTIVE', createdById: caller.person.id, ...stamp },
        })
      } else {
        await tx.counterparty.deleteMany({ where: { companyId: me.id, otherCompanyId: other.id, relationship: END_CLIENT_ROW } })
      }
      await writeRecordAction(tx, {
        companyId: me.id, recordType: 'Company', recordId: other.id, action: 'COMPANY_CLASSIFIED',
        summary: message, personId: caller.person.id, heldAs: roleWords(role?.name ?? null), actingEntityId: ask.actingEntityId,
      })
    })
  } catch (e) {
    if (e instanceof LedgerRefusal) return refuse(422, 'VALIDATION', e.message, 'actingEntityId')
    throw e
  }
  return NextResponse.json({
    data: {
      companyId: other.id, customer: ask.customer, client: ask.client,
      classifiedAt: now.toISOString(), classifiedByName: caller.person.name,
      message: `${message} You can change this later.`,
    },
  })
}
