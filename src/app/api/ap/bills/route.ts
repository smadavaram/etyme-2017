import { NextRequest, NextResponse } from 'next/server'
import { alreadyOnABill } from '@/lib/money/billed-elsewhere'
import { priceByDay, ratePeriods } from '@/lib/contract-rate'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { notifyBulk } from '@/lib/notify'
import { completeCycle } from '@/lib/cycle-complete'
import { payersBook } from '@/lib/money/payers-acceptance-read'
import { staffOnly } from '@/lib/seat'
import {
  mayOpen, refusal, mayRecordSupplierInvoice, PAYABLE, NOT_THE_PAYING_DESK,
} from '@/lib/money/desks'
import { decimalsFor } from '@/lib/money'
import { canAttachPoToBuyContract, overBillCheck } from '@/lib/purchase-order'
import {
  matchVendorBill, exceptionQueue, CHECK_PHRASE,
  type AcceptedWork, type PurchaseOrderFacts,
} from '@/lib/three-way-match'
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

  // ── The ceiling, and the hours behind the bill ──────────────────────
  //
  // The duplicate check above catches the commonest AP error and nothing
  // else. A supplier could bill $40,000 against a $25,000 purchase order,
  // or twice what the buy contract can produce in a month, and it went
  // straight in — because the ceiling lived in one table and the bill in
  // another and nothing compared them. A ceiling nobody checks is not a
  // control, it is a number in a database.
  //
  // And `three-way-match.ts` had forty-two tests and was never called
  // from here, so a bill for hours nobody accepted matched nothing at
  // all. Both are wired now, and both REPORT rather than refuse where a
  // person may legitimately proceed: an unwaivable failure is a 422, a
  // waivable one is recorded on the bill as DISPUTED with the reason.

  let poFacts: PurchaseOrderFacts | null = null
  if (workOrderId) {
    const po = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true, number: true, status: true, amount: true, currency: true,
        startDate: true, endDate: true, issuedById: true,
      },
    })
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

    // What other live bills have already drawn down. Cancelled ones have
    // not consumed anything, and counting them would refuse a bill the
    // order has room for.
    const drawn = await prisma.vendorBill.aggregate({
      where: { workOrderId, status: { notIn: ['CANCELLED'] } },
      _sum: { totalCents: true },
    })

    poFacts = {
      id: po.id,
      number: po.number,
      status: po.status,
      amountCents: Math.round(parseFloat(po.amount.toString()) * 10 ** decimalsFor(po.currency)),
      consumedCents: drawn._sum.totalCents ?? 0,
      startDate: po.startDate,
      endDate: po.endDate,
    }

    const ceiling = overBillCheck(
      {
        billCents: totalCents,
        billCurrency: currency,
        periodStart,
        periodEnd,
        po: { ...poFacts, currency: po.currency },
      },
      new Date()
    )

    const hard = ceiling.problems.filter((p) => !p.overridable)
    if (hard.length > 0) {
      return NextResponse.json(
        { error: { code: hard[0].code, message: hard[0].says, field: 'workOrderId' } },
        { status: 422 }
      )
    }
  }

  // What WE accepted for pay over the billed period — the paying firm's
  // own signature on each week, and nobody else's. Not the client's
  // approval: the client approves forty, we accept thirty-eight, and the
  // margin sits between them. And not the supplier's acceptance either:
  // in a chain the week is filed on the supplier's contract below us,
  // and what the supplier accepted to pay its own person is not what we
  // accepted to pay the supplier (CLAUDE.md, "The signed week travels
  // down the chain": no rung pays on a week it has not accepted).
  // `lib/money/payers-acceptance` decides which signature is ours; the
  // week spanning two buy contracts is divided, never counted twice.
  let accepted: AcceptedWork | null = null
  let expectedCents: number | null = null

  if (buyContractId && periodStart && periodEnd) {
    const book = await payersBook({ buyContractId, periodStart, periodEnd, then: 'record' })

    // ── A week we have not accepted blocks the invoice ─────────────────
    //
    // The founder, 2026-09-28 (CLAUDE.md, "What each rung may bill, and
    // when", rule 3). Refused here, before anything is written, and not
    // recorded as disputed: a disputed invoice is one somebody may still
    // wave through with a reason, and this one nobody may. Accept the
    // week, then record the invoice. The sentence names the week and the
    // firm that must accept it.
    if (book && book.waiting.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: 'WEEK_NOT_ACCEPTED',
            message: book.notAccepted,
            weeks: book.waiting.map((w) => ({
              timesheetId: w.id,
              weekOf: w.periodStart.toISOString().slice(0, 10),
              personName: w.personName,
            })),
          },
        },
        { status: 422 }
      )
    }
    const ours = book?.accepted ?? null

    const candidate = await prisma.buyContractCandidate.findFirst({
      where: { buyContractId },
      select: { payRate: true, payCurrency: true },
    })

    if (ours) {
      // Each accepted day at the rate in force that day. The line's own
      // rate is its opening rate and is never overwritten by a change, so
      // reading it alone priced every hour after a rise at the old rate —
      // and an invoice billed correctly at the new one failed the check.
      const periods = ratePeriods(
        await prisma.rateHistory.findMany({
          where: { contractType: 'BUY', contractId: buyContractId },
          select: { id: true, rate: true, fromDate: true, toDate: true, approvalState: true },
        })
      )
      const priced = candidate
        ? ours.weeks.map((w) =>
            priceByDay({
              contractRateCents: candidate.payRate,
              periods,
              days: w.days,
              hours: w.hours,
              periodStart: w.periodStart,
              periodEnd: w.periodEnd,
            })
          )
        : []
      const rates = new Set(priced.flatMap((p) => p.days.map((d) => d.rateCents)))
      const firstRate = priced.find((p) => p.days.length > 0)?.firstRateCents ?? null
      accepted = {
        hours: ours.hours,
        // One rate where the period had one. Where a change fell inside
        // it, no single rate is the contract's, and an invoice at one
        // rate across it is wrong: the rate on the first day stands here
        // and the check says so; the total below is priced by day.
        contractRateCents: (rates.size === 1 ? [...rates][0] : firstRate) ?? candidate?.payRate ?? ours.firstRateCents,
        firstDay: ours.firstDay,
        lastDay: ours.lastDay,
        count: ours.count,
      }
      if (candidate && candidate.payCurrency.toUpperCase() === currency) {
        // Rounded once per rate across the whole period, as it always
        // was once across the whole period.
        const byRate = new Map<number, number>()
        for (const p of priced) for (const d of p.days) byRate.set(d.rateCents, (byRate.get(d.rateCents) ?? 0) + d.hours)
        expectedCents = [...byRate.entries()].reduce((n, [r, h]) => n + Math.round(h * r), 0)
      }
    }
  }

  if (expectedCents != null) {
    const shape = overBillCheck(
      {
        billCents: totalCents,
        billCurrency: currency,
        po: null,
        contractExpectedCents: expectedCents,
        contractCurrency: currency,
      },
      new Date()
    )
    const hard = shape.problems.filter((p) => !p.overridable)
    if (hard.length > 0) {
      return NextResponse.json(
        { error: { code: hard[0].code, message: hard[0].says, field: 'total' } },
        { status: 422 }
      )
    }
  }

  const match = matchVendorBill({
    bill: {
      id: 'pending',
      number,
      totalCents,
      currency,
      periodStart,
      periodEnd,
      hours: body.hours != null ? Number(body.hours) : null,
      rateCents: body.rateCents != null ? Math.round(Number(body.rateCents)) : null,
      duplicateOfBillId: null,
    },
    accepted,
    po: poFacts,
    // The payer's own policy, from the company that raises the PO.
    poRequired: false,
  })

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
  if (periodStart && periodEnd) {
    const people = buyContractId
      ? (await prisma.buyContractCandidate.findMany({ where: { buyContractId }, select: { personId: true } })).map((c) => c.personId)
      : null
    const generated = await prisma.invoice.findMany({
      where: {
        status: { notIn: ['DRAFT', 'CANCELLED', 'VOID'] },
        invoiceLines: {
          some: {
            sellContract: { companyId: vendorCompanyId, clientCompanyId: companyId },
            timesheet: { periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart } },
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
    const twice = alreadyOnABill(
      {
        periodStart: periodStart.toISOString().slice(0, 10),
        periodEnd: periodEnd.toISOString().slice(0, 10),
        personIds: people,
      },
      generated.map((g) => ({
        number: g.number,
        vendorName: vendor.name,
        lines: g.invoiceLines.flatMap((l) =>
          l.personId && l.timesheet
            ? [{ personId: l.personId, personName: l.person?.name ?? 'Somebody', days: (l.timesheet.days as Record<string, number>) ?? {} }]
            : []
        ),
      }))
    )
    if (twice) {
      return NextResponse.json(
        { error: { code: 'ALREADY_BILLED', message: twice.says, bills: twice.bills } },
        { status: 409 }
      )
    }
  }

  // A waivable failure does not refuse the bill; it records it as
  // disputed, which is the state that keeps it out of a payment run until
  // somebody with authority says why it should go in.
  const failedSoft = match.checks.filter((c) => c.outcome === 'FAIL')
  const statusAfterMatch = failedSoft.length > 0 ? 'DISPUTED' : status

  const bill = await prisma.vendorBill.create({
    data: {
      companyId,
      vendorCompanyId,
      number,
      buyContractId,
      workOrderId,
      projectOrderId,
      periodStart,
      periodEnd,
      currency,
      totalCents,
      paidCents: paidAt ? totalCents : Math.round(Number(body.paid ?? 0) * 10 ** decimalsFor(currency)),
      receivedAt,
      dueAt,
      paidAt,
      status: statusAfterMatch,
      payWhenPaid,
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
  if (buyContractId && periodEnd) {
    await completeCycle(prisma, { buyContractId, kind: 'VENDOR_BILL_GENERATE', periodEnd })
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

  const bill = await prisma.vendorBill.findUnique({
    where: { id },
    select: {
      id: true, companyId: true, currency: true, totalCents: true, paidCents: true, receivedAt: true,
      buyContractId: true, periodStart: true, periodEnd: true,
    },
  })
  if (!bill || bill.companyId !== reading.companyId) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such invoice receipt here' } }, { status: 404 })
  }

  // Paying is the last way round the rule, and the one that cannot be
  // undone. An invoice recorded before 2026-09-28, or one whose week was
  // withdrawn after it was recorded, covers hours nobody here accepted;
  // it is not paid until they are.
  if (bill.buyContractId && bill.periodStart && bill.periodEnd) {
    const book = await payersBook({
      buyContractId: bill.buyContractId, periodStart: bill.periodStart, periodEnd: bill.periodEnd, then: 'pay',
    })
    if (book && book.waiting.length > 0) {
      return NextResponse.json(
        { error: { code: 'WEEK_NOT_ACCEPTED', message: book.notAccepted } },
        { status: 422 }
      )
    }
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

  const newPaid = bill.paidCents + addCents
  const settled = newPaid >= bill.totalCents

  const updated = await prisma.vendorBill.update({
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

  // A payment made in a seat is on the record under the seat.
  //
  // Only in a seat: a firm paying its own bill from its own desk writes
  // what it always wrote, because a log line that appeared on every
  // payment the day this shipped would be a change to everybody's books
  // to fix one party's gap. What a client needs afterwards is the
  // answer to "who moved our money, and on whose authority", and that
  // is exactly the case this branch covers.
  if (reading.seat) {
    await prisma.automationLog.create({
      data: {
        companyId: reading.companyId,
        // `PAYMENT_RECORDED` rather than a name of its own: the act is
        // exactly what the invoice route logs under it — a person
        // recorded that money moved — and a new action name needs a rung
        // in `src/lib/autonomy.ts`, which is the architect's file and
        // cannot land in this commit.
        action: 'PAYMENT_RECORDED',
        summary:
          `${settled ? 'Paid in full' : 'Part paid'}: invoice receipt ${bill.id} on ` +
          `${reading.companyName}'s books.`,
        reason: moneyTrailFor(reading.seat, 'Invoice receipt paid') ?? '',
        payload: {
          vendorBillId: bill.id,
          paidCents: addCents,
          settled,
          seatId: reading.seat.id,
          officeCompanyId: reading.seat.officeCompany.id,
          byPersonId: caller.person.id,
        },
        reversible: false,
      },
    })
  }

  return NextResponse.json({
    data: {
      bill: updated,
      readInASeat: reading.seated,
      note: settled
        ? 'Paid in full. This is the date every float figure on this supplier counts to.'
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
    select: {
      id: true, number: true, currency: true, totalCents: true, paidCents: true,
      receivedAt: true, dueAt: true, status: true, periodStart: true, periodEnd: true,
      buyContractId: true,
      vendorCompany: { select: { id: true, name: true } },
      workOrder: {
        select: {
          id: true, number: true, status: true, amount: true, currency: true,
          startDate: true, endDate: true,
        },
      },
    },
    orderBy: { receivedAt: 'desc' },
    take: 1_000,
  })

  // What each purchase order has already had drawn against it, counted
  // once rather than per bill.
  const poIds = [...new Set(bills.map((b) => b.workOrder?.id).filter(Boolean))] as string[]
  const drawn = poIds.length
    ? await prisma.vendorBill.groupBy({
        by: ['workOrderId'],
        where: { workOrderId: { in: poIds }, status: { notIn: ['CANCELLED'] } },
        _sum: { totalCents: true },
      })
    : []
  const drawnBy = new Map(drawn.map((d) => [d.workOrderId, d._sum.totalCents ?? 0]))

  const items = []
  for (const b of bills) {
    let accepted: AcceptedWork | null = null
    let notAccepted: string | null = null
    if (b.buyContractId && b.periodStart && b.periodEnd) {
      // The same question intake asked: what this firm itself accepted,
      // and which weeks it has not. An invoice recorded before the rule,
      // or before a week was withdrawn, is refused here in the same
      // sentence intake would give — as a failure nobody can waive.
      const book = await payersBook({
        buyContractId: b.buyContractId, periodStart: b.periodStart, periodEnd: b.periodEnd, then: 'pay',
      })
      notAccepted = book?.notAccepted || null
      const ours = book?.accepted ?? null
      if (ours) {
        const candidate = await prisma.buyContractCandidate.findFirst({
          where: { buyContractId: b.buyContractId },
          select: { payRate: true },
        })
        accepted = {
          hours: ours.hours,
          contractRateCents: candidate?.payRate ?? ours.firstRateCents,
          firstDay: ours.firstDay,
          lastDay: ours.lastDay,
          count: ours.count,
        }
      }
    }

    const po: PurchaseOrderFacts | null = b.workOrder
      ? {
          id: b.workOrder.id,
          number: b.workOrder.number,
          status: b.workOrder.status,
          amountCents: Math.round(
            parseFloat(b.workOrder.amount.toString()) *
              10 ** decimalsFor(b.workOrder.currency)
          ),
          // Everything drawn INCLUDING this bill, less this bill — so the
          // match asks the same question it asked at intake.
          consumedCents: (drawnBy.get(b.workOrder.id) ?? 0) - b.totalCents,
          startDate: b.workOrder.startDate,
          endDate: b.workOrder.endDate,
        }
      : null

    const result = matchVendorBill({
      bill: {
        id: b.id,
        number: b.number,
        totalCents: b.totalCents,
        currency: b.currency,
        periodStart: b.periodStart,
        periodEnd: b.periodEnd,
        hours: null,
        rateCents: null,
        duplicateOfBillId: null,
      },
      accepted,
      po,
      poRequired: false,
      notAccepted,
    })

    items.push({
      id: b.id,
      reference: b.number,
      counterparty: b.vendorCompany.name,
      currency: b.currency,
      amountCents: b.totalCents,
      receivedAt: b.receivedAt,
      result,
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
