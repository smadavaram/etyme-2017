import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { fromPrismaDecimal } from '@/lib/money'
import { amount } from '@/lib/money-display'
import { permissionScope } from '@/lib/permission-grants'
import { paidRunHours } from '@/lib/payroll-paid'
import { payablesOf } from '@/lib/money/what-we-owe'
import { owedOn } from '@/lib/money/supplier-invoices'
import { noteMoneyRead, type Books } from '@/lib/money/seated-books'
import {
  cashFlow, isCashPeriod, isGrain, windowFor,
  type CashInputs, type CashPeriod, type Flow, type OpenDoc,
} from '@/lib/money/cash-flow'
import { companyPayPeriods } from '@/lib/money/company-pay-periods'
import { periodsPayingBetween } from '@/lib/money/pay-periods'
import { cashForecast } from '@/lib/money/cash-forecast'
import { loadBook, loadUnplacedPayments } from '../ar/book'
import { GET as payrollRoute } from '../payroll/route'
import { forecastInputs } from './cash-forecast'

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
 *     this seat, each row not yet processed at its next pay date. For a
 *     company that pays by its own weekly or two-week periods, the page
 *     is asked for each period whose pay day falls in the window, and
 *     accepted pay nobody has paid is due on that period's pay day
 *     (`payrollDueByPeriod`);
 *   · payroll paid — `paidRunHours` in lib/payroll-paid, what processed
 *     runs paid, which is what the payroll export and the W-2 read.
 *
 * Beside it, `forecast`: the next 90 days, expected in and out, by the
 * same week or month (lib/money/cash-forecast, read by ./cash-forecast).
 * It is its own answer and never added into the actuals: the actuals'
 * totals are computed before it and from inputs it does not touch.
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

  let sentBills: Awaited<ReturnType<typeof loadBook>>['invoices'] = []
  let payrollRows: any[] | null = null

  if (!client) {
    // ── What the firm billed and what came in ─────────────────────────
    const { raw, book, invoices } = await loadBook(companyId, now)
    sentBills = invoices
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
    //
    // Over the whole firm only (2026-11-08, the Owner's grants): cash flow
    // is the firm's book, and payroll paid by one team is not the firm's
    // payroll. A reach narrower than the firm is read as no payroll, which
    // blanks the column and the net with the reason, never a part shown as
    // the whole.
    if ((await permissionScope(reading.caller, 'payroll.read')).scope === 'COMPANY') {
      payrollRows = await payrollPage(request)
      if (payrollRows) {
        const own = await companyPayPeriods(companyId)
        input.payrollDue = own.byPeriod
          ? await payrollDueByPeriod(request, own, period, now)
          : payrollDue(payrollRows)
        const runs = await paidRunHours(companyId)
        input.payrollPaid = runs.runs.map((r) => ({ currency: r.currency, at: r.paidAt, minor: r.paidCents }))
      }
    }
  }

  const actuals = cashFlow(input, period, grain, now)
  // Accepted pay with no pay date is still owed: named, never left out in silence.
  const undatedPay = payrollRows ? payrollUndatedSays(payrollRows) : null
  if (undatedPay) actuals.says.push(undatedPay)
  const forecast = cashForecast(
    await forecastInputs({
      companyId, companyName: reading.companyName, client, sentBills,
      receiptsDue, payrollRows, today: now,
    }),
    grain,
    now,
  )
  return NextResponse.json({ data: { asOf: now.toISOString(), reading: { company: reading.companyName, inASeat: reading.seated, says: reading.says }, ...actuals, forecast } })
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
async function payrollPage(request: NextRequest, periodStart?: string): Promise<any[] | null> {
  const url = new URL(request.url)
  url.pathname = '/api/payroll'
  url.search = periodStart ? `?period=${periodStart}` : ''
  const res = await payrollRoute(new NextRequest(url, { headers: request.headers }))
  if (!res.ok) return null
  const body = await res.json().catch(() => null)
  return body?.data?.payItems ?? []
}

/**
 * Payroll due for a company that pays by its own periods: each period
 * whose pay day falls in the window, read from the Payroll page for that
 * period, each row not yet paid due on the period's own pay day. One
 * figure, worked out once, by the page the payroll person runs it from.
 * Null where any period could not be read: blank, never a part.
 */
async function payrollDueByPeriod(
  request: NextRequest,
  own: Awaited<ReturnType<typeof companyPayPeriods>>,
  period: CashPeriod,
  now: Date,
): Promise<Flow[] | null> {
  const w = windowFor(period, now)
  const key = (d: Date) => d.toISOString().slice(0, 10)
  const out: Flow[] = []
  for (const p of periodsPayingBetween(key(w.start), key(w.end), own.rhythm, own.rule)) {
    const rows = await payrollPage(request, p.start)
    if (!rows) return null
    for (const r of rows) {
      if (!owedPay(r)) continue
      out.push({
        currency: typeof r.payCurrency === 'string' ? r.payCurrency : null,
        at: new Date(`${p.payOn}T00:00:00.000Z`),
        minor: r.grossPay,
      })
    }
  }
  return out
}

const owedPay = (p: any) =>
  (p.payStatus === 'PENDING' || p.payStatus === 'CALCULATED') && typeof p.grossPay === 'number' && p.grossPay > 0

function payrollDue(items: any[]): Flow[] {
  return items
    .filter((p) => owedPay(p) && p.nextPayDate)
    .map((p) => ({
      currency: typeof p.payCurrency === 'string' ? p.payCurrency : null,
      at: p.nextPayDate ? new Date(p.nextPayDate) : null,
      minor: p.grossPay,
    }))
}

/**
 * Payroll owed with no pay date, said by name. An open-ended placement has
 * no pay dates, so her accepted wages fell into no period and the column
 * read $0.00 while she was owed (walk, 2026-11-14). Each is the period the
 * Payroll page shows for her, never a total of periods it does not show.
 */
export function payrollUndatedSays(items: any[]): string | null {
  const undated = items.filter((p) => owedPay(p) && !p.nextPayDate)
  if (undated.length === 0) return null
  const each = undated.map((p) =>
    `${p.person?.name ?? 'A worker'}, ${amount(p.grossPay, typeof p.payCurrency === 'string' ? p.payCurrency : undefined)}` +
    (p.payPeriod?.label ? ` for ${p.payPeriod.label}` : ''))
  return `Payroll due leaves out accepted pay that has no pay date set: ${each.join('; ')}.`
}
