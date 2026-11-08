import { prisma } from '@/lib/db'
import { iso, type Period } from '@/lib/periods'
import { settingsFrom } from '@/lib/days-off'
import { ratePeriods, type RatePeriod } from '@/lib/contract-rate'
import { settlementOf, type ArInvoice } from '@/lib/ar-ageing'
import { whereHoursLive } from '@/lib/work-chain'
import { ladderFor } from '@/lib/work-chain-read'
import { paidByPayroll } from '@/lib/money/paid-through'
import { sendingAnchor } from '@/lib/billing-cascade'
import { ORDER_HEADER_SELECT, SELL_LINE_TERMS_SELECT, moneyTermsFor, periodTermsFor, termsFor } from '@/lib/money/order-terms'
import { billDue, generateBill } from '@/lib/money/bill-generate'
import { dueIfSentOn } from '@/lib/money/bill-send'
import { billingDateOf, periodOfWeek, twinCaller } from '@/lib/money/supplier-bills'
import type { Expected, ForecastInputs, RunningLine } from '@/lib/money/cash-forecast'
import { loadToSend } from '../ar/book'

/**
 * The forecast's facts, each read through a reader a money page already
 * uses. Nothing here prices an hour: a week signed and not billed is priced
 * by the Bills page's generator in a dry run (`generateBill`, the same call
 * the supplier's nightly draft makes), a due date is the agreement's
 * (`billDue` for a bill, `moneyTermsFor` for an invoice receipt), and a
 * running line hands its own rate, rate changes, hours, dates and cycle
 * rows to `carryLine` in lib/money/cash-forecast, which multiplies them.
 *
 * `payrollRows` is the Payroll page's own answer, read once by the cash
 * flow route for both halves; null where this seat does not read payroll.
 */
export interface ForecastReadIn {
  companyId: string
  companyName: string
  client: boolean
  /** The book `loadBook` already read for the actuals. */
  sentBills: ArInvoice[]
  /** Invoice receipts owed, at their due date: the actuals' own list. */
  receiptsDue: Expected[]
  /** The Payroll page's rows, or null. */
  payrollRows: any[] | null
  today: Date
}

const A_DAY = 86_400_000
const dayOf = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
const after = (d: Date) => new Date(dayOf(d).getTime() + A_DAY)
const latest = (ds: (Date | null | undefined)[]): Date | null =>
  ds.reduce<Date | null>((m, d) => (d && (!m || d > m) ? d : m), null)

/** Rates in force by line id, from approved and proposed changes alike; `rateInForce` reads only approved. */
async function ratesFor(side: 'SELL' | 'BUY', ids: string[]): Promise<Map<string, RatePeriod[]>> {
  const out = new Map<string, RatePeriod[]>()
  if (ids.length === 0) return out
  const rows = await prisma.rateHistory.findMany({
    where: { contractType: side, contractId: { in: ids }, approvalState: 'APPROVED' },
    select: { id: true, contractId: true, rate: true, fromDate: true, toDate: true, approvalState: true },
  })
  for (const r of rows) out.set(r.contractId, [...(out.get(r.contractId) ?? []), ...ratePeriods([r])])
  return out
}

export async function forecastInputs(a: ForecastReadIn): Promise<ForecastInputs> {
  const { companyId, today } = a
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, kind: true, daysOff: true },
  })
  const daysOff = settingsFrom(company).daysOff
  const todayDay = dayOf(today)

  const input: ForecastInputs = {
    side: a.client ? 'CLIENT' : 'SELLER',
    billsDue: [], toBill: [], running: [],
    receiptsDue: a.receiptsDue,
    subVendors: [],
    payroll: null,
  }

  // ── Sell lines: billed by this firm, or, for a client, billed to it ───
  const sellLines = await prisma.sellContract.findMany({
    where: {
      ...(a.client ? { clientCompanyId: companyId } : { companyId }),
      state: 'IN_PROGRESS',
      OR: [{ endDate: null }, { endDate: { gte: todayDay } }],
    },
    select: {
      id: true, engagementId: true, billRate: true, billCurrency: true, startDate: true, endDate: true,
      paymentTerms: true, paymentTermsFrom: true,
      billFrequency: true, billAnchor: true, billStraddle: true,
      clientCompanyId: true,
      company: { select: { id: true, name: true, kind: true } },
      clientCompany: { select: { id: true, name: true } },
      person: { select: { name: true } },
      requirement: { select: { hoursPerWeek: true } },
      workOrder: { select: ORDER_HEADER_SELECT },
      ...SELL_LINE_TERMS_SELECT,
      sellCycles: {
        where: { kind: 'INVOICE_GENERATE', completedAt: null, dueOn: { gte: new Date(todayDay.getTime() - 7 * A_DAY) } },
        select: { dueOn: true },
      },
    },
    orderBy: { id: 'asc' },
    take: 2_000,
  })

  const rungs = await ladderFor(sellLines.map((l) => l.id))
  const hoursOn = new Map(sellLines.map((l) => [l.id, whereHoursLive(l.id, rungs)]))
  const signed = sellLines.length === 0 ? [] : await prisma.timesheet.findMany({
    where: {
      sellContractId: { in: [...new Set(hoursOn.values())] },
      assertions: { some: { role: 'CLIENT_APPROVAL', state: 'LIVE' } },
    },
    select: {
      id: true, sellContractId: true, periodStart: true, periodEnd: true, days: true,
      invoiceLines: { where: { sellContractId: { in: sellLines.map((l) => l.id) } }, select: { sellContractId: true } },
    },
    orderBy: { periodStart: 'asc' },
  })
  const sellRates = await ratesFor('SELL', sellLines.map((l) => l.id))

  // The weeks signed and not yet billed, a seller's only: priced by the
  // generator, one dry run per engagement and period.
  const dry = new Map<string, Promise<Awaited<ReturnType<typeof generateBill>>>>()

  for (const l of sellLines) {
    const own = hoursOn.get(l.id)!
    const weeks = signed.filter((w) => w.sellContractId === own)
    const lastSigned = latest(weeks.map((w) => w.periodEnd))

    if (!a.client && l.engagementId) {
      const terms = periodTermsFor('SELL', l)
      const periods = new Map<string, Period>()
      for (const w of weeks.filter((w) => !w.invoiceLines.some((x) => x.sellContractId === l.id))) {
        const p = periodOfWeek(w, terms)
        periods.set(iso(p.start), p)
      }
      for (const p of periods.values()) {
        const key = `${l.engagementId}:${iso(p.start)}`
        if (dry.has(key)) continue
        const ask = generateBill(
          twinCaller(l.company, null),
          { engagementId: l.engagementId, periodStart: iso(p.start), periodEnd: iso(p.end) },
          { dryRun: true },
        )
        dry.set(key, ask)
        const got = await ask
        if (!got.ok || got.planned.timesheetIds.length === 0) continue
        // Sent the day after its period ends, or today where that has gone.
        const billOn = new Date(Math.max(billingDateOf(p).getTime(), todayDay.getTime()))
        const due = billDue({
          line: l, engagementAgreement: null, companyName: l.company.name,
          customerName: l.clientCompany.name, periodEnd: p.end, issuedAt: billOn,
        }).due.dueAt
        input.toBill.push({ currency: got.planned.currency, at: due, minor: got.planned.totalMinor })
      }
    }

    // The line carried forward from the day after its last signed week.
    const said = termsFor('SELL', l).currency
    const lineCurrency = (l.billCurrency || 'USD').toUpperCase()
    const { terms_ } = billDue({
      line: l, engagementAgreement: null, companyName: l.company.name,
      customerName: l.clientCompany.name, periodEnd: todayDay, issuedAt: todayDay,
    })
    const line: RunningLine = {
      name: l.person.name,
      currency: lineCurrency,
      rateMinor: l.billRate,
      rates: sellRates.get(l.id) ?? [],
      hoursPerWeek: l.requirement?.hoursPerWeek ?? null,
      startDate: l.startDate,
      endDate: l.endDate,
      daysOff,
      from: lastSigned ? after(lastSigned) : null,
      cycleDates: l.sellCycles.map((c) => c.dueOn),
      terms: { anchor: terms_.paymentTermsFrom.value, days: terms_.paymentTermsDays.value },
      refused: said && said.toUpperCase() !== lineCurrency
        ? `${l.person.name}’s rate is in ${lineCurrency} and the agreement bills in ${said.toUpperCase()}, so the line is not forecast.`
        : null,
    }
    if (a.client) input.subVendors.push(line)
    else input.running.push(line)
  }

  if (a.client) return input

  // ── Bills sent and still owed, at the due date each carries ─────────
  for (const i of a.sentBills) {
    const owed = settlementOf(i).outstandingMinor
    if (owed > 0) input.billsDue.push({ currency: i.currency, at: i.dueAt, minor: owed })
  }

  // ── Bills drafted or raised and not sent: sent today, due by the agreement ──
  for (const b of await loadToSend(companyId)) {
    const due = await dueIfSentOn(b.id, todayDay)
    input.toBill.push({ currency: b.currency, at: due?.dueAt ?? null, minor: b.totalMinor })
  }

  // ── Buy lines: a sub-vendor's invoice, or payroll ──────────────────
  const buyLines = await prisma.buyContract.findMany({
    where: { companyId, state: 'IN_PROGRESS', OR: [{ endDate: null }, { endDate: { gte: todayDay } }] },
    select: {
      id: true, contractType: true, payModel: true, commissionType: true,
      vendorCompanyId: true, supplierSellContractId: true,
      payCurrency: true, paymentTermsFrom: true, payFrequency: true, payAnchor: true, payStraddle: true,
      termsDifferReason: true, startDate: true, endDate: true,
      workOrder: { select: ORDER_HEADER_SELECT },
      vendorCompany: { select: { name: true } },
      candidates: {
        where: { state: 'ACTIVE' },
        select: { id: true, payRate: true, payCurrency: true, startDate: true, endDate: true, person: { select: { name: true } } },
      },
      sellLinks: { select: { sellContract: { select: { requirement: { select: { hoursPerWeek: true } } } } } },
      buyCycles: {
        where: { kind: { in: ['VENDOR_BILL_GENERATE', 'SALARY_PAY'] }, completedAt: null, dueOn: { gte: new Date(todayDay.getTime() - 7 * A_DAY) } },
        select: { kind: true, dueOn: true },
      },
      vendorBills: { where: { status: { notIn: ['CANCELLED', 'VOID'] } }, select: { periodEnd: true } },
      supplierSellContract: {
        select: {
          invoiceLines: {
            where: { invoice: { status: { notIn: ['DRAFT', 'CANCELLED', 'VOID'] } } },
            select: { timesheet: { select: { periodEnd: true } } },
          },
        },
      },
    },
    orderBy: { id: 'asc' },
    take: 2_000,
  })
  const buyRates = await ratesFor('BUY', buyLines.map((b) => b.id))
  const readsPayroll = a.payrollRows != null
  const pendingRows = (a.payrollRows ?? []).filter((p) =>
    (p.payStatus === 'PENDING' || p.payStatus === 'CALCULATED') && typeof p.grossPay === 'number' && p.grossPay > 0)
  const payrollLines: RunningLine[] = []

  for (const bc of buyLines) {
    const byPayroll = paidByPayroll(bc)
    if (byPayroll && !readsPayroll) continue
    const hoursPerWeek = bc.sellLinks.map((s) => s.sellContract.requirement?.hoursPerWeek).find((h) => h != null) ?? null
    const notHourly = bc.payModel !== 'FIXED_HOURLY' || bc.commissionType != null
    const kind = byPayroll ? 'SALARY_PAY' : 'VENDOR_BILL_GENERATE'
    const dates = bc.buyCycles.filter((c) => c.kind === kind).map((c) => c.dueOn)

    // What the sub-vendor has already invoiced, so its weeks are not expected twice.
    const invoiced = latest([
      ...bc.vendorBills.map((v) => v.periodEnd),
      ...(bc.supplierSellContract?.invoiceLines ?? []).map((x) => x.timesheet?.periodEnd ?? null),
    ])
    const terms = byPayroll ? null : (() => {
      const { billing } = moneyTermsFor('BUY', bc, { name: a.companyName })
      return { anchor: sendingAnchor(billing.paymentTermsFrom).value, days: billing.paymentTermsDays.value }
    })()

    for (const cand of bc.candidates) {
      const row = byPayroll ? (a.payrollRows ?? []).find((p) => p.buyContractCandidateId === cand.id) : null
      const shown = row?.payPeriod?.end && ['PENDING', 'CALCULATED', 'PROCESSED'].includes(row.payStatus)
        ? after(new Date(row.payPeriod.end))
        : row?.payPeriod?.start ? new Date(row.payPeriod.start) : null
      const line: RunningLine = {
        name: cand.person.name,
        currency: cand.payCurrency || bc.payCurrency,
        rateMinor: cand.payRate,
        rates: buyRates.get(bc.id) ?? [],
        hoursPerWeek,
        startDate: cand.startDate,
        endDate: cand.endDate ?? bc.endDate,
        daysOff,
        from: byPayroll ? shown : invoiced ? after(invoiced) : null,
        datesAfter: byPayroll && row?.nextPayDate && pendingRows.includes(row) ? new Date(row.nextPayDate) : null,
        cycleDates: dates,
        terms,
        refused: notHourly
          ? `${cand.person.name} is paid ${bc.commissionType ? 'a commission' : 'a share'}, not an hourly rate, so the line is not forecast.`
          : null,
      }
      if (byPayroll) payrollLines.push(line)
      else input.subVendors.push(line)
    }
  }

  if (readsPayroll) {
    input.payroll = {
      pending: pendingRows.map((p) => ({
        currency: typeof p.payCurrency === 'string' ? p.payCurrency : null,
        at: p.nextPayDate ? new Date(p.nextPayDate) : null,
        minor: p.grossPay,
      })),
      lines: payrollLines,
    }
  }
  return input
}
