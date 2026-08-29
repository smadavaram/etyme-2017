/**
 * What we are owed, and how old it is.
 *
 * Margin is theoretical. Payroll on Friday is not. These tests exist
 * because the three things this report has to get right — part payments,
 * short payments, and cash that arrived and matches nothing — are the
 * three things every AR screen in this industry gets wrong.
 */

import { describe, it, expect } from 'vitest'
import {
  ageInvoice, ageBook, bucketOf, daysOverdue, settlementOf, forCustomer,
  dso, dunningForCustomer, dunningRun, LADDER,
  ROUNDING_TOLERANCE_MINOR, SHORT_PAY_MAX_FRACTION, CHASE_FLOOR_MINOR,
  ESCALATE_AFTER_DAYS,
  type ArInvoice, type DunningStep,
} from '@/lib/ar-ageing'

const NOW = new Date('2026-08-29T00:00:00Z')
const DAY = 86_400_000
const dueIn = (days: number) => new Date(NOW.getTime() + days * DAY)
const dueAgo = (days: number) => new Date(NOW.getTime() - days * DAY)

const invoice = (over: Partial<ArInvoice> = {}): ArInvoice => ({
  id: 'i1',
  number: 'INV-1001',
  currency: 'GBP',
  totalMinor: 960_000, // £9,600
  paidMinor: 0,
  dueAt: dueAgo(10),
  customerId: 'cus-nike',
  customerName: 'Nike',
  ...over,
})

// ── Buckets ──────────────────────────────────────────────────────────

describe('An invoice ages from the day it falls due, never from the day it was raised', () => {

  it('an invoice that is not yet due is current, however large it is', () => {
    const a = ageInvoice(invoice({ totalMinor: 40_000_000, dueAt: dueIn(3) }), NOW)
    expect(a.bucket).toBe('CURRENT')
    expect(a.daysOverdue).toBeLessThanOrEqual(0)
    expect(a.says).toContain('Not due')
  })

  it('buckets run from the due date, so an invoice on sixty-day terms is not late on day forty-five', () => {
    // Raised 45 days ago on NET 60 — so it is due in another 15 days.
    const a = ageInvoice(invoice({ dueAt: dueIn(15) }), NOW)
    expect(a.bucket).toBe('CURRENT')
    expect(a.outstandingMinor).toBe(960_000)
  })

  it('each bucket is one whole payment cycle missed', () => {
    expect(bucketOf(0)).toBe('CURRENT')
    expect(bucketOf(1)).toBe('D1_30')
    expect(bucketOf(30)).toBe('D1_30')
    expect(bucketOf(31)).toBe('D31_60')
    expect(bucketOf(60)).toBe('D31_60')
    expect(bucketOf(61)).toBe('D61_90')
    expect(bucketOf(90)).toBe('D61_90')
    expect(bucketOf(91)).toBe('D90_PLUS')
  })

  it('counts the days past due', () => {
    expect(daysOverdue(dueAgo(47), NOW)).toBe(47)
    expect(daysOverdue(dueIn(5), NOW)).toBe(-5)
  })
})

// ── Part payments, short payments, rounding ──────────────────────────

describe('What arrived is as much a fact as what was asked for', () => {

  it('a client paying £9,400 against £9,600 is a dispute, not an unpaid invoice', () => {
    const a = ageInvoice(invoice({ totalMinor: 960_000, paidMinor: 940_000 }), NOW)
    expect(a.settlement).toBe('SHORT_PAID')
    expect(a.disputed).toBe(true)
    expect(a.outstandingMinor).toBe(20_000) // the £200 in question, not £9,600
    expect(a.says).toContain('query')
  })

  it('a client who has paid half is chased for the half, never for the whole invoice', () => {
    const a = ageInvoice(invoice({ totalMinor: 960_000, paidMinor: 480_000 }), NOW)
    expect(a.settlement).toBe('PART_PAID')
    expect(a.outstandingMinor).toBe(480_000)
    expect(a.disputed).toBe(false)
  })

  it('a two-pence difference is rounding, and nobody writes a letter about rounding', () => {
    const a = ageInvoice(invoice({ totalMinor: 960_000, paidMinor: 959_998 }), NOW)
    expect(a.settlement).toBe('SETTLED')
    expect(a.outstandingMinor).toBe(0)
    expect(ROUNDING_TOLERANCE_MINOR).toBe(100)
    expect(a.says).toContain('rounding')
  })

  it('the line between a query and arrears is five per cent of the invoice', () => {
    expect(SHORT_PAY_MAX_FRACTION).toBe(0.05)
    // Exactly five per cent held back is still a query.
    expect(settlementOf(invoice({ totalMinor: 1_000_000, paidMinor: 950_000 })).settlement)
      .toBe('SHORT_PAID')
    // A pound more held back and it is arrears.
    expect(settlementOf(invoice({ totalMinor: 1_000_000, paidMinor: 949_000 })).settlement)
      .toBe('PART_PAID')
  })
})

// ── Unapplied cash ───────────────────────────────────────────────────

describe('Money that arrived and matches nothing is money you cannot count', () => {

  it('money received above the invoice total is unapplied cash, not revenue', () => {
    const a = ageInvoice(invoice({ totalMinor: 960_000, paidMinor: 1_000_000 }), NOW)
    expect(a.settlement).toBe('OVERPAID')
    expect(a.unappliedMinor).toBe(40_000)
    // An overpayment is never netted into a balance.
    expect(a.outstandingMinor).toBe(0)
    expect(a.says).toContain('cannot count')
  })

  it('receipts that do not agree with the invoice header are named, not averaged away', () => {
    const a = ageInvoice(
      invoice({ totalMinor: 960_000, paidMinor: 500_000, receiptsMinor: 480_000 }),
      NOW
    )
    expect(a.receiptsDisagree).toBe(true)
  })

  it('receipts nobody read raise no finding, because absent is not the same as zero', () => {
    const a = ageInvoice(invoice({ paidMinor: 500_000, receiptsMinor: null }), NOW)
    expect(a.receiptsDisagree).toBe(false)
  })
})

// ── The customer roll-up ─────────────────────────────────────────────

describe('A roll-up must not hide which kind of problem it is', () => {

  const aged = (invs: Partial<ArInvoice>[]) =>
    invs.map((o, i) => ageInvoice(invoice({ id: `i${i}`, number: `INV-${1000 + i}`, ...o }), NOW))

  it('the customer roll-up says whether it is one big invoice or four hundred small ones', () => {
    const oneBig = forCustomer(
      aged([
        { totalMinor: 40_000_000, dueAt: dueAgo(95) },
        { totalMinor: 500_000, dueAt: dueAgo(10) },
      ])
    )
    expect(oneBig.concentration).toBe('ONE_BIG_INVOICE')
    expect(oneBig.largestOverdueMinor).toBe(40_000_000)
    expect(oneBig.says).toContain('One conversation about one invoice')

    const thin = forCustomer(
      aged(Array.from({ length: 8 }, (_, n) => ({ totalMinor: 500_000, dueAt: dueAgo(20 + n) })))
    )
    expect(thin.concentration).toBe('SPREAD_THIN')
    expect(thin.says).toContain('process fault')
  })

  it('the roll-up adds what is still owed, not what was invoiced', () => {
    const c = forCustomer(
      aged([
        { totalMinor: 1_000_000, paidMinor: 600_000, dueAt: dueAgo(5) },
        { totalMinor: 1_000_000, paidMinor: 1_000_000, dueAt: dueAgo(5) },
      ])
    )
    expect(c.outstandingMinor).toBe(400_000)
    expect(c.invoiceCount).toBe(1)
  })

  it('dollars and rupees are never added into one ageing figure', () => {
    expect(() =>
      forCustomer(aged([{ currency: 'USD' }, { currency: 'INR' }]))
    ).toThrow(/Split the book by currency/)

    const book = ageBook(
      [invoice({ id: 'a', currency: 'USD' }), invoice({ id: 'b', currency: 'INR' })],
      NOW
    )
    expect(book.currencies.sort()).toEqual(['INR', 'USD'])
    expect(book.byCurrency).toHaveLength(2)
  })
})

// ── Days sales outstanding ───────────────────────────────────────────

describe('How long the money actually takes to arrive', () => {

  const month = (label: string, revenueMinor: number) => ({ label, days: 30, revenueMinor })

  it('days sales outstanding uses the countback, because the simple formula flatters a growing book', () => {
    // Billing doubled every month. Collections never changed: everything
    // is settled in about 45 days, so the receivable is the last month
    // and a half of billing.
    const periods = [
      month('2026-08', 800_000_00),
      month('2026-07', 400_000_00),
      month('2026-06', 200_000_00),
      month('2026-05', 100_000_00),
    ]
    const receivable = 800_000_00 + 200_000_00 // one full month plus half of July

    const d = dso(receivable, periods)
    expect(d.method).toBe('COUNTBACK')
    expect(d.days).toBe(45)

    // The textbook formula reports 80 days on the same facts — it is
    // measuring the growth, not the collections.
    expect(d.naiveDays).toBe(80)
    expect(d.says).toContain('growth does not move it')
  })

  it('days sales outstanding is null when there is not enough billing history to count back through', () => {
    const d = dso(500_000_00, [month('2026-08', 100_000_00)])
    expect(d.days).toBeNull()
    expect(d.says).toContain('does not exhaust it')
  })

  it('a month with no billing still ages the receivable rather than being skipped', () => {
    const withGap = dso(100_000_00, [month('2026-08', 0), month('2026-07', 100_000_00)])
    const without = dso(100_000_00, [month('2026-07', 100_000_00)])
    expect(withGap.days).toBe(60)
    expect(without.days).toBe(30)
  })

  it('nothing outstanding is nought days, not a division by zero', () => {
    expect(dso(0, [month('2026-08', 100_000_00)]).days).toBe(0)
  })
})

// ── The dunning ladder ───────────────────────────────────────────────

describe('Four letters and then a person, because the fifth is filed by a rule', () => {

  const aged = (invs: Partial<ArInvoice>[]) =>
    invs.map((o, i) => ageInvoice(invoice({ id: `i${i}`, number: `INV-${1000 + i}`, ...o }), NOW))

  const send = (
    invs: Partial<ArInvoice>[],
    sent: DunningStep[] = []
  ) => dunningForCustomer(aged(invs), sent)

  it('the dunning ladder sends four letters and then stops, because the fifth teaches an AP clerk to filter you', () => {
    expect(LADDER.filter((r) => r.automated).map((r) => r.step)).toEqual([
      'COURTESY', 'FIRST', 'SECOND', 'FINAL',
    ])
    expect(LADDER.filter((r) => !r.automated).map((r) => r.step)).toEqual(['ESCALATED'])
    expect(ESCALATE_AFTER_DAYS).toBe(60)
  })

  it('the first word goes out a week before the invoice is even due', () => {
    const out = send([{ dueAt: dueIn(5) }])
    expect(out.kind).toBe('SEND')
    if (out.kind === 'SEND') {
      expect(out.step).toBe('COURTESY')
      expect(out.says).toContain('never entered')
    }
  })

  it('past sixty days nothing automated goes out and an account manager owns it', () => {
    const out = send([{ dueAt: dueAgo(70) }])
    expect(out.kind).toBe('SEND')
    if (out.kind === 'SEND') {
      expect(out.step).toBe('ESCALATED')
      expect(out.automated).toBe(false)
      expect(out.to).toBe('OUR_ACCOUNT_MANAGER')
    }
  })

  it('once a person owns it, the system says nothing more', () => {
    const out = send([{ dueAt: dueAgo(120) }], ['COURTESY', 'FIRST', 'SECOND', 'FINAL', 'ESCALATED'])
    expect(out.kind).toBe('SILENT')
    if (out.kind === 'SILENT') expect(out.reason).toBe('WITH_A_PERSON')
  })

  it('a rung already sent is not sent again the next morning', () => {
    const out = send([{ dueAt: dueAgo(10) }], ['COURTESY', 'FIRST'])
    expect(out.kind).toBe('SILENT')
    if (out.kind === 'SILENT') {
      expect(out.reason).toBe('ALREADY_SAID')
      expect(out.says).toContain('filter us')
    }
  })

  it('a short payment leaves the ladder and goes to a person, because it is a query and not a debt', () => {
    const out = send([{ totalMinor: 960_000, paidMinor: 940_000, dueAt: dueAgo(40) }])
    expect(out.kind).toBe('SILENT')
    if (out.kind === 'SILENT') {
      expect(out.reason).toBe('IN_DISPUTE')
      expect(out.says).toContain('belongs to a person')
    }
  })

  it('a customer with eight overdue invoices gets one letter, not eight', () => {
    const out = send(
      Array.from({ length: 8 }, (_, n) => ({ totalMinor: 500_000, dueAt: dueAgo(10 + n) }))
    )
    expect(out.kind).toBe('SEND')
    if (out.kind === 'SEND') {
      expect(out.invoiceIds).toHaveLength(8)
      expect(out.amountMinor).toBe(8 * 500_000)
      expect(out.subject).toContain('8 invoices')
    }
  })

  it('an invoice for eight pounds is not worth a letter', () => {
    expect(CHASE_FLOOR_MINOR).toBe(2_500)
    const out = send([{ totalMinor: 800, dueAt: dueAgo(40) }])
    expect(out.kind).toBe('SILENT')
    if (out.kind === 'SILENT') expect(out.reason).toBe('NOT_WORTH_A_LETTER')
  })

  it('a settled account is left alone', () => {
    const out = send([{ totalMinor: 960_000, paidMinor: 960_000, dueAt: dueAgo(40) }])
    expect(out.kind).toBe('SILENT')
    if (out.kind === 'SILENT') expect(out.reason).toBe('ALL_SETTLED')
  })

  it('a run over the whole book decides once per customer, worst first', () => {
    const book = ageBook(
      [
        invoice({ id: 'a', customerId: 'nike', customerName: 'Nike', dueAt: dueAgo(50) }),
        invoice({ id: 'b', customerId: 'nike', customerName: 'Nike', dueAt: dueAgo(12) }),
        invoice({ id: 'c', customerId: 'terumo', customerName: 'Terumo BCT', dueAt: dueAgo(9) }),
      ],
      NOW
    ).byCurrency[0]

    const run = dunningRun(book, {})
    expect(run.send).toHaveLength(2)
    expect(run.send[0].customerName).toBe('Nike')
    expect(run.send[0].invoiceIds).toHaveLength(2)
    expect(run.send[0].step).toBe('FINAL')
  })
})
