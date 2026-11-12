import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  cashFlow, windowFor, slotsFor, ageOpen, varies, emptyBands,
  type CashInputs, type Flow,
} from '@/lib/money/cash-flow'
import { ageBook, type ArInvoice } from '@/lib/ar-ageing'
import { owedOn } from '@/lib/money/supplier-invoices'

/**
 * Reports is cash flow and profitability, nothing else (the founder,
 * 2026-11-08). These are the sentences for the Cash flow tab and for the
 * page that holds both tabs.
 */

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const NOW = new Date('2026-11-18T12:00:00Z') // a Wednesday
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const usd = (at: string, minor: number | null): Flow => ({ currency: 'USD', at: d(at), minor })
const inr = (at: string, minor: number | null): Flow => ({ currency: 'INR', at: d(at), minor })

function seller(over: Partial<CashInputs> = {}): CashInputs {
  return {
    side: 'SELLER',
    billed: [], received: [], receiptsDue: [], receiptsPaid: [],
    payrollDue: [], payrollPaid: [],
    owedToUs: [], weOwe: [],
    ...over,
  }
}

describe('the period and its rows', () => {
  it('this month runs from the 1st to its last day, so a bill due later this month is on the screen', () => {
    const w = windowFor('month', NOW)
    expect(w.start.toISOString().slice(0, 10)).toBe('2026-11-01')
    expect(w.end.toISOString().slice(0, 10)).toBe('2026-11-30')
  })

  it('this quarter runs from its first month’s 1st to its last month’s last day', () => {
    const w = windowFor('quarter', NOW)
    expect(w.start.toISOString().slice(0, 10)).toBe('2026-10-01')
    expect(w.end.toISOString().slice(0, 10)).toBe('2026-12-31')
  })

  it('the last 90 days are ninety days ending today', () => {
    const w = windowFor('90d', NOW)
    expect(w.end.toISOString().slice(0, 10)).toBe('2026-11-18')
    expect((w.end.getTime() - w.start.getTime()) / 86_400_000 + 1).toBe(90)
  })

  it('a week on cash flow runs Sunday to Saturday, clipped to the period at both ends', () => {
    const slots = slotsFor(windowFor('month', NOW), 'week')
    expect(slots[0].key).toBe('2026-11-01') // Nov 1, 2026 is a Sunday
    expect(slots[0].end.toISOString().slice(0, 10)).toBe('2026-11-07') // Saturday
    const last = slots[slots.length - 1]
    expect(last.key).toBe('2026-11-29')
    expect(last.end.toISOString().slice(0, 10)).toBe('2026-11-30') // clipped, never December
  })

  it('by month, the quarter is three rows', () => {
    expect(slotsFor(windowFor('quarter', NOW), 'month').map((s) => s.key)).toEqual(['2026-10', '2026-11', '2026-12'])
  })
})

describe('cash flow’s figures', () => {
  it('cash flow’s billed figure is the Bills page’s own total for the period: every bill sent in it, by the day it was sent', () => {
    // Three bills the receivable book holds; two sent in November.
    const bills = [usd('2026-11-03', 520_000), usd('2026-11-17', 448_000), usd('2026-10-28', 100_000)]
    const cf = cashFlow(seller({ billed: bills }), 'month', 'week', NOW)
    const sentInPeriod = bills.filter((b) => b.at!.getUTCMonth() === 10).reduce((n, b) => n + b.minor!, 0)
    expect(cf.currencies[0].totals.figures.billed).toBe(sentInPeriod)
    expect(cf.currencies[0].rows.find((r) => r.key === '2026-11-01')!.figures.billed).toBe(520_000)
    expect(cf.currencies[0].rows.find((r) => r.key === '2026-11-15')!.figures.billed).toBe(448_000)
  })

  it('a bill sent outside the chosen period is not counted in it', () => {
    const cf = cashFlow(seller({ billed: [usd('2026-10-31', 100_000)] }), 'month', 'week', NOW)
    expect(cf.currencies).toEqual([])
  })

  it('rupees and dollars are never added on cash flow: each currency is its own table with its own totals', () => {
    const cf = cashFlow(seller({ received: [usd('2026-11-04', 400_000), inr('2026-11-04', 3_000_000)] }), 'month', 'week', NOW)
    expect(cf.currencies.map((c) => c.currency)).toEqual(['INR', 'USD'])
    expect(cf.currencies.find((c) => c.currency === 'USD')!.totals.figures.received).toBe(400_000)
    expect(cf.currencies.find((c) => c.currency === 'INR')!.totals.figures.received).toBe(3_000_000)
  })

  it('net is payments in less payments out and payroll paid, per period and per currency', () => {
    const cf = cashFlow(seller({
      received: [usd('2026-11-04', 500_000)],
      receiptsPaid: [usd('2026-11-05', 300_000)],
      payrollPaid: [usd('2026-11-06', 120_000)],
      billed: [usd('2026-11-02', 900_000)],
    }), 'month', 'week', NOW)
    const week = cf.currencies[0].rows[0]
    expect(week.net).toBe(500_000 - 300_000 - 120_000)
    // Billed is not cash: it is on the row and never in the net.
    expect(week.figures.billed).toBe(900_000)
  })

  it('one payroll payment with no recorded amount blanks payroll paid and the net for its period, never read as nought', () => {
    const cf = cashFlow(seller({
      received: [usd('2026-11-04', 500_000)],
      payrollPaid: [usd('2026-11-06', 120_000), usd('2026-11-06', null)],
    }), 'month', 'week', NOW)
    const usdFlow = cf.currencies[0]
    expect(usdFlow.rows[0].figures.payrollPaid).toBeNull()
    expect(usdFlow.rows[0].net).toBeNull()
    expect(usdFlow.totals.figures.payrollPaid).toBeNull()
    expect(usdFlow.totals.net).toBeNull()
    // The weeks it does not touch still read.
    expect(usdFlow.rows[1].net).toBe(0)
    expect(cf.says.join(' ')).toContain('blank')
  })

  it('a payment whose currency is not known blanks its column in every currency for that period', () => {
    const cf = cashFlow(seller({
      received: [usd('2026-11-04', 1), inr('2026-11-04', 1)],
      payrollPaid: [{ currency: null, at: d('2026-11-05'), minor: null }],
    }), 'month', 'week', NOW)
    for (const c of cf.currencies) expect(c.rows[0].figures.payrollPaid).toBeNull()
  })

  it('a movement with no date is in no period, and the screen says how many', () => {
    const cf = cashFlow(seller({ received: [{ currency: 'USD', at: null, minor: 100 }, usd('2026-11-04', 200)] }), 'month', 'week', NOW)
    expect(cf.currencies[0].totals.figures.received).toBe(200)
    expect(cf.says.some((s) => s.startsWith('1 movement has no date'))).toBe(true)
  })

  it('a seat that does not read payroll is shown no payroll figure and no net, with the reason', () => {
    const cf = cashFlow(seller({ payrollDue: null, payrollPaid: null, received: [usd('2026-11-04', 500_000)] }), 'month', 'week', NOW)
    expect(cf.figures).not.toContain('payrollPaid')
    expect(cf.figures).not.toContain('payrollDue')
    expect(cf.currencies[0].totals.net).toBeNull()
    expect(cf.says[0]).toContain('does not read payroll')
  })

  it('invoice receipts due are what Accounts payable says is still owed on each, at its due date', () => {
    const row = { id: 'r', number: 'R-1', supplierName: 'Techpeple', currency: 'USD', totalMinor: 400_000, paidMinor: 100_000, dueAt: d('2026-11-20'), status: 'SUBMITTED' }
    const paidOff = { ...row, id: 'p', paidMinor: 400_000 }
    const due = [row, paidOff].map((r) => ({ currency: r.currency, at: r.dueAt, minor: owedOn(r) })).filter((f) => f.minor > 0)
    const cf = cashFlow(seller({ receiptsDue: due }), 'month', 'week', NOW)
    expect(cf.currencies[0].totals.figures.receiptsDue).toBe(300_000)
  })
})

describe('what is owed both ways, by how late', () => {
  it('what is owed to the firm is read in the receivable book’s own five age bands', () => {
    const inv: ArInvoice = {
      id: 'i', number: 'IN-1', customerId: 'c', customerName: 'Northbend Athletic', currency: 'USD',
      totalMinor: 500_000, paidMinor: 0, dueAt: d('2026-10-01'), status: 'SUBMITTED',
    }
    const book = ageBook([inv], NOW)
    const cf = cashFlow(seller({ owedToUs: book.byCurrency.map((b) => ({ currency: b.currency, buckets: b.buckets })) }), 'month', 'week', NOW)
    expect(cf.currencies[0].owedToUs).toEqual(book.byCurrency[0].buckets)
  })

  it('what the firm owes is aged with the same five bands, one book per currency', () => {
    const bands = ageOpen([
      { currency: 'USD', dueAt: d('2026-11-30'), outstandingMinor: 100 },
      { currency: 'USD', dueAt: d('2026-10-01'), outstandingMinor: 200 },
      { currency: 'INR', dueAt: d('2026-08-01'), outstandingMinor: 300 },
    ], NOW)
    expect(bands.get('USD')!.CURRENT.minor).toBe(100)
    expect(bands.get('USD')!.D31_60.minor).toBe(200)
    expect(bands.get('INR')!.D90_PLUS.minor).toBe(300)
  })

  it('a chart is drawn only where the values differ; where they do not, the list is the honest form', () => {
    expect(varies([100, 100, 0, 0, 0])).toBe(false)
    expect(varies([100, 0, 0, 0, 0])).toBe(false)
    expect(varies([100, 250, 0, 0, 0])).toBe(true)
  })
})

describe('a client’s cash flow', () => {
  const clientIn: CashInputs = {
    side: 'CLIENT',
    // A client's reader is never handed these, and if it were they are dropped.
    billed: [usd('2026-11-03', 999_999)], received: [usd('2026-11-03', 999_999)],
    receiptsDue: [usd('2026-11-20', 400_000)],
    receiptsPaid: [usd('2026-11-05', 520_000)],
    payrollDue: [usd('2026-11-06', 1)], payrollPaid: [usd('2026-11-06', 1)],
    owedToUs: [{ currency: 'USD', buckets: emptyBands() }],
    weOwe: [{ currency: 'USD', dueAt: d('2026-11-20'), outstandingMinor: 400_000 }],
  }

  it('a client’s cash flow shows what it owes and never a margin', () => {
    const cf = cashFlow(clientIn, 'month', 'week', NOW)
    expect(cf.figures).toEqual(['receiptsDue', 'receiptsPaid'])
    const c = cf.currencies[0]
    expect(c.totals.figures).toEqual({ receiptsDue: 400_000, receiptsPaid: 520_000 })
    expect(c.owedToUs).toBeNull()
    expect(c.weOwe.CURRENT.minor).toBe(400_000)
    expect(JSON.stringify({ figures: cf.figures, currencies: cf.currencies })).not.toMatch(/margin|billed|payroll|received/i)
  })

  it('a client’s net is what it paid out, since it bills nobody', () => {
    expect(cashFlow(clientIn, 'month', 'week', NOW).currencies[0].totals.net).toBe(-520_000)
  })
})

describe('the Reports page', () => {
  const page = read('src/app/dashboard/reports/page.tsx')

  it('has two tabs, Cash flow and Profitability, each at its own address', () => {
    expect(page).toContain("'cash-flow': 'Cash flow', profitability: 'Profitability'")
    expect(page).toContain('href={`/dashboard/reports?tab=${t}` as Route}')
  })

  it('the Profitability tab is the Profitability page’s own cut table, so the two addresses cannot say two margins', () => {
    expect(page).toContain("import { CutTable } from '../profitability/cut-table'")
    expect(page).toContain('<CutTable />')
  })

  it('cash flow is read from the money route and computed nowhere on the screen', () => {
    expect(page).toContain('/api/ap?view=cash-flow&period=${period}&grain=${grain}')
    expect(page).not.toMatch(/\.reduce\(\(sum/)
  })

  it('Reports no longer shows the pipeline, the bench, revenue by client or the contract lists', () => {
    for (const gone of ['/api/bench', '/api/contracts', '/api/invoices', 'Contract Pipeline', 'Bench Skills', 'Revenue by Client']) {
      expect(page).not.toContain(gone)
    }
  })

  it('a tab is offered only where the seat’s menu opens what it reads, and a seat that opens neither reads one sentence', () => {
    expect(page).toContain("mayOpen('/dashboard/ap', permissions) || mayOpen('/dashboard/ar', permissions)")
    expect(page).toContain("mayOpen('/dashboard/profitability', permissions)")
    expect(page).toContain('Your role reads neither.')
  })

  it('every cash flow table offers both the table and the feed', () => {
    expect(page).toContain('<ListSurface<CashRow>')
  })

  it('a client reads Reports as Cash flow only, and is never offered Profitability whatever its roles hold', () => {
    expect(page).not.toContain('Reports is not open for a client yet.')
    expect(page).toContain("const isClient = company?.kind === 'CLIENT'")
    expect(page).toContain("const readsMargin = !isClient && permissions != null && mayOpen('/dashboard/profitability', permissions)")
    expect(page).toContain('What you owe your suppliers, paid and due, and what you will owe them over the next 90 days.')
  })

  it('a client’s cash flow is read as a client wherever the page is opened, and its forecast draws no money in', () => {
    expect(page).toContain("<CashFlowTab kind={company.kind} name={company.name} />")
    expect(page).toContain("client={kind === 'CLIENT'}")
    const answer = read('src/app/api/ap/cash-flow.ts')
    expect(answer).toContain("const client = reading.seated || company?.kind === 'CLIENT'")
    // A client is never handed a bill, a payment in or payroll: the seller's
    // readers sit behind the one test.
    expect(answer.indexOf('if (!client) {')).toBeLessThan(answer.indexOf('loadBook(companyId, now)'))
    expect(answer.indexOf('if (!client) {')).toBeLessThan(answer.indexOf('payrollRoute('))
  })

  it('the cash flow answer sits behind the Accounts payable door and reads each page’s own reader', () => {
    const route = read('src/app/api/ap/route.ts')
    const answer = read('src/app/api/ap/cash-flow.ts')
    expect(route.indexOf("view') === 'cash-flow'")).toBeGreaterThan(route.indexOf('mayOpen(reading.caller.permissions, PAYABLE)'))
    for (const reader of ['loadBook(companyId, now)', 'loadUnplacedPayments(companyId)', 'payablesOf(companyId)', 'paidRunHours(companyId)', 'payrollRoute(']) {
      expect(answer).toContain(reader)
    }
    expect(read('src/app/api/ar/route.ts')).toContain('await loadUnplacedPayments(companyId)')
    expect(read('src/lib/money/what-we-owe.ts')).toContain('await payablesOf(companyId)')
  })
})
