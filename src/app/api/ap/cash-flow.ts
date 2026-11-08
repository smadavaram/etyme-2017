import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { fromPrismaDecimal } from '@/lib/money'
import { hasPermission } from '@/lib/permissions'
import { paidRunHours } from '@/lib/payroll-paid'
import { payablesOf } from '@/lib/money/what-we-owe'
import { owedOn } from '@/lib/money/supplier-invoices'
import { noteMoneyRead, type Books } from '@/lib/money/seated-books'
import {
  cashFlow, isCashPeriod, isGrain,
  type CashInputs, type Flow, type OpenDoc,
} from '@/lib/money/cash-flow'
import { loadBook, loadUnplacedPayments } from '../ar/book'
import { GET as payrollRoute } from '../payroll/route'

/**
 * GET /api/ap?view=cash-flow&period=month|quarter|90d&grain=week|month
 *
 * The Reports page's Cash flow tab. Not a route file — Next only routes
 * `route.ts` — so this is the answer the AP route returns behind the
 * same door: `booksFor`, then `invoices.read`, which is the permission
 * Accounts receivable and Accounts payable both open on. An address is
 * not a word anybody reads; the page says Cash flow.
 *
 * Every figure is read through a reader a money page already uses, and
 * nothing here adds money up (lib/money/cash-flow does, one currency at a
 * time):
 *
 *   · billed, received — `loadBook` and `loadUnplacedPayments` in
 *     app/api/ar/book, the rows Accounts receivable ages and the cash it
 *     shows as waiting to be placed;
 *   · invoice receipts due and paid — `payablesOf` in lib/money/what-we-owe,
 *     the two halves Accounts payable and the invoice list read, owed by
 *     `owedOn`, the same open test;
 *   · payroll due — the Payroll page's own answer, asked in-process under
 *     this seat, each row not yet processed at its next pay date;
 *   · payroll paid — `paidRunHours` in lib/payroll-paid, what processed
 *     runs paid, which is what the payroll export and the W-2 read.
 *
 * A client's book (a client, or a program office seated at one) reads
 * what it owes its suppliers and nothing else: no bill, no payroll and no
 * margin, because a client bills nobody and a cash flow is not a margin.
 */
export async function cashFlowAnswer(request: NextRequest, reading: Books): Promise<NextResponse> {
  const url = request.nextUrl
  const period = isCashPeriod(url.searchParams.get('period')) ? url.searchParams.get('period') as any : 'month'
  const grain = isGrain(url.searchParams.get('grain')) ? url.searchParams.get('grain') as any : 'week'
  const now = new Date()
  const companyId = reading.companyId
  noteMoneyRead(reading, 'Cash flow read')

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { kind: true } })
  const client = reading.seated || company?.kind === 'CLIENT'

  // ── What the firm owes its suppliers, and what it paid them ─────────
  const payables = await payablesOf(companyId)
  const open = [...payables.generated, ...payables.keyed]
  const receiptsDue: Flow[] = []
  const weOwe: OpenDoc[] = []
  for (const r of open) {
    const owed = owedOn(r)
    if (owed <= 0) continue
    receiptsDue.push({ currency: r.currency, at: r.dueAt, minor: owed })
    weOwe.push({ currency: r.currency, dueAt: r.dueAt, outstandingMinor: owed })
  }
  const receiptsPaid: Flow[] = payables.paymentsOut.map((p) => ({ currency: p.currency, at: p.at, minor: p.minor }))

  const input: CashInputs = {
    side: client ? 'CLIENT' : 'SELLER',
    billed: [], received: [], receiptsDue, receiptsPaid,
    payrollDue: null, payrollPaid: null,
    owedToUs: [], weOwe,
  }

  if (!client) {
    // ── What the firm billed and what came in ─────────────────────────
    const { raw, book } = await loadBook(companyId, now)
    for (const i of raw) {
      input.billed.push({
        currency: i.currency,
        at: i.submittedAt ?? i.issuedAt ?? null,
        minor: fromPrismaDecimal(i.total, i.currency).minor,
      })
      for (const p of i.payments) {
        input.received.push({ currency: i.currency, at: p.receivedAt, minor: fromPrismaDecimal(p.amount, i.currency).minor })
      }
    }
    for (const p of await loadUnplacedPayments(companyId)) {
      input.received.push({ currency: p.currency, at: p.receivedAt, minor: fromPrismaDecimal(p.amount, p.currency).minor })
    }
    input.owedToUs = book.byCurrency.map((b) => ({ currency: b.currency, buckets: b.buckets }))

    // ── Payroll, where this seat reads it ─────────────────────────────
    if (hasPermission(reading.caller.permissions, 'payroll.read')) {
      const due = await payrollDue(request)
      if (due) {
        input.payrollDue = due
        const runs = await paidRunHours(companyId)
        input.payrollPaid = runs.runs.map((r) => ({ currency: r.currency, at: r.paidAt, minor: r.paidCents }))
      }
    }
  }

  return NextResponse.json({ data: { asOf: now.toISOString(), reading: { company: reading.companyName, inASeat: reading.seated, says: reading.says }, ...cashFlow(input, period, grain, now) } })
}

/**
 * Payroll not yet paid, from the Payroll page's own answer.
 *
 * Each row the page shows as pending or worked out, with pay on it, at
 * the next pay date the page shows, in the row's pay currency. A row with
 * no pay date is a figure with no day, and cash flow says so rather than
 * placing it. Null where the page could not be read, so payroll is blank
 * rather than nought.
 */
async function payrollDue(request: NextRequest): Promise<Flow[] | null> {
  const url = new URL(request.url)
  url.pathname = '/api/payroll'
  url.search = ''
  const res = await payrollRoute(new NextRequest(url, { headers: request.headers }))
  if (!res.ok) return null
  const body = await res.json().catch(() => null)
  const items: any[] = body?.data?.payItems ?? []
  return items
    .filter((p) => (p.payStatus === 'PENDING' || p.payStatus === 'CALCULATED') && typeof p.grossPay === 'number' && p.grossPay > 0)
    .map((p) => ({
      currency: typeof p.payCurrency === 'string' ? p.payCurrency : null,
      at: p.nextPayDate ? new Date(p.nextPayDate) : null,
      minor: p.grossPay,
    }))
}
