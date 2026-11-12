import { NextRequest, NextResponse } from 'next/server'
import { needsVerifiedOwnerAt, gateRefusal } from '@/lib/owner-proof'
import { hasPermission } from '@/lib/permissions'
import { getCallerContext, realPersonId, refusalFor } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { payersBook } from '@/lib/money/payers-acceptance-read'
import { mayPayKeyedReceipt } from '@/lib/money/keyed-receipt'
import { staffOnly } from '@/lib/seat'
import { readRunFile } from '@/lib/money/run-file-read'
import { confirmRun, readConfirmBody, confirmedLine, type RunLineFacts } from '@/lib/money/run-confirm'
import { recordKeyedPayment } from '@/lib/money/keyed-payment'
import { paymentReference } from '@/lib/money/run-file'
import { tellSupplierPaid, type PaidFacts } from '@/lib/money/paid-notice'
import { mayOpen, refusal, PAYABLE } from '@/lib/money/desks'
import {
  proposeRun, remittanceAdvice, mayApproveRun,
  type PayableBill,
} from '@/lib/ap-delay'

/**
 * Payment runs — how money actually leaves.
 *
 * Not one bill at a time with a date typed on it. In batches: one
 * currency, one day, one file to the bank, one remittance advice per
 * supplier. Everything in `ap-delay.ts` measures `VendorBill.paidAt` and
 * until now nothing set it except a clerk.
 *
 * ── Four refusals, and they are refusals rather than warnings ────────
 *
 * **One currency per run**, because a run is a payment file and a file is
 * denominated. A total across two currencies is a total of nothing, and
 * the place it would be discovered is the bank rejecting the file.
 *
 * **A bill enters one run at a time.** The schema carries the unique key
 * and `proposeRun` says it in words before the database has to.
 *
 * **A disputed bill never enters a run.** Paying something you are
 * arguing about ends the argument in the supplier's favor and no status
 * change undoes it.
 *
 * **The approver is not the creator.** The oldest segregation of duties
 * there is: one person who can both assemble and release a payment file
 * is the entire control on money leaving the building.
 *
 * ── And every exclusion carries a reason ─────────────────────────────
 *
 * A bill that silently misses a run is a supplier who telephones, and
 * "it was not picked up" is not an answer anybody can act on.
 */

/** GET — what a run scheduled for a given day would contain. */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Payment runs')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A payment run belongs to whoever pays' } },
      { status: 403 }
    )
  }
  if (!mayOpen(caller.permissions, PAYABLE)) {
    return NextResponse.json(refusal(PAYABLE), { status: 403 })
  }

  const companyId = caller.company.id
  const url = new URL(request.url)

  // ── ?export=<run>: an approved run as a file for the payer's own system ──
  //
  // Etyme never moves money (founder, 2026-11-12). The file is read by the
  // seat that may release the run, every line through the payment gate as
  // it stands today, and the pay-to details it carries are recorded in the
  // access log before it leaves (lib/money/run-file-read). `&format=csv`
  // answers the file itself; otherwise JSON, so the screen can say what
  // was left out and why before it saves the file.
  const exportId = url.searchParams.get('export')
  if (exportId != null) {
    if (!hasPermission(caller.permissions, 'payments.record')) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: refusalFor(caller, { doing: 'Downloading a payment run', needs: 'payments.record' }) } },
        { status: 403 }
      )
    }
    if (!exportId) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Which run?', field: 'export' } }, { status: 422 })
    }
    const read = await readRunFile(caller, companyId, exportId)
    if (!read.ok) {
      return NextResponse.json({ error: { code: read.code, message: read.says } }, { status: read.status })
    }
    if (url.searchParams.get('format') === 'csv') {
      return new NextResponse(read.file.csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${read.file.filename}"`,
        },
      })
    }
    return NextResponse.json({
      data: {
        runId: read.runId,
        filename: read.file.filename,
        csv: read.file.csv,
        rows: read.file.rows,
        held: read.file.held,
        totals: read.file.totals,
        says: read.file.says,
      },
    })
  }

  const currency = (url.searchParams.get('currency') ?? 'USD').toUpperCase()
  const scheduledFor = url.searchParams.get('scheduledFor')
    ? new Date(String(url.searchParams.get('scheduledFor')))
    : new Date()

  if (Number.isNaN(scheduledFor.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'That date could not be read', field: 'scheduledFor' } },
      { status: 422 }
    )
  }

  const { payable, runs } = await loadPayable(companyId)
  const proposed = proposeRun(payable, currency, scheduledFor)

  return NextResponse.json({
    data: {
      currencies: [...new Set(payable.map((b) => b.currency.toUpperCase()))].sort(),
      proposed: {
        currency: proposed.currency,
        scheduledFor: proposed.scheduledFor,
        totalCents: proposed.totalCents,
        vendors: proposed.vendors,
        lines: proposed.lines,
        excluded: proposed.excluded.map((e) => ({
          billId: e.bill.id,
          number: e.bill.number,
          vendorName: e.bill.vendorName,
          totalCents: e.bill.totalCents,
          reason: e.reason,
          says: e.says,
        })),
        says: proposed.says,
      },
      advice: remittanceAdvice(proposed, caller.company.name),
      runs,
      note:
        'One currency, one day, one advice per supplier. An invoice receipt that misses a run is ' +
        'listed with the reason — "it was not picked up" is not an answer anybody can act on.',
    },
  })
}

/** POST — assemble a draft run. */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Payment runs')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A payment run belongs to whoever pays' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'payments.record')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: refusalFor(caller, { doing: 'Assembling a payment run', needs: 'payments.record' }) } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const body = await request.json().catch(() => ({}))
  const currency = String(body.currency ?? 'USD').toUpperCase()
  const scheduledFor = body.scheduledFor ? new Date(String(body.scheduledFor)) : new Date()

  if (Number.isNaN(scheduledFor.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'That date could not be read', field: 'scheduledFor' } },
      { status: 422 }
    )
  }

  const { payable } = await loadPayable(companyId)
  const proposed = proposeRun(payable, currency, scheduledFor)

  if (proposed.lines.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOTHING_TO_PAY', message: proposed.says } },
      { status: 422 }
    )
  }

  // Only the bills somebody asked for, where they asked for a subset.
  const only: string[] | null = Array.isArray(body.billIds)
    ? body.billIds.map((s: unknown) => String(s))
    : null
  const lines = only ? proposed.lines.filter((l) => only.includes(l.billId)) : proposed.lines

  if (lines.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: 'NOTHING_TO_PAY',
          message:
            'None of the invoice receipts named are payable in this run. Every one of them is on the ' +
            'excluded list with a reason.',
        },
      },
      { status: 422 }
    )
  }

  const total = lines.reduce((n, l) => n + l.amountCents, 0)
  const advice = remittanceAdvice({ ...proposed, lines }, caller.company.name)
  const adviceByVendor = new Map(advice.map((a) => [a.vendorCompanyId, a.text]))

  const run = await prisma.paymentRun.create({
    data: {
      companyId,
      currency: proposed.currency,
      status: 'DRAFT',
      scheduledFor,
      totalCents: total,
      createdById: realPersonId(caller),
      items: {
        create: lines.map((l) => ({
          vendorBillId: l.billId,
          amountCents: l.amountCents,
          remittance: adviceByVendor.get(l.vendorCompanyId) ?? null,
        })),
      },
    },
    select: {
      id: true, currency: true, status: true, scheduledFor: true, totalCents: true,
      items: { select: { id: true, vendorBillId: true, amountCents: true } },
    },
  })

  return NextResponse.json(
    {
      data: {
        run,
        advice,
        note:
          `Draft run of ${lines.length} invoice receipt${lines.length === 1 ? '' : 's'} in ` +
          `${proposed.currency}. It releases nothing until somebody other than you ` +
          `approves it — one person who can both assemble and release a payment file is ` +
          `the entire control on money leaving the building.`,
      },
    },
    { status: 201 }
  )
}

/** PATCH — approve a draft, or mark an approved run paid. */
export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Payment runs')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A payment run belongs to whoever pays' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'payments.record')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: refusalFor(caller, { doing: 'Releasing a payment run', needs: 'payments.record' }) } },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const body = await request.json().catch(() => ({}))
  const id = String(body.id ?? '')
  const action = String(body.action ?? '')

  if (action === 'confirm') return confirm(caller, companyId, body)

  if (!id || !['approve', 'pay', 'cancel'].includes(action)) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Which run, and one of approve, pay or cancel?',
          field: id ? 'action' : 'id',
        },
      },
      { status: 422 }
    )
  }

  const run = await prisma.paymentRun.findUnique({
    where: { id },
    select: {
      id: true, companyId: true, status: true, currency: true, createdById: true,
      scheduledFor: true, totalCents: true,
      items: {
        select: {
          vendorBillId: true, amountCents: true,
          vendorBill: { select: { id: true, totalCents: true, paidCents: true, receivedAt: true, vendorCompanyId: true, currency: true } },
        },
      },
    },
  })
  if (!run || run.companyId !== companyId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such payment run here' } },
      { status: 404 }
    )
  }

  const personId = realPersonId(caller)

  if (action === 'cancel') {
    if (run.status === 'PAID') {
      return NextResponse.json(
        {
          error: {
            code: 'ALREADY_PAID',
            message:
              'The money has gone. Cancelling the run would not bring it back — record a ' +
              'refund or a credit from the supplier instead.',
          },
        },
        { status: 422 }
      )
    }
    await prisma.paymentRun.update({ where: { id }, data: { status: 'CANCELLED' } })
    return NextResponse.json({
      data: { id, status: 'CANCELLED', note: 'Cancelled. Every invoice receipt in it is payable again.' },
    })
  }

  if (action === 'approve') {
    const verdict = mayApproveRun({ status: run.status, createdById: run.createdById }, personId ?? '')
    if (!verdict.ok) {
      return NextResponse.json(
        { error: { code: 'SEGREGATION', message: verdict.says } },
        { status: 422 }
      )
    }
    const updated = await prisma.paymentRun.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: personId },
      select: { id: true, status: true, totalCents: true, currency: true },
    })
    return NextResponse.json({
      data: {
        run: updated,
        note:
          `Approved by somebody other than whoever assembled it. Nothing is paid until the ` +
          `run is marked paid — approval is a decision, not a transfer.`,
      },
    })
  }

  // action === 'pay'
  if (run.status !== 'APPROVED') {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_APPROVED',
          message:
            `This run is ${run.status.toLowerCase()}. Money leaves on an approved run and ` +
            `on nothing else.`,
        },
      },
      { status: 422 }
    )
  }

  // "Mark it paid" says what the confirmation says: the payer's reference
  // and the day the money left (the founder, 2026-11-12). A press without
  // them is refused in a sentence naming the field, which the row draws.
  const reference = String(body.reference ?? '').trim()
  const paidOn = String(body.paidOn ?? body.paidAt ?? '').trim().slice(0, 10)
  if (!reference) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', field: 'reference', message: 'Enter the reference your bank or payment system gave this payment, then mark it paid.' } },
      { status: 422 }
    )
  }
  if (!paidOn) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', field: 'paidOn', message: 'Enter the day the money left, then mark it paid.' } },
      { status: 422 }
    )
  }
  // The proof rule (founder, 2026-11-11): a company formed under it releases
  // no money to a firm until it has a verified Owner, in the gate's own
  // sentence naming the step. Before any write.
  const owner = await needsVerifiedOwnerAt(companyId, 'PAY')
  if (!owner.ok) return NextResponse.json(gateRefusal(owner), { status: 403 })

  // ── Checked again at the moment money leaves ────────────────────────
  //
  // A run approved on Monday and released on Friday pays Friday's facts.
  // One receipt that no longer passes stops the release, named, rather
  // than leaving the run to pay part of a file somebody approved whole:
  // cancel the run, and the next one leaves that receipt out with why.
  //
  // And no money to a firm whose bank details nobody checked: the same
  // gate, read once per receipt, its bank hold told in the bank's own
  // words (the setup checklist's Bank details step), never as a receipt
  // that fails the check. Each sentence is the one the receipt's own Pay
  // and the confirmation say, for this reader. Never payroll: a run pays
  // firms only.
  const stopped: string[] = []
  const unchecked: string[] = []
  for (const i of run.items) {
    const gate = await mayPayKeyedReceipt(i.vendorBillId, personId)
    if (!gate || gate.ok) continue
    if (gate.code === 'BANK_NOT_CHECKED') {
      if (!unchecked.includes(gate.says)) unchecked.push(gate.says)
    } else stopped.push(gate.says)
  }
  if (stopped.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'MATCH_FAILED',
          message:
            `This run is not released: ${stopped.length === 1 ? 'one invoice receipt in it' : `${stopped.length} invoice receipts in it`} ` +
            `no longer ${stopped.length === 1 ? 'passes' : 'pass'} the three-way check. ${stopped.join(' ')} ` +
            `Cancel the run and assemble it again.`,
        },
      },
      { status: 422 }
    )
  }
  if (unchecked.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'BANK_NOT_CHECKED',
          step: 'BANK',
          message: `This run is not released. ${unchecked.join(' ')} Cancel the run and assemble it again without them, or check their details first.`,
        },
      },
      { status: 409 }
    )
  }

  // Every line through the one write a run's line makes, and every supplier
  // paid told once, exactly as a confirmation typed for the whole run does:
  // "Mark it paid" is that confirmation, with one reference and one day.
  return confirm(caller, companyId, { id, reference, paidOn })
}

// ── The confirmation from the payer's own system ──────────────────────
//
// `{ action: 'confirm', id, csv }` or `{ action: 'confirm', id, reference,
// paidOn }`. Etyme never moves money (founder, 2026-11-12): the payer's
// system paid, and this marks each receipt the confirmation names paid,
// through the gates a payment asks (the proof rule, the three-way check
// and the bank, `mayPayKeyedReceipt`) and the one write a run's line makes
// (`recordKeyedPayment`). A row that names nothing in this run, a
// different amount or currency, or a receipt already paid is refused in a
// sentence and nothing is written for it (lib/money/run-confirm).

async function confirm(
  caller: NonNullable<Awaited<ReturnType<typeof getCallerContext>>['caller']>,
  companyId: string,
  body: Record<string, unknown>,
) {
  const read = readConfirmBody(body)
  if (!read.ok) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: read.says, field: read.field } }, { status: 422 })
  }
  const personId = realPersonId(caller)
  if (!personId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'A payment is recorded by a person, and this request names none.' } },
      { status: 403 }
    )
  }
  const payerName = caller.company!.name

  let runCurrency = ''
  const notices = new Map<string, PaidFacts>()
  const result = await confirmRun(
    {
      ownerGate: async () => {
        const g = await needsVerifiedOwnerAt(companyId, 'PAY')
        return g.ok ? { ok: true } : { ok: false, says: g.says, href: g.href }
      },
      loadRun: async () => {
        const run = await prisma.paymentRun.findUnique({
          where: { id: read.runId },
          select: {
            id: true, companyId: true, status: true, currency: true,
            items: {
              select: {
                id: true, amountCents: true,
                vendorBill: {
                  select: {
                    id: true, number: true, currency: true, totalCents: true, paidCents: true, status: true,
                    receivedAt: true, vendorCompanyId: true, vendorCompany: { select: { name: true } },
                  },
                },
              },
              orderBy: { id: 'asc' },
            },
          },
        })
        if (!run || run.companyId !== companyId) return null
        runCurrency = run.currency
        const lines: RunLineFacts[] = run.items.map((i) => ({
          runItemId: i.id,
          billId: i.vendorBill.id,
          number: i.vendorBill.number,
          vendorName: i.vendorBill.vendorCompany.name,
          vendorCompanyId: i.vendorBill.vendorCompanyId,
          amountCents: i.amountCents,
          currency: i.vendorBill.currency,
          totalCents: i.vendorBill.totalCents,
          paidCents: i.vendorBill.paidCents,
          status: i.vendorBill.status,
          receivedAt: i.vendorBill.receivedAt,
        }))
        return { id: run.id, status: run.status, currency: run.currency, lines }
      },
      gateSays: async (billId) => {
        const gate = await mayPayKeyedReceipt(billId, personId)
        if (!gate) return 'This invoice receipt could not be read, so it is not marked paid.'
        return gate.ok ? null : gate.says
      },
      pay: async (row) => {
        const out = await prisma.$transaction((tx) =>
          recordKeyedPayment(tx, {
            billId: row.billId,
            payerCompanyId: companyId,
            payerName,
            vendorCompanyId: row.vendorCompanyId,
            vendorName: row.vendorName,
            number: row.number,
            currency: row.currency,
            amountCents: row.amountCents,
            expectPaidCents: row.expectPaidCents,
            paidAt: row.paidAt,
            payerReference: row.payerReference,
            etymeReference: paymentReference(row.runItemId),
            runId: read.runId,
            appliedById: personId,
            appliedByName: caller.person.name,
          })
        )
        if (out.ok) notices.set(out.paymentId, out.notice)
        return out
      },
    },
    read.by === 'FILE' ? { by: 'FILE', csv: read.csv } : { by: 'TYPED', reference: read.reference, paidOn: read.paidOn }
  )

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: result.code, message: result.says, ...(result.href ? { href: result.href } : {}) } },
      { status: result.status }
    )
  }

  // The supplier is told, once per payment just written, after it committed
  // (lib/money/paid-notice). A confirmation read twice writes nothing the
  // second time, so it tells nobody the second time.
  const told = new Map<string, number>()
  for (const p of result.paid) {
    told.set(p.paymentId, await tellSupplierPaid(notices.get(p.paymentId) ?? {
      paymentId: p.paymentId, payerName, vendorCompanyId: p.vendorCompanyId, number: p.number,
      amountCents: p.amountCents, currency: p.currency, paidAt: p.paidAt, payerReference: p.payerReference,
    }).catch(() => 0))
  }
  const untold = [...new Set(result.paid.filter((p) => (told.get(p.paymentId) ?? 0) === 0).map((p) => p.vendorName))]

  // The run is paid once every line in it is.
  if (result.paid.length > 0) {
    const left = await prisma.paymentRunItem.count({
      where: { runId: read.runId, vendorBill: { status: { notIn: ['PAID', 'CANCELLED'] } } },
    })
    if (left === 0) {
      const last = result.paid.reduce((d, p) => (p.paidAt > d ? p.paidAt : d), result.paid[0].paidAt)
      await prisma.paymentRun.updateMany({ where: { id: read.runId, status: 'APPROVED' }, data: { status: 'PAID', paidAt: last } })
    }
  }

  return NextResponse.json({
    data: {
      runId: read.runId,
      currency: runCurrency,
      paid: result.paid.map((p) => ({
        reference: paymentReference(p.runItemId), number: p.number, vendorName: p.vendorName,
        amountMinor: p.amountCents, currency: p.currency, paidOn: p.paidAt.toISOString().slice(0, 10),
        payerReference: p.payerReference, paymentId: p.paymentId,
        suppliersTold: told.get(p.paymentId) ?? 0,
      })),
      refused: result.refused,
      says:
        result.says +
        (untold.length > 0
          ? ` ${untold.join(', ')} ${untold.length === 1 ? 'has' : 'have'} nobody on Etyme to tell, so tell them yourself.`
          : result.paid.length > 0 ? ' Each supplier paid is told, in the app and by email where email can leave.' : ''),
    },
  })
}

// ── Shared loading ────────────────────────────────────────────────────

async function loadPayable(companyId: string) {
  const [bills, liveRuns] = await Promise.all([
    prisma.vendorBill.findMany({
      where: { companyId, status: { notIn: ['CANCELLED'] } },
      select: {
        id: true, number: true, currency: true, totalCents: true, paidCents: true,
        dueAt: true, status: true, buyContractId: true, periodStart: true, periodEnd: true,
        vendorCompany: { select: { id: true, name: true } },
        paymentRunItems: {
          where: { run: { status: { in: ['DRAFT', 'APPROVED'] } } },
          select: { runId: true },
        },
      },
      orderBy: { dueAt: 'asc' },
      take: 5_000,
    }),
    prisma.paymentRun.findMany({
      where: { companyId },
      select: {
        id: true, currency: true, status: true, scheduledFor: true, paidAt: true,
        totalCents: true,
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  // A week the payer has not accepted keeps the invoice over it out of
  // every run. Asked only of what a run could otherwise pay — approved,
  // with something left owing, against a buy contract and a period.
  const notAccepted = new Map<string, string>()
  for (const b of bills) {
    if (b.status !== 'APPROVED' || b.totalCents - b.paidCents <= 0) continue
    if (!b.buyContractId || !b.periodStart || !b.periodEnd) continue
    const book = await payersBook({
      buyContractId: b.buyContractId, periodStart: b.periodStart, periodEnd: b.periodEnd, then: 'pay',
    })
    if (book && book.waiting.length > 0) notAccepted.set(b.id, book.notAccepted)
  }

  // And the one gate a payment asks (lib/money/keyed-receipt): approved
  // once is not payable for ever. A receipt whose order has since filled,
  // or whose week another receipt was paid for, is left out with why.
  const refused = new Map<string, string>()
  for (const b of bills) {
    if (b.status !== 'APPROVED' || b.totalCents - b.paidCents <= 0 || notAccepted.has(b.id)) continue
    const gate = await mayPayKeyedReceipt(b.id)
    if (gate && !gate.ok) refused.set(b.id, gate.says)
  }

  const payable: PayableBill[] = bills.map((b) => ({
    notAccepted: notAccepted.get(b.id) ?? null,
    refused: refused.get(b.id) ?? null,
    id: b.id,
    number: b.number,
    vendorCompanyId: b.vendorCompany.id,
    vendorName: b.vendorCompany.name,
    currency: b.currency,
    totalCents: b.totalCents,
    paidCents: b.paidCents,
    dueAt: b.dueAt,
    status: b.status,
    inRunId: b.paymentRunItems[0]?.runId ?? null,
  }))

  // A paid run says who confirmed it, when, and the payer's reference,
  // read from the payment rows its confirmation wrote, so a reload keeps
  // what the person who brought the file back saw.
  const paidIds = liveRuns.filter((r) => r.status === 'PAID').map((r) => r.id)
  const confirmations = paidIds.length === 0 ? [] : await prisma.payment.findMany({
    where: {
      payerCompanyId: companyId,
      method: 'PAYMENT_RUN',
      vendorBill: { paymentRunItems: { some: { runId: { in: paidIds } } } },
    },
    select: {
      reference: true, appliedAt: true,
      appliedBy: { select: { name: true } },
      vendorBill: { select: { paymentRunItems: { where: { runId: { in: paidIds } }, select: { runId: true } } } },
    },
    take: 5_000,
  })
  const byRun = new Map<string, { appliedAt: Date | null; appliedByName: string | null; reference: string | null }[]>()
  for (const p of confirmations) {
    for (const i of p.vendorBill?.paymentRunItems ?? []) {
      const list = byRun.get(i.runId) ?? []
      list.push({ appliedAt: p.appliedAt, appliedByName: p.appliedBy?.name ?? null, reference: p.reference })
      byRun.set(i.runId, list)
    }
  }
  const runs = liveRuns.map((r) => ({
    ...r,
    confirmed: r.status === 'PAID' ? confirmedLine(r.id, byRun.get(r.id) ?? []) : null,
  }))

  return { payable, runs }
}
