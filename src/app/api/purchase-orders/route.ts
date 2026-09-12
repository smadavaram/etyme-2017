import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { emit } from '@/lib/events'
import { poBalance } from '@/lib/purchase-order'

/**
 * GET  /api/purchase-orders — what is authorised, and how much is left
 * POST /api/purchase-orders — raise one
 *
 * Purchase orders were read in five places and created in none. The three
 * way match asks whether an invoice quotes a valid, open, unexhausted PO —
 * so on a real company with no way to raise one, that check could only ever
 * fail. The money chain worked on seeded data and stopped at the first
 * real customer.
 *
 * A PO is not a contract. A contract carries a rate — what one person costs
 * per hour. A PO carries a ceiling — how much the payer has authorised in
 * total, across however many people. Raising one is an accounts-payable act
 * and needs invoices.issue rather than assignments.write.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Purchase orders belong to a company' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'invoices.read')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Seeing purchase orders needs invoices.read' } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const side = request.nextUrl.searchParams.get('side') // issued | received

  const pos = await prisma.purchaseOrder.findMany({
    where:
      side === 'issued'
        ? { issuedById: companyId }
        : side === 'received'
          ? { issuedToId: companyId }
          // Both sides by default. A GSI raises POs to its bench suppliers
          // and receives them from its clients, in the same week.
          : { OR: [{ issuedById: companyId }, { issuedToId: companyId }] },
    orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
    select: {
      id: true, number: true, amount: true, currency: true,
      startDate: true, endDate: true, status: true,
      issuedById: true,
      issuedBy: { select: { id: true, name: true } },
      issuedTo: { select: { id: true, name: true } },
      invoices: { select: { total: true, status: true } },
      _count: { select: { sellContracts: true } },
    },
  })

  const rows = pos.map((po) => {
    // Void and cancelled invoices never consumed anything. Counting them
    // would show a PO as exhausted while money remained authorised on it.
    const invoicedCents = po.invoices
      .filter((i) => !['VOID', 'CANCELLED'].includes(i.status))
      .reduce((sum, i) => sum + Math.round(Number(i.total) * 100), 0)

    const balance = poBalance({
      amountCents: Math.round(Number(po.amount) * 100),
      invoicedCents,
      status: po.status as any,
      endDate: po.endDate,
    })

    return {
      id: po.id,
      number: po.number,
      direction: po.issuedById === companyId ? 'issued' : 'received',
      counterparty: po.issuedById === companyId ? po.issuedTo : po.issuedBy,
      currency: po.currency,
      amount: Number(po.amount),
      invoiced: invoicedCents / 100,
      remaining: balance.remainingCents / 100,
      consumedPercent: balance.consumedPercent,
      overdrawn: balance.overdrawn,
      expired: balance.expired,
      canInvoice: balance.canInvoice,
      reason: balance.reason,
      status: po.status,
      startDate: po.startDate.toISOString().slice(0, 10),
      endDate: po.endDate?.toISOString().slice(0, 10) ?? null,
      contractsAgainst: po._count.sellContracts,
    }
  })

  return NextResponse.json({
    data: {
      purchaseOrders: rows,
      canRaise: hasPermission(caller.permissions, 'invoices.issue'),
      // What actually needs somebody's attention. A PO quietly running out
      // stops invoices from matching, and the first anybody hears is a
      // supplier chasing payment.
      needsAttention: rows.filter((r) => r.overdrawn || r.expired || r.consumedPercent >= 90).length,
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Purchase orders belong to a company' } },
      { status: 403 }
    )
  }
  // Authorising spend is an accounts-payable act, not a contracting one.
  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Raising a purchase order needs invoices.issue' } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const body = await request.json().catch(() => ({}))

  const number = String(body.number ?? '').trim()
  const issuedToId = String(body.issuedToId ?? '')
  const amount = Number(body.amount)
  const startDate = body.startDate ? new Date(String(body.startDate)) : new Date()
  const endDate = body.endDate ? new Date(String(body.endDate)) : null

  if (!number) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A purchase order needs the number your finance team will recognise', field: 'number' } },
      { status: 422 }
    )
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A purchase order needs an authorised amount above zero', field: 'amount' } },
      { status: 422 }
    )
  }
  if (endDate && endDate.getTime() <= startDate.getTime()) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A purchase order cannot end before it starts', field: 'endDate' } },
      { status: 422 }
    )
  }

  const supplier = await prisma.company.findUnique({
    where: { id: issuedToId },
    select: { id: true, name: true },
  })
  if (!supplier) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say which supplier this authorises', field: 'issuedToId' } },
      { status: 422 }
    )
  }
  if (supplier.id === companyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A company cannot raise a purchase order to itself', field: 'issuedToId' } },
      { status: 422 }
    )
  }

  // The number is unique per issuer in the database. Catching it here means
  // the message names the existing PO rather than surfacing a constraint.
  const clash = await prisma.purchaseOrder.findFirst({
    where: { issuedById: companyId, number },
    select: { id: true, issuedTo: { select: { name: true } }, amount: true },
  })
  if (clash) {
    return NextResponse.json(
      {
        error: {
          code: 'DUPLICATE',
          message: `${number} already exists — it authorises $${Number(clash.amount).toLocaleString()} to ${clash.issuedTo.name}.`,
        },
      },
      { status: 409 }
    )
  }

  // The company's own currency unless this PO says otherwise. Not on the
  // caller context, so read it rather than assume dollars.
  const issuer = await prisma.company.findUnique({
    where: { id: companyId },
    select: { currency: true },
  })
  const currency = String(body.currency ?? issuer?.currency ?? 'USD').toUpperCase()

  const po = await prisma.purchaseOrder.create({
    data: {
      number,
      issuedById: companyId,
      issuedToId: supplier.id,
      amount,
      currency,
      startDate,
      endDate,
      status: 'OPEN',
    },
    select: { id: true, number: true, amount: true, currency: true, startDate: true, endDate: true },
  })

  // Attach it to contracts that were already running against this supplier
  // with no PO. Without this the PO exists and every invoice still fails
  // the check, which reads as the feature not working.
  let attached = 0
  if (body.attachExistingContracts !== false) {
    const result = await prisma.sellContract.updateMany({
      where: {
        companyId: supplier.id,
        clientCompanyId: companyId,
        purchaseOrderId: null,
        state: { in: ['IN_PROGRESS', 'PAUSED'] },
      },
      data: { purchaseOrderId: po.id },
    })
    attached = result.count
  }

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'PURCHASE_ORDER_RAISED',
      summary: `${caller.person.name} authorised $${amount.toLocaleString()} to ${supplier.name} on ${number}`,
      reason: attached > 0
        ? `${attached} running contract(s) with no PO were attached to it`
        : 'Raised from the purchase orders screen',
      payload: { purchaseOrderId: po.id, number, supplierId: supplier.id, amount, attached },
      reversible: true,
    },
  })

  void emit({
    type: 'purchase_order.raised',
    companyId,
    subjectType: 'PurchaseOrder',
    subjectId: po.id,
    actorPersonId: caller.person.id,
    payload: {
      number,
      supplierCompanyId: supplier.id,
      supplierName: supplier.name,
      amount,
      currency,
      startDate: startDate.toISOString(),
      endDate: endDate?.toISOString() ?? null,
      contractsAttached: attached,
    },
  })

  return NextResponse.json(
    {
      data: {
        purchaseOrder: {
          ...po,
          amount: Number(po.amount),
          startDate: po.startDate.toISOString().slice(0, 10),
          endDate: po.endDate?.toISOString().slice(0, 10) ?? null,
        },
        contractsAttached: attached,
        message:
          attached > 0
            ? `${number} authorises $${amount.toLocaleString()} to ${supplier.name}, and ${attached} running contract(s) now bill against it.`
            : `${number} authorises $${amount.toLocaleString()} to ${supplier.name}.`,
      },
    },
    { status: 201 }
  )
}

/**
 * PATCH /api/purchase-orders — change the ceiling, or close it
 *
 * Increasing an authorisation is the ordinary remedy when a PO runs out
 * mid-engagement, and it is the thing an AP clerk is sent to do when an
 * invoice fails the balance check. Refusing the waiver and pointing at a
 * door is only defensible if the door exists.
 */
export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company || !hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Changing a purchase order needs invoices.issue' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const id = String(body.id ?? '')

  const existing = await prisma.purchaseOrder.findFirst({
    // Only the issuer changes it. A supplier cannot raise the ceiling they
    // are billing against, which is the whole point of a PO.
    where: { id, issuedById: caller.company.id },
    select: {
      id: true, number: true, amount: true, status: true, endDate: true,
      issuedTo: { select: { name: true } },
    },
  })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No purchase order of yours with that id. Only the company that raised one can change it.' } },
      { status: 404 }
    )
  }

  const data: Record<string, unknown> = {}
  const changes: string[] = []

  if (body.amount !== undefined) {
    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'An authorised amount is above zero', field: 'amount' } },
        { status: 422 }
      )
    }
    data.amount = amount
    changes.push(
      amount > Number(existing.amount)
        ? `raised from $${Number(existing.amount).toLocaleString()} to $${amount.toLocaleString()}`
        : `reduced from $${Number(existing.amount).toLocaleString()} to $${amount.toLocaleString()}`
    )
  }

  if (body.endDate !== undefined) {
    data.endDate = body.endDate ? new Date(String(body.endDate)) : null
    changes.push(body.endDate ? `runs to ${String(body.endDate).slice(0, 10)}` : 'no end date')
  }

  if (body.status !== undefined) {
    const status = String(body.status).toUpperCase()
    if (!['OPEN', 'CLOSED', 'CANCELLED'].includes(status)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'A purchase order is OPEN, CLOSED or CANCELLED', field: 'status' } },
        { status: 422 }
      )
    }
    data.status = status
    changes.push(status.toLowerCase())
  }

  if (changes.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Nothing to change' } },
      { status: 422 }
    )
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data,
    select: { id: true, number: true, amount: true, status: true, endDate: true },
  })

  await prisma.automationLog.create({
    data: {
      companyId: caller.company.id,
      action: 'PURCHASE_ORDER_CHANGED',
      summary: `${caller.person.name} changed ${existing.number} — ${changes.join(', ')}`,
      reason: body.reason ? String(body.reason).trim() : 'Changed on the purchase orders screen',
      payload: { purchaseOrderId: id, changes },
      reversible: true,
    },
  })

  if (data.status === 'CLOSED' || data.status === 'CANCELLED') {
    void emit({
      type: 'purchase_order.closed',
      companyId: caller.company.id,
      subjectType: 'PurchaseOrder',
      subjectId: id,
      actorPersonId: caller.person.id,
      payload: { number: existing.number, status: data.status, supplier: existing.issuedTo.name },
    })
  }

  return NextResponse.json({
    data: {
      purchaseOrder: { ...updated, amount: Number(updated.amount) },
      changes,
      message: `${existing.number} ${changes.join(', ')}.`,
    },
  })
}
