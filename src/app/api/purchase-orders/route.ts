import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { emit } from '@/lib/events'
import { poBalance } from '@/lib/purchase-order'
import { mayWriteOrder, shellNotice } from '@/lib/off-system'
import { nounFor, referenceFor, sideOf } from '@/lib/order-naming'

/**
 * GET  /api/purchase-orders — what is authorized, and how much is left
 * POST /api/purchase-orders — raise one
 *
 * Purchase orders were read in five places and created in none. The three
 * way match asks whether an invoice quotes a valid, open, unexhausted PO —
 * so on a real company with no way to raise one, that check could only ever
 * fail. The money chain worked on seeded data and stopped at the first
 * real customer.
 *
 * A PO is not a contract. A contract carries a rate — what one person costs
 * per hour. A PO carries a ceiling — how much the payer has authorized in
 * total, across however many people. Raising one is an accounts-payable act
 * and needs invoices.issue rather than assignments.write.
 *
 * ── One row, read from whichever end you stand at ────────────────────
 *
 * This route is `/api/purchase-orders` because that is the address the
 * client's AP desk learned, and an address is not a word anybody reads.
 * The row underneath is a `WorkOrder`: the client's purchase order and
 * the supplier's sales order are the same paper, and `lib/order-naming`
 * decides which of the two words each reader is shown. Before the merge
 * the seller's half of it — the billing basis, the milestones, the
 * four-party split and the term that says silence approves a timesheet —
 * lived on a `SalesOrder` row nothing had ever created.
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

  const pos = await prisma.workOrder.findMany({
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
      id: true, number: true, sellerNumber: true, title: true,
      amount: true, currency: true,
      startDate: true, endDate: true, status: true,
      issuedById: true, issuedToId: true, billToId: true, payerId: true,
      recordedById: true,
      billingBasis: true, paymentTerms: true,
      autoApproveTimesheets: true, approvalWindowDays: true,
      issuedBy: { select: { id: true, name: true, claimedAt: true } },
      issuedTo: { select: { id: true, name: true, claimedAt: true } },
      invoices: { select: { total: true, status: true } },
      _count: { select: { sellContracts: true, milestones: true } },
    },
  })

  const rows = pos.map((po) => {
    // Void and cancelled invoices never consumed anything. Counting them
    // would show a PO as exhausted while money remained authorized on it.
    const invoicedCents = po.invoices
      .filter((i) => !['VOID', 'CANCELLED'].includes(i.status))
      .reduce((sum, i) => sum + Math.round(Number(i.total) * 100), 0)

    const balance = poBalance({
      amountCents: Math.round(Number(po.amount) * 100),
      invoicedCents,
      status: po.status as any,
      endDate: po.endDate,
    })

    // What this reader calls it. A client reads "purchase order"; the
    // supplier reads the same row as its sales order.
    const side = sideOf(po, companyId)
    const noun = nounFor(po, companyId)
    const counterparty = side === 'SELLER' ? po.issuedBy : po.issuedTo

    return {
      id: po.id,
      number: po.number,
      sellerNumber: po.sellerNumber,
      title: po.title,
      /** BUYER · SELLER · BYSTANDER — which end of it you are at. */
      side,
      /** "purchase order" or "sales order", never both on one screen. */
      noun: noun.noun,
      nounCapitalized: noun.Noun,
      short: noun.short,
      reference: referenceFor(po, companyId).reference,
      direction: po.issuedById === companyId ? 'issued' : 'received',
      counterparty,
      /** Said out loud where the other end of it has not joined. */
      offSystem: shellNotice(counterparty),
      /** Recorded by the other party, on paper they were handed. */
      recordedByCounterparty: po.recordedById !== po.issuedById,
      billingBasis: po.billingBasis,
      paymentTerms: po.paymentTerms,
      autoApproveTimesheets: po.autoApproveTimesheets,
      approvalWindowDays: po.approvalWindowDays,
      milestones: po._count.milestones,
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
      // The address is the client's word and stays; each row carries
      // its own `noun` for whoever is reading it.
      orders: rows,
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
  // Authorizing spend is an accounts-payable act, not a contracting one.
  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Raising a purchase order needs invoices.issue' } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const body = await request.json().catch(() => ({}))

  const number = String(body.number ?? '').trim()
  const amount = Number(body.amount)
  const startDate = body.startDate ? new Date(String(body.startDate)) : new Date()
  const endDate = body.endDate ? new Date(String(body.endDate)) : null

  // ── Which end of it the caller is ──────────────────────────────────
  //
  // Ordinarily the buyer: `issuedToId` names the supplier and the caller
  // is the payer, which is what a purchase order is. A supplier whose
  // client is not on Etyme passes `issuedById` instead — the client that
  // handed it the paper — and records the order it received. The rule
  // that decides whether that is allowed is in `lib/off-system` and it
  // turns on one thing: the other firm must be a shell.
  const recordingForBuyer = Boolean(body.issuedById) && String(body.issuedById) !== companyId
  const issuedById = recordingForBuyer ? String(body.issuedById) : companyId
  const issuedToId = recordingForBuyer ? String(body.issuedToId ?? companyId) : String(body.issuedToId ?? '')

  if (!number) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A purchase order needs the number your finance team will recognize', field: 'number' } },
      { status: 422 }
    )
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A purchase order needs an authorized amount above zero', field: 'amount' } },
      { status: 422 }
    )
  }
  if (endDate && endDate.getTime() <= startDate.getTime()) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A purchase order cannot end before it starts', field: 'endDate' } },
      { status: 422 }
    )
  }

  const [buyer, seller] = await Promise.all([
    prisma.company.findUnique({
      where: { id: issuedById },
      select: { id: true, name: true, claimedAt: true, listedById: true },
    }),
    prisma.company.findUnique({
      where: { id: issuedToId },
      select: { id: true, name: true, claimedAt: true, listedById: true },
    }),
  ])

  if (!seller) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say which supplier this authorizes', field: 'issuedToId' } },
      { status: 422 }
    )
  }
  if (!buyer) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message:
            'No company of that id. If the client who gave you this order is not on Etyme, list them first and use the id you get back.',
          field: 'issuedById',
        },
      },
      { status: 422 }
    )
  }

  // ── May this firm write this order at all? ─────────────────────────
  //
  // Refuses two things in words: raising one to yourself, and recording
  // one in the name of a firm that is here and could have raised it. The
  // second is the trap — a firm naming a real tenant as its client with
  // nobody at that tenant involved.
  const allowed = mayWriteOrder({ callerCompanyId: companyId, buyer, seller })
  if (!allowed.ok) {
    return NextResponse.json(
      { error: { code: 'NOT_YOURS', message: allowed.says, field: recordingForBuyer ? 'issuedById' : 'issuedToId' } },
      { status: 403 }
    )
  }

  // The number is unique per issuer in the database. Catching it here means
  // the message names the existing PO rather than surfacing a constraint.
  const clash = await prisma.workOrder.findFirst({
    where: { issuedById, number },
    select: { id: true, issuedTo: { select: { name: true } }, amount: true },
  })
  if (clash) {
    return NextResponse.json(
      {
        error: {
          code: 'DUPLICATE',
          message: `${number} already exists — it authorizes $${Number(clash.amount).toLocaleString()} to ${clash.issuedTo.name}.`,
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

  // ── The terms that had nowhere to live ─────────────────────────────
  //
  // Every one of these was on `SalesOrder`, and nothing had ever written
  // a `SalesOrder`. `autoApproveTimesheets` is the one that was costing
  // money: `cron/auto-approve` read it off a row that did not exist, so
  // the flag was false on every timesheet in the world and the nightly
  // job approved nothing from the day it was written.
  //
  // It is the buyer's term — the client agreeing that its own silence
  // counts. A seller can only ever set it while transcribing a shell
  // client's paper, which is the case `mayWriteOrder` has already
  // allowed, and the row records who typed it in.
  const billingBasis = ['TIME', 'MILESTONE', 'BOTH'].includes(String(body.billingBasis ?? '').toUpperCase())
    ? String(body.billingBasis).toUpperCase()
    : 'TIME'

  const approvalWindowDays =
    body.approvalWindowDays == null || body.approvalWindowDays === ''
      ? null
      : Number(body.approvalWindowDays)
  if (approvalWindowDays != null && (!Number.isInteger(approvalWindowDays) || approvalWindowDays < 1)) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'The window a client has to answer a timesheet is a whole number of working days, at least one.',
          field: 'approvalWindowDays',
        },
      },
      { status: 422 }
    )
  }

  const po = await prisma.workOrder.create({
    data: {
      number,
      sellerNumber: body.sellerNumber ? String(body.sellerNumber).trim() : null,
      title: body.title ? String(body.title).trim() : null,
      issuedById: buyer.id,
      issuedToId: seller.id,
      recordedById: allowed.recordedById,
      amount,
      currency,
      startDate,
      endDate,
      status: 'OPEN',
      billingBasis,
      billToId: body.billToId ? String(body.billToId) : null,
      shipToId: body.shipToId ? String(body.shipToId) : null,
      payerId: body.payerId ? String(body.payerId) : null,
      ...(body.paymentTerms != null && Number.isInteger(Number(body.paymentTerms))
        ? { paymentTerms: Number(body.paymentTerms) }
        : {}),
      autoApproveTimesheets: body.autoApproveTimesheets === true,
      approvalWindowDays,
      engagementId: body.engagementId ? String(body.engagementId) : null,
      msaId: body.msaId ? String(body.msaId) : null,
    },
    select: {
      id: true, number: true, sellerNumber: true, amount: true, currency: true,
      startDate: true, endDate: true, billingBasis: true,
      autoApproveTimesheets: true, approvalWindowDays: true,
      issuedById: true, issuedToId: true, billToId: true, payerId: true,
    },
  })

  // Attach it to contracts that were already running against this supplier
  // with no PO. Without this the PO exists and every invoice still fails
  // the check, which reads as the feature not working.
  let attached = 0
  if (body.attachExistingContracts !== false) {
    const result = await prisma.sellContract.updateMany({
      where: {
        // The seller's own running contracts with this buyer, whichever
        // of the two recorded the order. A supplier entering the paper
        // its client handed it wants exactly this: the placements it is
        // already running now bill against the ceiling that authorizes
        // them.
        companyId: seller.id,
        clientCompanyId: buyer.id,
        workOrderId: null,
        state: { in: ['IN_PROGRESS', 'PAUSED'] },
      },
      data: { workOrderId: po.id },
    })
    attached = result.count
  }

  await prisma.automationLog.create({
    data: {
      companyId,
      action: allowed.onBehalf ? 'WORK_ORDER_RECORDED' : 'PURCHASE_ORDER_RAISED',
      summary: allowed.onBehalf
        ? `${caller.person.name} recorded ${buyer.name}'s order ${number} — $${amount.toLocaleString()} authorized to ${seller.name}`
        : `${caller.person.name} authorized $${amount.toLocaleString()} to ${seller.name} on ${number}`,
      reason: allowed.onBehalf
        ? allowed.says
        : attached > 0
          ? `${attached} running contract(s) with no PO were attached to it`
          : 'Raised from the purchase orders screen',
      payload: { workOrderId: po.id, number, supplierId: seller.id, amount, attached, onBehalf: allowed.onBehalf },
      reversible: true,
    },
  })

  void emit({
    type: 'purchase_order.raised',
    companyId,
    subjectType: 'WorkOrder',
    subjectId: po.id,
    actorPersonId: caller.person.id,
    payload: {
      number,
      supplierCompanyId: seller.id,
      supplierName: seller.name,
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
        // Neutral in the payload; `noun` beside it says what this
        // reader calls it. The screen never prints the schema's word.
        order: {
          ...po,
          amount: Number(po.amount),
          startDate: po.startDate.toISOString().slice(0, 10),
          endDate: po.endDate?.toISOString().slice(0, 10) ?? null,
        },
        contractsAttached: attached,
        /** What the caller's own side calls this row. */
        noun: nounFor(po, companyId).noun,
        recordedForThem: allowed.onBehalf,
        message:
          (allowed.onBehalf
            ? `${allowed.says} `
            : '') +
          (attached > 0
            ? `${number} authorizes $${amount.toLocaleString()} to ${seller.name}, and ${attached} running contract(s) now bill against it.`
            : `${number} authorizes $${amount.toLocaleString()} to ${seller.name}.`) +
          (po.autoApproveTimesheets
            ? ` A timesheet nobody answers within ${po.approvalWindowDays ?? 'the default number of'} working days is approved.`
            : ''),
      },
    },
    { status: 201 }
  )
}

/**
 * PATCH /api/purchase-orders — change the ceiling, or close it
 *
 * Increasing an authorization is the ordinary remedy when a PO runs out
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

  const existing = await prisma.workOrder.findFirst({
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
        { error: { code: 'VALIDATION', message: 'An authorized amount is above zero', field: 'amount' } },
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

  const updated = await prisma.workOrder.update({
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
      payload: { workOrderId: id, changes },
      reversible: true,
    },
  })

  if (data.status === 'CLOSED' || data.status === 'CANCELLED') {
    void emit({
      type: 'purchase_order.closed',
      companyId: caller.company.id,
      subjectType: 'WorkOrder',
      subjectId: id,
      actorPersonId: caller.person.id,
      payload: { number: existing.number, status: data.status, supplier: existing.issuedTo.name },
    })
  }

  return NextResponse.json({
    data: {
      order: { ...updated, amount: Number(updated.amount) },
      changes,
      message: `${existing.number} ${changes.join(', ')}.`,
    },
  })
}
