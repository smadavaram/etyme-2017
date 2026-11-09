import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ledgerOf, billCountsAsBilled } from '@/lib/money/order-ledger'
import { lineBillingFrom, ageInWeeks, ageBand, rollUp, type LineIn, type WeekPrice } from '@/lib/money/signed-unbilled'
import { offersSend, offersSubmit, notYoursToSendSays, sentInPlace, sentRowsInPlace, sentSays } from '@/lib/money/bill-sent-view'

/**
 * One definition of money (the founder's scale audit, 2026-11-08).
 *
 * PO-2026-ADIVD read $466,700 left on one screen and $481,600 on
 * another; the $14,900 between them was two draft bills one reader added
 * and the other did not. These sentences hold the arithmetic every money
 * view now reads, with no database: a draft is not billed, Left is
 * Authorized minus Billed, and drafts are said apart.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('an order has one Authorized, one Billed and one Left', () => {
  const order = {
    amount: '500000.00',
    currency: 'USD',
    bills: [
      { number: 'IN-1', status: 'SUBMITTED', currency: 'USD', total: '10000.00' },
      { number: 'IN-2', status: 'PAID', currency: 'USD', total: '8400.00' },
      { number: 'IN-3', status: 'DRAFT', currency: 'USD', total: '9100.00' },
      { number: 'IN-4', status: 'ISSUED', currency: 'USD', total: '5800.00' },
      { number: 'IN-5', status: 'CANCELLED', currency: 'USD', total: '99999.00' },
      { number: 'IN-6', status: 'VOID', currency: 'USD', total: '1.00' },
    ],
    receipts: [
      { number: 'VB-1', status: 'APPROVED', currency: 'USD', totalCents: 120_000 },
      { number: 'VB-2', status: 'CANCELLED', currency: 'USD', totalCents: 5_000_000 },
    ],
  }

  it('a bill drafted and never sent is not billed, and nor is one raised and never sent', () => {
    expect(billCountsAsBilled('DRAFT')).toBe(false)
    expect(billCountsAsBilled('ISSUED')).toBe(false)
    expect(billCountsAsBilled('SUBMITTED')).toBe(true)
    expect(billCountsAsBilled('PART_PAID'.replace('PART_', 'PARTIALLY_'))).toBe(true)
  })

  it('Billed is the bills sent plus the invoice receipts typed in, and a cancelled or void document counts for nothing', () => {
    const l = ledgerOf(order)
    expect(l.billedMinor).toBe(1_000_000 + 840_000 + 120_000)
  })

  it('for every order, Authorized minus Billed equals Left', () => {
    const l = ledgerOf(order)
    expect(l.authorizedMinor).toBe(50_000_000)
    expect(l.leftMinor).toBe(l.authorizedMinor - l.billedMinor)
  })

  it('the drafts are said apart, as drafted and not sent, and never inside Billed', () => {
    const l = ledgerOf(order)
    expect(l.draftedNotSentMinor).toBe(910_000 + 580_000)
    expect(l.draftedNotSent).toBe(2)
  })

  it('the audit’s two figures for one order cannot both be read: Left differs from Authorized minus all bills by exactly the drafts', () => {
    const l = ledgerOf(order)
    const countingDrafts = l.authorizedMinor - (l.billedMinor + l.draftedNotSentMinor)
    expect(l.leftMinor - countingDrafts).toBe(l.draftedNotSentMinor)
  })

  it('PO-2026-ADIWB as the audit verified it: $302,000 authorized, $5,800 and $17,400 billed, $278,800 left', () => {
    const l = ledgerOf({
      amount: '302000.00', currency: 'USD', receipts: [],
      bills: [
        { number: 'A', status: 'SUBMITTED', currency: 'USD', total: '5800.00' },
        { number: 'B', status: 'PAID', currency: 'USD', total: '17400.00' },
      ],
    })
    expect(l.billedMinor).toBe(2_320_000)
    expect(l.leftMinor).toBe(27_880_000)
  })

  it('a bill in another currency is named and never added: rupees and dollars are not added', () => {
    const l = ledgerOf({
      amount: '1000.00', currency: 'USD', receipts: [],
      bills: [{ number: 'IN-INR', status: 'SUBMITTED', currency: 'INR', total: '50000.00' }],
    })
    expect(l.billedMinor).toBe(0)
    expect(l.foreign).toEqual(['IN-INR'])
  })

  it('an order in dong is counted in dong, with no cents the dong does not have', () => {
    const l = ledgerOf({
      amount: '924000000', currency: 'VND', receipts: [],
      bills: [{ number: 'V1', status: 'SUBMITTED', currency: 'VND', total: '24000000' }],
    })
    expect(l.leftMinor).toBe(900_000_000)
  })

  it('an order billed past its ceiling reads overdrawn, never a Left of nought', () => {
    const l = ledgerOf({
      amount: '100.00', currency: 'USD', receipts: [],
      bills: [{ number: 'X', status: 'SUBMITTED', currency: 'USD', total: '150.00' }],
    })
    expect(l.leftMinor).toBe(-5_000)
    expect(l.overdrawn).toBe(true)
  })

  it('the order’s page reads the one ledger, not a sum of its own', () => {
    const src = read('src/app/api/purchase-orders/route.ts')
    expect(src).toMatch(/orderLedgers\(/)
    expect(src).toMatch(/linesBilled\(/)
    expect(src).not.toMatch(/invoicedCents = sameCurrency/)
  })

  it('the three-way check adds only bills in the order’s own currency to what an order has drawn', () => {
    const src = read('src/lib/invoice-match.ts')
    expect(src).toMatch(/o\.currency\.toUpperCase\(\) === orderCcy/)
  })
})

describe('signed, billed, and signed and not billed, by week', () => {
  const sunday = (iso: string) => new Date(`${iso}T00:00:00Z`)
  type Bl = LineIn['billLines'][number]
  const rosa = (weeks: { start: string; hours: number }[], sentOn: { start: string; hours?: number }[], draftOn: string[], extra: Partial<LineIn> = {}): LineIn => ({
    sellContractId: 'sc-rosa', personId: 'p-rosa', personName: 'Rosa Delgado', currency: 'USD',
    sheets: weeks.map((w) => ({ timesheetId: `ts-${w.start}`, periodStart: sunday(w.start), signedHours: w.hours })),
    billLines: [
      ...sentOn.map((s): Bl => ({ timesheetId: `ts-${s.start}`, expenseId: null, hours: s.hours ?? 40, amountMinor: Math.round((s.hours ?? 40) * 9_800), invoice: { id: 'inv-sent', number: 'IN-SENT', status: 'SUBMITTED', currency: 'USD' } })),
      ...draftOn.map((s): Bl => ({ timesheetId: `ts-${s}`, expenseId: null, hours: 40, amountMinor: 448_000, invoice: { id: 'inv-draft', number: 'IN-DRAFT', status: 'DRAFT', currency: 'USD' } })),
    ],
    ...extra,
  })
  // The next bill's answer, as the generator's dry run would give it: here
  // $112 an hour, and a 45-hour week with its five hours at time and a half.
  const nextBill = (_ts: string, hours: number): WeekPrice =>
    ({ amountMinor: Math.round(Math.min(hours, 40) * 11_200 + Math.max(0, hours - 40) * 16_800), billedHours: hours, unpriced: null, says: null })
  const thirty = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 3, 5 + i * 7))
    return { start: d.toISOString().slice(0, 10), hours: 40 }
  })
  const today = new Date('2026-11-09T12:00:00Z')

  it('signed and not billed is signed minus billed, week by week, and a draft is not billed', () => {
    const b = lineBillingFrom(rosa(thirty, [{ start: thirty[0].start }, { start: thirty[1].start }], [thirty[2].start]), today, nextBill)
    expect(b.signed.hours).toBe(1200)
    expect(b.billed.hours).toBe(80)
    expect(b.notBilled.hours).toBe(1120)
    expect(b.notBilled.weeks).toHaveLength(28)
  })

  it('1,101 unbilled hours at Rosa Delgado’s $112 are $123,312, the audit’s own figure', () => {
    const weeks = thirty.map((w, i) => ({ ...w, hours: i === 29 ? 21 : 40 }))
    const b = lineBillingFrom(rosa(weeks, [{ start: weeks[0].start }, { start: weeks[1].start }], []), today, nextBill)
    expect(b.notBilled.hours).toBe(1101)
    expect(b.notBilled.amountMinor).toBe(12_331_200)
  })

  it('an unbilled week is priced by the next bill’s own answer, a decided overtime premium included, never by a rate of the reader’s own', () => {
    const b = lineBillingFrom(rosa([{ start: '2026-09-20', hours: 45 }], [], []), today, nextBill)
    expect(b.notBilled.amountMinor).toBe(40 * 11_200 + 5 * 16_800)
  })

  it('a week the next bill would leave off has no amount, says why, and blanks the line’s signed money rather than being guessed', () => {
    const b = lineBillingFrom(rosa([{ start: '2026-10-04', hours: 40 }], [], []), today,
      () => ({ amountMinor: null, billedHours: null, unpriced: 'overtime', says: 'Nobody has decided the overtime.' }))
    expect(b.notBilled.weeks[0].amountMinor).toBeNull()
    expect(b.notBilled.unpriced).toBe(1)
    expect(b.signed.amountMinor).toBeNull()
  })

  it('a week on a draft names that draft and is valued at what the draft holds for it, never the draft’s number as the total', () => {
    const b = lineBillingFrom(rosa(thirty, [], [thirty[3].start]), today, nextBill)
    const onDraft = b.notBilled.weeks.filter((w) => w.onDraft)
    expect(onDraft).toHaveLength(1)
    expect(onDraft[0].onDraft!.number).toBe('IN-DRAFT')
    expect(onDraft[0].amountMinor).toBe(448_000)
    expect(b.drafted.bills[0].amountMinor).toBeLessThan(b.notBilled.amountMinor)
    expect(b.notBilled.onDraftHours).toBe(40)
  })

  it('an accepted expense the next bill would carry, and no sent bill does, is signed and not billed', () => {
    const b = lineBillingFrom(rosa([], [], [], { plannedExpenses: [{ expenseId: 'e1', amountMinor: 57_600 }] }), today, nextBill)
    expect(b.notBilled.expenseMinor).toBe(57_600)
    expect(b.notBilled.amountMinor).toBe(57_600)
  })

  it('hours billed past what was signed for a week are said apart, so Signed = Billed − billed over signed + not billed, to the cent', () => {
    // Lucía Fernández: 41.5 hours billed on a 40-hour signed week, $98 an hour.
    const line = rosa([{ start: '2026-10-04', hours: 40 }], [{ start: '2026-10-04', hours: 41.5 }], [])
    const b = lineBillingFrom(line, today, nextBill)
    expect(b.billedOverSigned).toEqual({ hours: 1.5, amountMinor: 14_700 })
    expect(b.notBilled.weeks).toHaveLength(0)
    expect(b.signed.amountMinor).toBe(b.billed.amountMinor - 14_700)
    expect(b.signed.amountMinor).toBe(40 * 9_800)
  })

  it('a week the client has not signed is not counted as signed', () => {
    const line = rosa([{ start: '2026-10-25', hours: 40 }], [], [])
    line.sheets[0].signedHours = null
    const b = lineBillingFrom(line, today, nextBill)
    expect(b.signed.hours).toBe(0)
    expect(b.notBilled.weeks).toHaveLength(0)
    expect(b.says).toBeNull()
  })

  it('unbilled weeks age by whole weeks since the Saturday that ended them, in five bands', () => {
    expect(ageInWeeks('2026-11-07', today)).toBe(0)
    expect(ageInWeeks('2026-10-31', today)).toBe(1)
    expect(ageBand(1)).toBe('1 week or less')
    expect(ageBand(4)).toBe('2 to 4 weeks')
    expect(ageBand(30)).toBe('Over 13 weeks')
    const b = lineBillingFrom(rosa(thirty, [], []), today, nextBill)
    expect(b.notBilled.aging.reduce((n, a) => n + a.weeks, 0)).toBe(30)
    expect(b.notBilled.aging.reduce((n, a) => n + a.amountMinor, 0)).toBe(b.notBilled.amountMinor)
  })

  it('a client rollup adds lines one currency at a time and never across currencies', () => {
    const usd = lineBillingFrom(rosa([{ start: '2026-10-04', hours: 40 }], [], []), today, nextBill)
    const inr = lineBillingFrom({ ...rosa([{ start: '2026-10-04', hours: 40 }], [], []), currency: 'INR' }, today, nextBill)
    const r = rollUp([usd, inr])
    expect(r.map((x) => x.currency).sort()).toEqual(['INR', 'USD'])
    expect(r.find((x) => x.currency === 'USD')!.notBilledMinor).toBe(448_000)
  })

  it('the one reader prices through the Bills page’s own generator on a dry run, and the firm’s Today figure reads that reader', () => {
    const reader = read('src/lib/money/signed-unbilled.ts')
    expect(reader).toMatch(/generateBill\(caller, \{ engagementId: a\.line\.engagementId/)
    expect(reader).toMatch(/dryRun: true/)
    expect(reader).not.toMatch(/rateInForce/)
    expect(read('src/lib/money/firm-today.ts')).toMatch(/await signedAndBilled\(own\.map/)
    expect(read('src/lib/money/firm-today.ts')).not.toMatch(/generateBill\(/)
  })
})

describe('a bill sent once cannot be sent again, and the page says so without a reload', () => {
  const draft = { id: 'b1', status: 'DRAFT', submittedAt: null, deliverySays: null }

  it('Send is offered only on a bill drafted or raised, never on one already sent', () => {
    expect(offersSend('DRAFT')).toBe(true)
    expect(offersSend('ISSUED')).toBe(true)
    for (const s of ['SUBMITTED', 'PARTIALLY_PAID', 'PAID', 'HELD', 'DISPUTED', 'CANCELLED']) expect(offersSend(s)).toBe(false)
  })

  it('the route’s reply is applied at once: the status, the day and to whom, so no row reads Draft after it was sent', () => {
    const after = sentInPlace(draft, { invoice: { status: 'SUBMITTED', submittedAt: '2026-11-09T15:00:00Z' }, delivery: null }, 'Northbend Athletic')
    expect(after.status).toBe('SUBMITTED')
    expect(after.deliverySays).toBe('Sent to Northbend Athletic on Nov 9, 2026.')
    expect(offersSend(after.status)).toBe(false)
  })

  it('where the delivery said whom it reached, that sentence is the one shown', () => {
    expect(sentSays('Northbend Athletic', '2026-11-09', 'Sent to dana@northbend.example on Nov 9')).toBe('Sent to dana@northbend.example on Nov 9')
  })

  it('a reply that names no status changes nothing, so a page never claims a sending the route did not report', () => {
    expect(sentInPlace(draft, {}, 'Northbend Athletic')).toBe(draft)
  })

  it('the bulk Send updates only the rows it sent, in place', () => {
    const rows = [draft, { ...draft, id: 'b2' }]
    const out = sentRowsInPlace(rows, [
      { invoiceId: 'b1', status: 'submitted', invoice: { status: 'SUBMITTED', submittedAt: '2026-11-09T00:00:00Z' } },
      { invoiceId: 'b2', status: 'skipped' },
    ], () => 'Northbend Athletic')
    expect(out[0].status).toBe('SUBMITTED')
    expect(out[1]).toBe(rows[1])
  })

  it('the bill’s page draws Send only where it may be sent, holds it while the route answers, and applies the reply', () => {
    const src = read('src/app/dashboard/invoices/[id]/page.tsx')
    expect(src).toMatch(/offersSubmit\(\{/)
    expect(src).toMatch(/disabled=\{sending\}/)
    expect(src).toMatch(/sentInPlace\(prev\.invoice/)
  })

  it('the Bills page applies the bulk Send’s results in place', () => {
    expect(read('src/app/dashboard/invoices/page.tsx')).toMatch(/sentRowsInPlace\(rows/)
  })
})

describe('one due day on every money screen', () => {
  it('Bills and Payables print a due day through the one formatter, in UTC, never the browser’s own zone', () => {
    for (const p of ['src/app/dashboard/invoices/page.tsx', 'src/app/dashboard/ap/page.tsx']) {
      const src = read(p)
      expect(src).not.toMatch(/\.toLocaleDateString\(/)
      expect(src).toMatch(/formatDay\(/)
    }
  })
})

describe('a bill raised and not sent is owed by nobody, and only its sender is offered Send (walk 9)', () => {
  const sendsBills = ['invoices.issue']

  it('Submit for payment is drawn only for a seat at the firm that raised the bill, that sends bills, on a bill not yet sent', () => {
    expect(offersSubmit({ status: 'ISSUED', direction: 'RECEIVABLE', permissions: sendsBills })).toBe(true)
    expect(offersSubmit({ status: 'ISSUED', direction: 'PAYABLE', permissions: ['*'] })).toBe(false)
    expect(offersSubmit({ status: 'ISSUED', direction: 'RECEIVABLE', permissions: ['invoices.read'] })).toBe(false)
    expect(offersSubmit({ status: 'SUBMITTED', direction: 'RECEIVABLE', permissions: sendsBills })).toBe(false)
    expect(offersSubmit({ status: 'ISSUED', direction: 'RECEIVABLE', permissions: sendsBills, readingInASeat: true })).toBe(false)
    expect(offersSubmit({ status: 'ISSUED', direction: 'RECEIVABLE', permissions: null })).toBe(false)
  })

  it('a seat at the paying firm is told the supplier sends the bill, never a role at its own firm', () => {
    const parties = { vendor: { id: 'bm', name: 'Brightmoor Staffing' }, client: { id: 'nb', name: 'Northbend Athletic' } }
    expect(notYoursToSendSays(parties, 'bm')).toBeNull()
    const says = notYoursToSendSays(parties, 'nb')!
    expect(says).toContain('Brightmoor Staffing sends this bill')
    expect(says).not.toMatch(/Owner|manages roles/)
    expect(notYoursToSendSays({ vendor: null, client: null }, 'nb')).toBeNull()
  })

  it('the bill’s page draws both Send and Submit for payment through the one rule', () => {
    const src = read('src/app/dashboard/invoices/[id]/page.tsx')
    expect(src.match(/offersSubmit\(\{/g)?.length).toBe(2)
    expect(src).not.toMatch(/m\.matched && inv\.status === 'ISSUED' && \(/)
  })

  it('every owed, due, paid and billed figure in money’s files hides a raised bill as well as a draft, through the one list', () => {
    const files = [
      // The figures. The guards against paying a week twice (a typed-in
      // receipt for hours already on a bill, raised or sent) and the acts on
      // a document (applying cash, a credit note) keep counting a raised
      // bill, because it may be sent the next minute.
      'src/app/api/invoices/route.ts', 'src/app/api/ap/route.ts', 'src/lib/money/margin.ts', 'src/lib/money/what-we-owe.ts',
      'src/lib/money/overtime-not-paid.ts', 'src/lib/money/commission-accrual.ts', 'src/lib/money/supplier-invoices.ts',
    ]
    for (const f of files) {
      const src = read(f)
      expect(src, f).not.toMatch(/\[('(DRAFT|CANCELLED|VOID)',? ?){3}\]/)
      expect(src, f).toMatch(/DRAWS_NOTHING/)
    }
    expect(read('src/app/api/invoices/route.ts')).toMatch(/BILL_NOT_SENT\.includes\(row\.status\) && row\.direction !== 'RECEIVABLE'/)
    expect(read('src/app/api/invoices/[id]/route.ts')).toMatch(/BILL_NOT_SENT\.includes\(invoice\.status\) && readAs !== 'RECEIVABLE'/)
  })

  it('an accepted expense not billed yet ages with the weeks, so the bands add up to the whole', () => {
    const today = new Date('2026-11-09T12:00:00Z')
    const b = lineBillingFrom({
      sellContractId: 'l', personId: 'p', personName: 'Rosa Delgado', currency: 'USD',
      sheets: [{ timesheetId: 't1', periodStart: new Date('2026-10-04T00:00:00Z'), signedHours: 40 }],
      billLines: [],
      plannedExpenses: [{ expenseId: 'e1', amountMinor: 57_600, periodEnd: new Date('2026-06-30T00:00:00Z') }],
    }, today, () => ({ amountMinor: 448_000, billedHours: 40, unpriced: null, says: null }))
    expect(b.notBilled.amountMinor).toBe(448_000 + 57_600)
    expect(b.notBilled.aging.reduce((n, a) => n + a.amountMinor, 0)).toBe(b.notBilled.amountMinor)
    expect(b.notBilled.aging.find((a) => a.band === 'Over 13 weeks')!.expenseMinor).toBe(57_600)
  })
})
