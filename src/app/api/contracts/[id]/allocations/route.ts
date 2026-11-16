import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, type CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { mayMaintainCodes } from '@/lib/money/client-codes'
import { recordRefusal } from '@/lib/access-log'
import { actingDesk } from '@/lib/program-seat'
import { CLIENT_CODES_NOT_PAYER } from '@/lib/counterparty'
import { planAllocationEdit, HELD_LINES_GO_NEXT } from '@/lib/money/allocation-edit'
import { paysInvoiceReceipts } from '@/app/api/settings/coding/guard'

/**
 * GET   /api/contracts/:id/allocations — the client's coding on a line
 * PATCH /api/contracts/:id/allocations — correct one coding line in place
 *
 * The award writes the coding once; this is the only way to fix it. Only
 * the company that pays the line writes it, through a seat that holds
 * `codes.manage` (Finance, the Owner, the AP clerk where there is no
 * Finance seat; never an Admin by default), or a firm seated in that client's program under the role the
 * client gave it. A supplier never does, and the read says nothing to it.
 * The shares on a line still add up to 100%. A change moves `updatedAt`,
 * and that is what lets a held line go in the next receipt file.
 */

type Ctx = { params: Promise<{ id: string }> }

const LINE = {
  id: true, clientCompanyId: true,
  costAllocations: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true, costCenterId: true, internalOrderId: true, glAccount: true, shareBps: true,
      costCenter: { select: { code: true, name: true, glAccount: true, companyId: true } },
      internalOrder: { select: { code: true, kind: true, companyId: true } },
    },
  },
} as const

async function whoWrites(caller: CallerContext, payerId: string): Promise<boolean> {
  const desk = await actingDesk(caller, payerId)
  if (!desk || desk.companyId !== payerId) return false
  if (!desk.seat && !(await paysInvoiceReceipts(caller))) return false
  return (await mayMaintainCodes(desk.acting, payerId)).may
}

export async function GET(request: NextRequest, { params }: Ctx) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params
  const line = await prisma.sellContract.findUnique({ where: { id }, select: LINE })
  // Nothing of the client's is read by anybody who may not change it.
  if (!line || !(await whoWrites(caller, line.clientCompanyId))) return NextResponse.json({ data: { may: false } })
  const [costCenters, internalOrders] = await Promise.all([
    prisma.costCenter.findMany({ where: { companyId: line.clientCompanyId }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } }),
    prisma.internalOrder.findMany({ where: { companyId: line.clientCompanyId }, orderBy: { code: 'asc' }, select: { id: true, code: true, kind: true } }),
  ])
  return NextResponse.json({
    data: {
      may: true,
      allocations: line.costAllocations.map((a) => ({
        id: a.id, costCenterId: a.costCenterId, internalOrderId: a.internalOrderId,
        costCenter: a.costCenter.code, costCenterName: a.costCenter.name,
        internalOrder: a.internalOrder?.code ?? null,
        glAccount: a.glAccount, glDefault: a.costCenter.glAccount,
        sharePct: a.shareBps / 100,
      })),
      costCenters, internalOrders,
    },
  })
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params
  const line = await prisma.sellContract.findUnique({ where: { id }, select: LINE })
  if (!line) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That contract is not here.' } }, { status: 404 })

  if (!(await whoWrites(caller, line.clientCompanyId))) {
    // Written before the refusal is sent.
    await recordRefusal([{ companyId: line.clientCompanyId }], {
      actorPersonId: caller.isService ? undefined : caller.person.id,
      actorCompanyId: caller.company?.id,
      action: 'CONTRACT_VIEW',
      reason: 'Refused: changing a contract’s cost coding, which only the paying company’s Finance, Owner or AP clerk seat does.',
    })
    const desk = await actingDesk(caller, line.clientCompanyId)
    const onPayerSide = desk?.companyId === line.clientCompanyId
    const own = onPayerSide && (desk?.seat || (await paysInvoiceReceipts(caller)))
    const verdict = own && desk ? await mayMaintainCodes(desk.acting, line.clientCompanyId) : null
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: verdict && !verdict.may ? verdict.says : CLIENT_CODES_NOT_PAYER } },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => ({}))
  if (typeof body?.allocationId !== 'string') {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say which coding line to change.', field: 'allocationId' } }, { status: 422 })
  }
  const plan = planAllocationEdit(line.costAllocations, {
    allocationId: body.allocationId,
    costCenterId: body.costCenterId,
    internalOrderId: body.internalOrderId,
    glAccount: body.glAccount,
    sharePct: body.sharePct,
  })
  if (!plan.ok) return NextResponse.json({ error: { code: 'VALIDATION', message: plan.says } }, { status: 422 })

  // The payer's own cost center and order, never another company's.
  const [cc, io] = await Promise.all([
    plan.changes.costCenterId ? prisma.costCenter.findFirst({ where: { id: plan.changes.costCenterId, companyId: line.clientCompanyId }, select: { id: true } }) : null,
    plan.changes.internalOrderId ? prisma.internalOrder.findFirst({ where: { id: plan.changes.internalOrderId, companyId: line.clientCompanyId }, select: { id: true } }) : null,
  ])
  if (plan.changes.costCenterId && !cc) return NextResponse.json({ error: { code: 'VALIDATION', message: 'That cost center is not one of yours.', field: 'costCenterId' } }, { status: 422 })
  if (plan.changes.internalOrderId && !io) return NextResponse.json({ error: { code: 'VALIDATION', message: 'That order is not one of yours.', field: 'internalOrderId' } }, { status: 422 })

  const saved = await prisma.$transaction(async (tx) => {
    const row = await tx.contractCostAllocation.update({ where: { id: body.allocationId }, data: plan.changes, select: { id: true, updatedAt: true } })
    await tx.automationLog.create({
      data: {
        companyId: line.clientCompanyId,
        action: 'CONTRACT_CODING_CHANGED',
        summary: `${caller.person.name} changed the ${plan.fields.join(', ')} on one coding line of a contract`,
        reason: 'Edited by a seat that sets the paying company’s codes',
        payload: { by: caller.isService ? null : caller.person.id, contractId: id, allocationId: row.id, fields: plan.fields },
        reversible: false,
      },
    })
    return row
  })
  return NextResponse.json({ data: { id: saved.id, updatedAt: saved.updatedAt, says: HELD_LINES_GO_NEXT } })
}
