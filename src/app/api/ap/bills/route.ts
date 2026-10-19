import { NextRequest, NextResponse } from 'next/server'
import { alreadyOnABill } from '@/lib/money/billed-elsewhere'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { notifyBulk } from '@/lib/notify'
import { completeCycle } from '@/lib/cycle-complete'
import { staffOnly } from '@/lib/seat'
import {
  mayOpen, refusal, mayRecordSupplierInvoice, PAYABLE, NOT_THE_PAYING_DESK,
} from '@/lib/money/desks'
import { decimalsFor } from '@/lib/money'
import { canAttachPoToBuyContract } from '@/lib/purchase-order'
import { exceptionQueue, CHECK_PHRASE } from '@/lib/three-way-match'
import {
  checkKeyedReceipt, keyedPayGate, asKeyed, KEYED_SELECT,
} from '@/lib/money/keyed-receipt'
import { amount } from '@/lib/money-display'
import { formatDay } from '@/lib/format-date'
import { readLines } from '@/lib/money/keyed-lines'
import {
  booksFor, noteMoneyRead, seatMayPay, seatedRefusal, moneyTrailFor,
} from '@/lib/money/seated-books'

/**
 * Supplier bills — the record without which nothing on the AP screen exists.
 *
 * ── Why this route is not optional ───────────────────────────────────
 *
 * `GET /api/ap` measures how long money takes to travel down a chain.
 * Every figure on it — days payable, chain float, who is financing whom —
 * comes off `VendorBill`, and a column nothing writes to is a feature
 * nobody has. So the measuring and the recording land together.
 *
 * ── Three dates, deliberately ────────────────────────────────────────
 *
 * `receivedAt`, `dueAt`, `paidAt`. Most systems keep one and call it the
 * invoice date, which is exactly what makes payment delay unmeasurable:
 * with one date you can say what is outstanding and you cannot say
 * whether anybody was late, and you certainly cannot say who funded the
 * gap.
 *
 *   **receivedAt** starts the clock. Not the end of the period the bill
 *   covers — a period ending on the 31st and billed on the 6th is six
 *   days nobody was counting.
 *
 *   **dueAt** is the terms, as they were actually applied to this bill
 *   rather than as a policy somewhere says they should be.
 *
 *   **paidAt** is the day money left. Null until it does, and never
 *   inferred from a status: "APPROVED" is a decision and not a payment.
 *
 * ── What it refuses ──────────────────────────────────────────────────
 *
 * A duplicate bill number from the same supplier, because paying the
 * same invoice twice is the commonest and most expensive AP error and
 * the schema already carries the unique key for it.
 *
 * A bill against a buy contract that employs somebody directly. You do
 * not receive a supplier invoice from your own W2 employee — they are
 * paid through payroll — and the same check that refuses a purchase
 * order there refuses a bill here.
 */

/** RECEIVED · APPROVED · DISPUTED · PAID · CANCELLED */
const STATUSES = ['RECEIVED', 'APPROVED', 'DISPUTED', 'PAID', 'CANCELLED']

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Invoice receipts')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'An invoice receipt is owed by a company' } },
      { status: 403 }
    )
  }

  // Whose payables this bill lands on. An MSP's AP clerk keying in an
  // off-platform supplier's invoice for the client it runs is recording
  // it on the CLIENT's books, under the client's own desk — never on the
  // office's, where nobody owes it.
  const { books: reading, error: booksError } = await booksFor(caller, request)
  if (booksError) return booksError

  if (!mayRecordSupplierInvoice(reading.caller.permissions)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: reading.seat
            ? seatedRefusal(reading.seat, 'Recording what a supplier has invoiced')
            : NOT_THE_PAYING_DESK,
        },
      },
      { status: 403 }
    )
  }

  const companyId = reading.companyId
  const body = await request.json().catch(() => ({}))

  const vendorCompanyId = String(body.vendorCompanyId ?? '')
  const number = String(body.number ?? '').trim()
  const currency = String(body.currency ?? 'USD').toUpperCase()
  const buyContractId = body.buyContractId ? String(body.buyContractId) : null
  const workOrderId = body.workOrderId ? String(body.workOrderId) : null
  const projectOrderId = body.projectOrderId ? String(body.projectOrderId) : null
  const payWhenPaid = body.payWhenPaid === true

  if (!vendorCompanyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'An invoice comes from a named supplier', field: 'vendorCompanyId' } },
      { status: 422 }
    )
  }
  if (vendorCompanyId === companyId) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'A company cannot invoice itself. An invoice has two parties.',
          field: 'vendorCompanyId',
        },
      },
      { status: 422 }
    )
  }
  if (!number) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'An invoice needs the supplier’s own number — it is how they will chase it',
          field: 'number',
        },
      },
      { status: 422 }
    )
  }

  // Accepted in whole currency, the way it reads on the supplier's
  // invoice, and stored in minor units like everything else. The exponent
  // comes from the currency.
  const totalValue = Number(body.total)
  if (!Number.isFinite(totalValue) || totalValue <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'An invoice is for a positive amount', field: 'total' } },
      { status: 422 }
    )
  }
  const totalCents = Math.round(totalValue * 10 ** decimalsFor(currency))

  // ── Its lines, where the clerk typed them ──────────────────────────
  //
  // One line per week, approved expense or accepted milestone the
  // supplier's invoice bills (lib/money/keyed-lines). Without lines the
  // receipt is a total, checked on its amount as before. Hours and a rate
  // on the receipt itself and on its lines would be two answers to one
  // question, so only one is taken.
  const linesRead = readLines(body.lines, currency)
  if (linesRead && !linesRead.ok) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: linesRead.says, field: linesRead.field } },
      { status: 422 }
    )
  }
  const lines = linesRead?.ok ? linesRead.lines : null
  if (lines && (body.hours != null || body.rateCents != null)) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Give the hours and the rate on the lines, or on the invoice receipt as a whole, not both.',
          field: 'lines',
        },
      },
      { status: 422 }
    )
  }

  const receivedAt = body.receivedAt ? new Date(String(body.receivedAt)) : new Date()
  const dueAt = body.dueAt ? new Date(String(body.dueAt)) : null
  const paidAt = body.paidAt ? new Date(String(body.paidAt)) : null
  const periodStart = body.periodStart ? new Date(String(body.periodStart)) : null
  const periodEnd = body.periodEnd ? new Date(String(body.periodEnd)) : null

  for (const [field, d] of [
    ['receivedAt', receivedAt], ['dueAt', dueAt], ['paidAt', paidAt],
    ['periodStart', periodStart], ['periodEnd', periodEnd],
  ] as const) {
    if (d && Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: `That ${field} could not be read`, field } },
        { status: 422 }
      )
    }
  }

  if (!dueAt) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message:
            'An invoice needs a due date. Without one there are no terms to measure against, ' +
            'and every delay figure on this supplier becomes a gap rather than a number.',
          field: 'dueAt',
        },
      },
      { status: 422 }
    )
  }
  if (dueAt < receivedAt) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'An invoice cannot fall due before it arrived',
          field: 'dueAt',
        },
      },
      { status: 422 }
    )
  }

  const status = String(body.status ?? (paidAt ? 'PAID' : 'RECEIVED')).toUpperCase()
  if (!STATUSES.includes(status)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `Status must be one of ${STATUSES.join(', ')}`, field: 'status' } },
      { status: 422 }
    )
  }

  const vendor = await prisma.company.findUnique({
    where: { id: vendorCompanyId },
    select: { id: true, name: true },
  })
  if (!vendor) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such supplier' } }, { status: 404 })
  }

  // ── A bill is not received from your own employee ───────────────────
  //
  // The same contradiction the purchase-order check refuses: a W2 buy
  // contract has no supplier on the other side of it. A person paid
  // through payroll does not send an invoice, and a worker carried here
  // as a supplier is the shape of a misclassification finding.
  if (buyContractId) {
    const bc = await prisma.buyContract.findUnique({
      where: { id: buyContractId },
      select: { id: true, companyId: true, contractType: true, vendorCompanyId: true },
    })
    if (!bc || bc.companyId !== companyId) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No such buy contract here', field: 'buyContractId' } },
        { status: 404 }
      )
    }
    const allowed = canAttachPoToBuyContract({
      vendorCompanyId: bc.vendorCompanyId,
      contractType: bc.contractType,
    })
    if (!allowed.allowed) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: allowed.reason, field: 'buyContractId' } },
        { status: 422 }
      )
    }
  }

  const duplicate = await prisma.vendorBill.findUnique({
    where: { companyId_vendorCompanyId_number: { companyId, vendorCompanyId, number } },
    select: { id: true, totalCents: true, receivedAt: true },
  })
  if (duplicate) {
    return NextResponse.json(
      {
        error: {
          code: 'DUPLICATE',
          message:
            `${vendor.name} invoice ${number} is already recorded, received on ` +
            `${duplicate.receivedAt.toISOString().slice(0, 10)}. Paying the same invoice ` +
            `twice is the commonest and most expensive mistake on this side of the ledger, ` +
            `so it is refused rather than added.`,
          field: 'number',
        },
      },
      { status: 409 }
    )
  }

  // ── The ceiling, the hours behind the bill, and the same work twice ──
  //
  // One check for a typed-in receipt, the one the payment and the payment
  // run ask again (lib/money/keyed-receipt): the order — the one named,
  // else the buy line's own, because the walk's $4,720 receipt went
  // through a $1,000 order the clerk had not typed in — what everything
  // already drawn on it leaves; the weeks we accepted and what they come
  // to at the agreed rate; and every other live receipt from this
  // supplier on this line, because a week received under TP-A was
  // received again under TP-A2 and both were paid. An unwaivable failure
  // is a refusal; a waivable one is recorded as DISPUTED with the reason.
  if (workOrderId) {
    const po = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { issuedById: true } })
    if (!po || po.issuedById !== companyId) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'No such purchase order of ours. A PO belongs to whoever pays.',
            field: 'workOrderId',
          },
        },
        { status: 404 }
      )
    }
  }

  const check = await checkKeyedReceipt(
    {
      id: null,
      companyId,
      vendorCompanyId,
      vendorName: vendor.name,
      number,
      buyContractId,
      workOrderId,
      periodStart,
      periodEnd,
      currency,
      totalCents,
      hours: body.hours != null ? Number(body.hours) : null,
      rateCents: body.rateCents != null ? Math.round(Number(body.rateCents)) : null,
      lines,
    },
    'record'
  )
  // The period the receipt covers: as typed, else the span its lines bill.
  const coversFrom = periodStart ?? check.period?.start ?? null
  const coversTo = periodEnd ?? check.period?.end ?? null

  // ── A week we have not accepted blocks the invoice ─────────────────
  //
  // The founder, 2026-09-28 (CLAUDE.md, "What each rung may bill, and
  // when", rule 3). Refused here, before anything is written, and not
  // recorded as disputed: a disputed invoice is one somebody may still
  // wave through with a reason, and this one nobody may. Accept the
  // week, then record the invoice. The sentence names the week and the
  // firm that must accept it.
  if (check.notAccepted) {
    return NextResponse.json(
      {
        error: {
          code: 'WEEK_NOT_ACCEPTED',
          message: check.notAccepted.says,
          weeks: check.notAccepted.waiting.map((w) => ({
            timesheetId: w.id,
            weekOf: w.periodStart.toISOString().slice(0, 10),
            personName: w.personName,
          })),
        },
      },
      { status: 422 }
    )
  }
  if (check.hard) {
    return NextResponse.json(
      { error: { code: check.hard.code, message: check.hard.says, field: 'workOrderId' } },
      { status: 422 }
    )
  }
  // The same work under another number. Named, and never waved through.
  if (check.duplicate) {
    return NextResponse.json(
      { error: { code: 'ALREADY_RECEIVED', message: check.duplicate.says, receipts: [check.duplicate.number] } },
      { status: 409 }
    )
  }

  const match = check.match
  const unwaivable = match.checks.filter((c) => c.outcome === 'FAIL' && c.overridable === false)
  if (unwaivable.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'MATCH_FAILED',
          message:
            `${unwaivable[0].reason.replace(/\.$/, '')}. Nobody can wave this through: ` +
            `${unwaivable.map((c) => CHECK_PHRASE[c.code]).join(' and ')} ` +
            `${unwaivable.length === 1 ? 'is' : 'are'} not a judgment call.`,
          checks: match.checks,
        },
      },
      { status: 422 }
    )
  }

  // ── Hours already on a bill the supplier generated here ────────────
  //
  // The same document reaches the record two ways: the supplier
  // generates its bill to us here, or we key in the invoice it sent.
  // Whichever came first, the second never owes the same hours again
  // (lib/money/billed-elsewhere). Nobody can wave it through: paying
  // twice is not a judgment call.
  //
  // A receipt typed in with lines holds only the weeks its hours lines
  // name, the rule `alreadyReceived` already keeps between two receipts:
  // its period is the span of everything it bills, so an expense dated a
  // fortnight earlier stretched it over weeks it does not bill and the
  // intake refused hours the receipt never claimed (walk, 2026-10-19:
  // Priya Raman's week of Oct 8 with her Sep 24 travel). A receipt with
  // lines and no hours line holds no week; its expense or milestone is
  // checked against the supplier's bills by the line check.
  const hourLineIds = lines ? lines.flatMap((l) => (l.timesheetId ? [l.timesheetId] : [])) : []
  const spans: { from: Date; to: Date }[] = lines && lines.length > 0
    ? (await prisma.timesheet.findMany({ where: { id: { in: hourLineIds } }, select: { periodStart: true, periodEnd: true } }))
        .map((t) => ({ from: t.periodStart, to: t.periodEnd }))
    : coversFrom && coversTo ? [{ from: coversFrom, to: coversTo }] : []
  if (spans.length > 0) {
    const spanFrom = spans.reduce((a, x) => (x.from < a ? x.from : a), spans[0].from)
    const spanTo = spans.reduce((a, x) => (x.to > a ? x.to : a), spans[0].to)
    const people = buyContractId
      ? (await prisma.buyContractCandidate.findMany({ where: { buyContractId }, select: { personId: true } })).map((c) => c.personId)
      : null
    const generated = await prisma.invoice.findMany({
      where: {
        status: { notIn: ['DRAFT', 'CANCELLED', 'VOID'] },
        invoiceLines: {
          some: {
            sellContract: { companyId: vendorCompanyId, clientCompanyId: companyId },
            timesheet: { periodStart: { lte: spanTo }, periodEnd: { gte: spanFrom } },
          },
        },
      },
      select: {
        number: true,
        invoiceLines: {
          where: { sellContract: { companyId: vendorCompanyId, clientCompanyId: companyId }, timesheetId: { not: null } },
          select: { personId: true, person: { select: { name: true } }, timesheet: { select: { days: true } } },
        },
      },
    })
    const onRecord = generated.map((g) => ({
      number: g.number,
      vendorName: vendor.name,
      lines: g.invoiceLines.flatMap((l) =>
        l.personId && l.timesheet
          ? [{ personId: l.personId, personName: l.person?.name ?? 'Somebody', days: (l.timesheet.days as Record<string, number>) ?? {} }]
          : []
      ),
    }))
    for (const span of spans) {
      const twice = alreadyOnABill(
        { periodStart: span.from.toISOString().slice(0, 10), periodEnd: span.to.toISOString().slice(0, 10), personIds: people },
        onRecord
      )
      if (twice) {
        return NextResponse.json(
          { error: { code: 'ALREADY_BILLED', message: twice.says, bills: twice.bills } },
          { status: 409 }
        )
      }
    }
  }

  // A waivable failure does not refuse the bill; it records it as
  // disputed, which is the state that keeps it out of a payment run until
  // somebody with authority says why it should go in.
  const failedSoft = match.checks.filter((c) => c.outcome === 'FAIL')
  const statusAfterMatch = failedSoft.length > 0 ? 'DISPUTED' : status

  // Recorded as already paid, it is paid on the same check as any other
  // payment: a receipt that does not pass is not written down as settled.
  const paidOnIntake = paidAt != null || Number(body.paid ?? 0) > 0 || status === 'PAID'
  if (failedSoft.length > 0 && paidOnIntake) {
    return NextResponse.json(
      {
        error: {
          code: 'MATCH_FAILED',
          message:
            `${match.summary.replace(/[.\s]+$/, '')}. A receipt that does not pass the check is not recorded as paid. ` +
            `Record it without a paid date and it is held as disputed.`,
          checks: match.checks,
        },
      },
      { status: 422 }
    )
  }

  // ── Checked before saving ─────────────────────────────────────────
  //
  // The screen asks what the check would say before the clerk saves, and
  // it is the same check, run to this point, writing nothing: every
  // refusal above has already been said in its own sentence, and what is
  // left is whether the receipt would be recorded clean or held.
  if (body.preview === true) {
    return NextResponse.json({
      data: {
        preview: true,
        wouldBe: statusAfterMatch,
        match: {
          matched: match.matched,
          cleanMatch: match.cleanMatch,
          summary: match.summary,
          checks: match.checks,
          poAfter: match.poAfter,
        },
        note: failedSoft.length > 0
          ? `It would be recorded and held. ${match.summary.replace(/[.\s]+$/, '')}. It stays out of a payment run until ` +
            `somebody whose role pays waives the difference with a reason, or the supplier sends a corrected invoice.`
          : 'It passes the check. Record it, and it can be paid on its due date.',
      },
    })
  }

  const bill = await prisma.vendorBill.create({
    data: {
      companyId,
      vendorCompanyId,
      number,
      buyContractId,
      // The order it draws on, named or the line's own, so the next
      // receipt's ceiling counts this one.
      workOrderId: check.workOrderId,
      projectOrderId,
      periodStart: coversFrom,
      periodEnd: coversTo,
      currency,
      totalCents,
      paidCents: paidAt ? totalCents : Math.round(Number(body.paid ?? 0) * 10 ** decimalsFor(currency)),
      receivedAt,
      dueAt,
      paidAt,
      status: statusAfterMatch,
      payWhenPaid,
      // Written with the receipt, in one statement, so a receipt is never
      // on the record without the lines it was checked on.
      ...(lines
        ? {
            lines: {
              create: lines.map((l) => ({
                timesheetId: l.timesheetId,
                expenseId: l.expenseId,
                milestoneId: l.milestoneId,
                personId: l.personId ?? check.linePeople?.[l.id] ?? null,
                hours: l.hours,
                rateCents: l.rateCents,
                amountCents: l.amountCents,
              })),
            },
          }
        : {}),
    },
    select: { id: true, number: true, totalCents: true, currency: true, dueAt: true, status: true },
  })

  // A bill that did not match is a decision for the AP desk, not a row
  // to find. Everybody who can record a payment here is told which
  // check failed and why; the decisions queue carries it until it is
  // waived with a reason or paid.
  if (statusAfterMatch === 'DISPUTED') {
    const [desk, vendor] = await Promise.all([
      prisma.context.findMany({
        where: { companyId, revokedAt: null, type: { not: 'CONSULTANT' }, role: { permissions: { has: 'payments.record' } } },
        select: { personId: true },
        take: 10,
      }),
      prisma.company.findUnique({ where: { id: vendorCompanyId }, select: { name: true } }),
    ])
    void notifyBulk(desk.map((d) => ({
      personId: d.personId,
      companyId,
      type: 'INVOICE' as const,
      title: `An invoice receipt from ${vendor?.name ?? 'a supplier'} does not match`,
      body: failedSoft.map((c) => c.reason).join(' ') || 'A check failed.',
      entityId: bill.id,
      data: { vendorBillId: bill.id, href: '/dashboard/ap' },
    })))
  }

  // The "vendor bill to raise" cycle on the buy contract is done.
  //
  // When the bill falls due is not scheduled here and never was ours to
  // schedule: it is `VendorBill.dueAt`, beside `receivedAt` and
  // `paidAt`, and the AP desk reads it off the bill. See lib/cycle-kinds.
  //
  // Once per period: a receipt typed in again after a mis-keyed one was
  // cancelled finds that date already closed by the first, and closing
  // again would close the next period's date instead.
  if (buyContractId && coversTo) {
    const closedBefore = await prisma.vendorBill.count({
      where: { buyContractId, companyId, status: 'CANCELLED', periodEnd: coversTo, id: { not: bill.id } },
    })
    if (closedBefore === 0) {
      await completeCycle(prisma, { buyContractId, kind: 'VENDOR_BILL_GENERATE', periodEnd: coversTo })
    }
  }

  return NextResponse.json({
    data: {
      bill,
      match: {
        matched: match.matched,
        cleanMatch: match.cleanMatch,
        summary: match.summary,
        checks: match.checks,
        poAfter: match.poAfter,
      },
      note: failedSoft.length > 0
        ? `Recorded as disputed. ${match.summary} It stays out of a payment run until ` +
          `somebody with authority records an exception and says why.`
        : payWhenPaid
        ? 'Recorded with a pay-when-paid clause. That clause is where the wait travels ' +
          'downwards, so it is flagged on the AP screen rather than filed away.'
        : 'Recorded. The three dates are what make the delay on this supplier measurable ' +
          'at all — received, due, and the day money actually left.',
    },
  })
}

/**
 * PATCH /api/ap/bills — record that a bill was paid.
 *
 * `paidAt` is the day money left and it is never inferred from a status.
 * Marking a bill APPROVED is a decision somebody made; it is not a
 * payment, and treating it as one would make every float figure on the
 * chain wrong in the flattering direction.
 */
export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Invoice receipts')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'An invoice receipt is owed by a company' } },
      { status: 403 }
    )
  }

  // Whose bill is being paid, and by whose rule. A seat holds one of the
  // CLIENT's roles, so an office whose own clerks pay suppliers all day
  // may not pay a penny inside somebody else's program unless that
  // client seated it at a desk that pays.
  const { books: reading, error: booksError } = await booksFor(caller, request)
  if (booksError) return booksError

  if (!hasPermission(reading.caller.permissions, 'payments.record')) {
    const seated = reading.seat ? seatMayPay(reading.seat) : null
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            seated && !seated.ok
              ? seated.says
              : askTheDesk({ doing: 'Recording a payment', needs: 'payments.record', kind: caller.company?.kind, companyName: caller.company?.name }),
        },
      },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const id = String(body.id ?? '')
  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Which invoice receipt?', field: 'id' } },
      { status: 422 }
    )
  }

  const bill = await prisma.vendorBill.findUnique({ where: { id }, select: KEYED_SELECT })
  if (!bill || bill.companyId !== reading.companyId) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such invoice receipt here' } }, { status: 404 })
  }
  const vendorName = bill.vendorCompany.name

  // ── The one gate, run at the moment money leaves ────────────────────
  //
  // Release walk, 2026-10-18: a receipt recorded as disputed was paid by
  // this request, a week received twice under two numbers was paid three
  // times, and a receipt past its order's ceiling was paid — because this
  // door asked only whether the weeks were accepted. Now it asks what the
  // intake, the queue and the payment run ask (lib/money/keyed-receipt):
  // the accepted hours at the agreed rate, inside the order, received
  // once. A week nobody here accepted keeps its own refusal first, in the
  // sentence that names the week.
  const check = bill.status === 'CANCELLED' || bill.status === 'PAID'
    ? null
    : await checkKeyedReceipt(asKeyed(bill), 'pay')
  if (check?.notAccepted) {
    return NextResponse.json(
      { error: { code: 'WEEK_NOT_ACCEPTED', message: check.notAccepted.says } },
      { status: 422 }
    )
  }
  const gate = keyedPayGate(bill, vendorName, check)
  if (!gate.ok) {
    return NextResponse.json(
      { error: { code: gate.code, message: gate.says, checks: check?.match.checks ?? [] } },
      { status: 409 }
    )
  }

  const paidAt = body.paidAt ? new Date(String(body.paidAt)) : new Date()
  if (Number.isNaN(paidAt.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'That paidAt could not be read', field: 'paidAt' } },
      { status: 422 }
    )
  }
  if (paidAt < bill.receivedAt) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'An invoice cannot be paid before it arrived',
          field: 'paidAt',
        },
      },
      { status: 422 }
    )
  }

  const paidValue = body.amount != null ? Number(body.amount) : null
  const addCents =
    paidValue == null
      ? bill.totalCents - bill.paidCents
      : Math.round(paidValue * 10 ** decimalsFor(bill.currency))

  if (!Number.isFinite(addCents) || addCents <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A payment is a positive amount', field: 'amount' } },
      { status: 422 }
    )
  }

  // No overpayment, the same rule as a payment on a platform invoice.
  const owing = bill.totalCents - bill.paidCents
  if (addCents > owing) {
    return NextResponse.json(
      {
        error: {
          code: 'OVERPAYMENT',
          message:
            `${amount(addCents, bill.currency)} is more than the ${amount(owing, bill.currency)} still owed on ` +
            `${vendorName}’s invoice ${bill.number}. Record what was actually paid.`,
          field: 'amount',
        },
      },
      { status: 422 }
    )
  }

  const newPaid = bill.paidCents + addCents
  const settled = newPaid >= bill.totalCents

  // ── Who paid whom ──────────────────────────────────────────────────
  //
  // Written on every payment, as a payment on a platform invoice is: a
  // `Payment` row naming the receipt it pays, who paid, who was paid, how
  // much, when, how and the reference, and who pressed it — beside the
  // receipt's own paid figure, in one transaction, so the two can never
  // disagree. Never unapplied cash on the supplier's books: it names the
  // receipt it settles, and every receivables view leaves such a row out.
  // Under the seat where it was made in one.
  //
  // No cycle is closed here, on purpose: the date this receipt was expected
  // closed when it was recorded, and when it falls due is the receipt's own
  // `dueAt`, never a cycle (lib/cycle-kinds). Closing again would close the
  // next period's date.
  const method = body.method ? String(body.method) : null
  const reference = body.reference ? String(body.reference) : null
  const d = decimalsFor(bill.currency)
  const { updated, payment } = await prisma.$transaction(async (tx) => {
    const updated = await tx.vendorBill.update({
      where: { id },
      data: {
        paidCents: newPaid,
        // Only a bill paid in full carries a paid date. A part payment has
        // not closed the obligation, and dating it as if it had would
        // report the first installment as the day the supplier was paid.
        paidAt: settled ? paidAt : null,
        status: settled ? 'PAID' : 'APPROVED',
      },
      select: { id: true, paidCents: true, totalCents: true, paidAt: true, status: true },
    })
    const payment = await tx.payment.create({
      data: {
        vendorBillId: bill.id,
        payerCompanyId: reading.companyId,
        receivedByCompanyId: bill.vendorCompanyId,
        amount: (addCents / 10 ** d).toFixed(d),
        currency: bill.currency,
        method,
        reference,
        receivedAt: paidAt,
        appliedAt: new Date(),
        appliedById: caller.person.id,
      },
      select: { id: true },
    })
    await tx.automationLog.create({
      data: {
        companyId: reading.companyId,
        action: 'PAYMENT_RECORDED',
        summary:
          `Payment of ${amount(addCents, bill.currency)} recorded on ${vendorName}’s invoice ${bill.number}. ` +
          (settled ? 'Now paid in full.' : `${amount(bill.totalCents - newPaid, bill.currency)} outstanding.`),
        reason:
          moneyTrailFor(reading.seat ?? null, `Payment of ${amount(addCents, bill.currency)} recorded`) ??
          `Recorded by ${caller.person.name} at ${caller.company!.name}, paying`,
        payload: {
          vendorBillId: bill.id,
          paymentId: payment.id,
          number: bill.number,
          paidBy: { companyId: reading.companyId, name: reading.companyName },
          paidTo: { companyId: bill.vendorCompanyId, name: vendorName },
          paidCents: addCents,
          currency: bill.currency,
          method,
          reference,
          paidAt: paidAt.toISOString(),
          settled,
          byPersonId: caller.person.id,
          seatId: reading.seat?.id ?? null,
          officeCompanyId: reading.seat?.officeCompany.id ?? null,
        },
        reversible: false,
      },
    })
    return { updated, payment }
  })

  return NextResponse.json({
    data: {
      bill: updated,
      payment: {
        id: payment.id,
        amountMinor: addCents,
        currency: bill.currency,
        method,
        reference,
        paidAt: paidAt.toISOString(),
        paidBy: reading.companyName,
        paidTo: vendorName,
        recordedBy: caller.person.name,
      },
      readInASeat: reading.seated,
      note: settled
        ? `Paid in full on ${formatDay(paidAt)}. Days to pay for this supplier count to this date.`
        : 'Part paid. No paid date is set — the obligation is still open, and dating it ' +
          'now would report the first installment as the day they were paid.',
    },
  })
}

/**
 * GET /api/ap/bills — the exception queue.
 *
 * ── Why it is computed and not stored ────────────────────────────────
 *
 * The match verdict is not a column. It could be, and it would be wrong
 * within a week: a purchase order gets topped up, a timesheet is
 * accepted late, a rate amendment lands, and a stored verdict from
 * Tuesday is a claim about facts that have since changed. So every open
 * bill is re-matched against what is true now.
 *
 * ── Worst first, and worst is not largest ────────────────────────────
 *
 * A duplicate payment or a bill for hours nobody accepted cannot be
 * waived by anybody at any level, so those sort above everything
 * regardless of size. Sorting a control queue by value puts the £40,000
 * rate query above the £900 duplicate — and the duplicate is the one
 * that is definitely wrong.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Invoice receipts')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'An invoice receipt is owed by a company' } },
      { status: 403 }
    )
  }
  // Whose bills these are: the client's where a program office is
  // sitting at its desk, its own everywhere else. One door,
  // `lib/money/seated-books`, and `payerScope` still answers the
  // unseated case exactly as it did.
  const { books: reading, error: booksError } = await booksFor(caller, request)
  if (booksError) return booksError

  if (!mayOpen(reading.caller.permissions, PAYABLE)) {
    return NextResponse.json(
      reading.seat
        ? { error: { code: 'FORBIDDEN', message: seatedRefusal(reading.seat, 'The exception queue') } }
        : refusal(PAYABLE),
      { status: 403 }
    )
  }

  const companyId = reading.companyId
  noteMoneyRead(reading, 'Invoice receipt exceptions read')
  const now = new Date()

  const bills = await prisma.vendorBill.findMany({
    where: { companyId, status: { notIn: ['CANCELLED', 'PAID'] } },
    select: KEYED_SELECT,
    orderBy: { receivedAt: 'desc' },
    take: 1_000,
  })

  // The same check a payment runs (lib/money/keyed-receipt), so the queue
  // and the pay button cannot disagree about one receipt: the order, the
  // line's own where none was named; the weeks this firm accepted and what
  // they come to; and the same work on an earlier receipt.
  const items = []
  for (const b of bills) {
    const check = await checkKeyedReceipt(asKeyed(b), 'pay')
    items.push({
      id: b.id,
      reference: b.number,
      counterparty: b.vendorCompany.name,
      currency: b.currency,
      amountCents: b.totalCents,
      receivedAt: b.receivedAt,
      result: check.match,
    })
  }

  const queue = exceptionQueue(items, now)

  return NextResponse.json({
    data: {
      asOf: now.toISOString(),
      reading: { company: reading.companyName, inASeat: reading.seated, says: reading.says },
      open: items.length,
      exceptions: queue.map((e) => ({
        id: e.id,
        reference: e.reference,
        counterparty: e.counterparty,
        currency: e.currency,
        amountCents: e.amountCents,
        ageDays: e.ageDays,
        hardFailures: e.hardFailures,
        waivableFailures: e.waivableFailures,
        summary: e.result.summary,
        checks: e.result.checks,
        poAfter: e.result.poAfter,
        says: e.says,
      })),
      note:
        'Every open invoice receipt re-checked against what is true now rather than against a verdict ' +
        'stored on Tuesday. Worst first, and worst is not largest — a duplicate nobody can ' +
        'wave through sorts above a rate query ten times its size.',
    },
  })
}
