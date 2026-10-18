/**
 * The three-way match, pointed at the money going out.
 *
 * A wrong sell invoice gets queried by the client. A wrong supplier bill
 * gets paid. The engine had forty-two tests and was never called from bill
 * intake, so a sub-vendor could bill hours nobody accepted against a
 * purchase order with no room left and it went straight in.
 */

import { describe, it, expect } from 'vitest'
import {
  matchVendorBill, exceptionQueue, threeWayMatch,
  type VendorBillMatchInput,
} from '@/lib/three-way-match'
import { liveWaivers, readLines } from '@/lib/money/keyed-lines'
import { overBillCheck as poOverBillCheck } from '@/lib/purchase-order'

const NOW = new Date('2026-08-29T00:00:00Z')

const PO = {
  id: 'po-1',
  number: 'PO-4471',
  status: 'OPEN',
  amountCents: 5_000_000,
  consumedCents: 1_000_000,
  startDate: new Date('2026-06-01T00:00:00Z'),
  endDate: new Date('2026-12-31T00:00:00Z'),
}

function input(over: Partial<VendorBillMatchInput> = {}): VendorBillMatchInput {
  return {
    bill: {
      id: 'b1',
      number: 'SUP-991',
      totalCents: 1_600_000,
      currency: 'USD',
      periodStart: new Date('2026-08-01T00:00:00Z'),
      periodEnd: new Date('2026-08-31T00:00:00Z'),
      hours: 160,
      rateCents: 10_000,
    },
    accepted: {
      hours: 160,
      contractRateCents: 10_000,
      firstDay: new Date('2026-08-03T00:00:00Z'),
      lastDay: new Date('2026-08-28T00:00:00Z'),
      count: 4,
    },
    po: PO,
    poRequired: true,
    ...over,
  }
}

describe('A supplier bill is matched against what we authorized and what we accepted', () => {
  it('a supplier bill matches against the purchase order, the approved hours and the bill itself', () => {
    const r = matchVendorBill(input())
    expect(r.matched).toBe(true)
    expect(r.cleanMatch).toBe(true)
    expect(r.poAfter!.remainingCents).toBe(5_000_000 - 1_000_000 - 1_600_000)
  })

  it('a bill for hours nobody accepted fails the receipt check and cannot be approved', () => {
    const r = matchVendorBill(input({ accepted: null }))
    expect(r.matched).toBe(false)
    const receipt = r.checks.find((c) => c.code === 'RECEIPT')!
    expect(receipt.outcome).toBe('FAIL')
    // No signature unlocks this one.
    expect(receipt.overridable).toBe(false)
  })

  it('the hours matched are the ones we accepted for pay, not the ones the client approved', () => {
    // The client approved 40 and we accepted 38. The supplier billed 40.
    const r = matchVendorBill(
      input({
        bill: { ...input().bill, hours: 40, totalCents: 400_000 },
        accepted: { ...input().accepted!, hours: 38 },
      })
    )
    const q = r.checks.find((c) => c.code === 'QUANTITY')!
    expect(q.outcome).toBe('FAIL')
    expect(q.reason).toContain('what we agreed to pay for')
  })

  it('a bill at a rate the buy contract does not carry fails, and no signature unlocks it', () => {
    const r = matchVendorBill(
      input({ bill: { ...input().bill, rateCents: 11_000, totalCents: 1_760_000 } })
    )
    const price = r.checks.find((c) => c.code === 'PRICE')!
    expect(price.outcome).toBe('FAIL')
    expect(price.overridable).toBe(false)
  })

  it('a bill that exceeds what the purchase order has left fails on balance and may be waived by a person', () => {
    const r = matchVendorBill(
      input({ po: { ...PO, consumedCents: 4_500_000 } })
    )
    const bal = r.checks.find((c) => c.code === 'PO_BALANCE')!
    expect(bal.outcome).toBe('FAIL')
    expect(bal.overridable).toBe(true)
    expect(bal.reason).toContain('over by')
  })

  it('a bill with no purchase order where one is required fails and says so', () => {
    const r = matchVendorBill(input({ po: null, poRequired: true }))
    const req = r.checks.find((c) => c.code === 'PO_REQUIRED')!
    expect(req.outcome).toBe('FAIL')
    expect(req.reason).toContain('no ceiling to draw down')
  })

  it('a second bill carrying a number we already hold fails as a duplicate, unwaivably', () => {
    const r = matchVendorBill(
      input({ bill: { ...input().bill, duplicateOfBillId: 'b0' } })
    )
    const dup = r.checks.find((c) => c.code === 'DUPLICATE')!
    expect(dup.outcome).toBe('FAIL')
    expect(dup.overridable).toBe(false)
  })

  it('an exception recorded by a person resolves a waivable failure without erasing it', () => {
    const r = matchVendorBill(
      input({
        po: { ...PO, consumedCents: 4_500_000 },
        overrides: [
          {
            code: 'PO_BALANCE',
            reason: 'Change order signed 27 August, being raised on Monday.',
            byName: 'Ravi Menon',
            at: NOW,
          },
        ],
      })
    )
    expect(r.matched).toBe(true)
    expect(r.cleanMatch).toBe(false)
    const bal = r.checks.find((c) => c.code === 'PO_BALANCE')!
    expect(bal.outcome).toBe('OVERRIDDEN')
    expect(bal.overriddenBy!.name).toBe('Ravi Menon')
  })
})

describe('Refusing an over-bill at the door', () => {
  it('a bill that would take a purchase order past its ceiling is refused with the amount it is over by', () => {
    const v = poOverBillCheck(
      {
        billCents: 1_000_000,
        billCurrency: 'USD',
        po: { ...PO, consumedCents: 4_500_000, currency: 'USD' },
      },
      NOW
    )
    expect(v.ok).toBe(false)
    expect(v.problems[0].code).toBe('PO_CEILING')
    expect(v.problems[0].says).toContain('over by $5,000.00')
    expect(v.poRemainingAfterCents).toBe(-500_000)
  })

  it('a bill within the remaining balance of a purchase order is accepted', () => {
    const v = poOverBillCheck(
      { billCents: 1_000_000, billCurrency: 'USD', po: { ...PO, currency: 'USD' } },
      NOW
    )
    expect(v.ok).toBe(true)
    expect(v.poRemainingAfterCents).toBe(3_000_000)
  })

  it('a bill against a closed purchase order is refused', () => {
    const v = poOverBillCheck(
      {
        billCents: 100_000,
        billCurrency: 'USD',
        po: { ...PO, currency: 'USD', status: 'CLOSED' },
      },
      NOW
    )
    expect(v.ok).toBe(false)
    expect(v.problems.map((p) => p.code)).toContain('PO_CLOSED')
  })

  it('a bill for work outside the purchase order window is refused', () => {
    const v = poOverBillCheck(
      {
        billCents: 100_000,
        billCurrency: 'USD',
        periodStart: new Date('2026-05-01T00:00:00Z'),
        periodEnd: new Date('2026-05-31T00:00:00Z'),
        po: { ...PO, currency: 'USD' },
      },
      NOW
    )
    expect(v.ok).toBe(false)
    expect(v.problems[0].code).toBe('PO_WINDOW')
  })

  it('a bill larger than the buy contract’s expected amount is refused with both numbers', () => {
    const v = poOverBillCheck(
      {
        billCents: 2_400_000,
        billCurrency: 'USD',
        po: null,
        contractExpectedCents: 1_600_000,
        contractCurrency: 'USD',
      },
      NOW
    )
    expect(v.ok).toBe(false)
    expect(v.problems[0].code).toBe('CONTRACT_AMOUNT')
    expect(v.problems[0].says).toContain('$16,000.00')
    expect(v.problems[0].says).toContain('$24,000.00')
  })

  it('a small overage against a contract is tolerance, not a refusal', () => {
    const v = poOverBillCheck(
      {
        billCents: 1_620_000,
        billCurrency: 'USD',
        po: null,
        contractExpectedCents: 1_600_000,
        contractCurrency: 'USD',
      },
      NOW
    )
    expect(v.ok).toBe(true)
  })

  it('a purchase order and a bill in different currencies are never compared', () => {
    const v = poOverBillCheck(
      {
        billCents: 100_000,
        billCurrency: 'INR',
        po: { ...PO, currency: 'USD' },
      },
      NOW
    )
    expect(v.ok).toBe(false)
    expect(v.problems[0].code).toBe('PO_CURRENCY')
    expect(v.problems[0].overridable).toBe(false)
  })

  it('a contract with no expected amount is left unchecked rather than passed', () => {
    const v = poOverBillCheck(
      { billCents: 9_999_999, billCurrency: 'USD', po: null, contractExpectedCents: null },
      NOW
    )
    expect(v.ok).toBe(true)
    expect(v.says).toContain('Nothing to check it against')
  })
})

describe('The exception queue', () => {
  it('an exception queue lists every bill that failed, worst first', () => {
    const failedHard = matchVendorBill(input({ accepted: null }))
    const failedSoft = matchVendorBill(input({ po: { ...PO, consumedCents: 4_900_000 } }))
    const passed = matchVendorBill(input())

    const q = exceptionQueue(
      [
        {
          id: 'small', reference: 'SUP-002', counterparty: 'Sub A', currency: 'USD',
          amountCents: 90_000, receivedAt: new Date('2026-08-27T00:00:00Z'), result: failedHard,
        },
        {
          id: 'big', reference: 'SUP-003', counterparty: 'Sub B', currency: 'USD',
          amountCents: 4_000_000, receivedAt: new Date('2026-08-20T00:00:00Z'), result: failedSoft,
        },
        {
          id: 'fine', reference: 'SUP-004', counterparty: 'Sub C', currency: 'USD',
          amountCents: 1_600_000, receivedAt: new Date('2026-08-01T00:00:00Z'), result: passed,
        },
      ],
      NOW
    )

    // The passing one is not in the queue at all.
    expect(q.map((e) => e.id)).toEqual(['small', 'big'])
    // The small one is first because nobody can wave it through.
    expect(q[0].hardFailures).toContain('RECEIPT')
    expect(q[0].says).toContain('not a judgment call')
    expect(q[1].waivableFailures).toContain('PO_BALANCE')
    expect(q[1].says).toContain('record an exception and say why')
  })
})

describe('The two engines agree about what a ceiling is', () => {
  it('the match and the intake check refuse the same over-bill', () => {
    const bill = { ...input().bill, totalCents: 1_000_000 }
    const po = { ...PO, consumedCents: 4_500_000 }
    const matched = matchVendorBill(input({ bill, po }))
    const intake = poOverBillCheck(
      { billCents: bill.totalCents, billCurrency: 'USD', po: { ...po, currency: 'USD' } },
      NOW
    )
    expect(matched.checks.find((c) => c.code === 'PO_BALANCE')!.outcome).toBe('FAIL')
    expect(intake.ok).toBe(false)
    expect(matched.poAfter!.remainingCents).toBe(intake.poRemainingAfterCents)
  })
})

describe('A typed-in invoice receipt is paid on the same check as a platform invoice (release walk, 2026-10-18)', () => {
  const totalOnly = (totalCents: number, expectedCents: number | null) =>
    matchVendorBill(input({ bill: { ...input().bill, hours: null, rateCents: null, totalCents }, expectedCents }))

  it('a receipt that states neither hours nor rate is checked on its total against the accepted hours at the agreed rate', () => {
    const r = totalOnly(1_600_000, 1_600_000)
    expect(r.matched).toBe(true)
    expect(r.checks.find((c) => c.code === 'AMOUNT')!.outcome).toBe('PASS')
  })

  it('a total that is not the accepted hours at the agreed rate fails, and nobody may waive it because a total cannot say whether the hours or the rate differ', () => {
    const r = totalOnly(1_640_000, 1_600_000)
    const amount = r.checks.find((c) => c.code === 'AMOUNT')!
    expect(amount.outcome).toBe('FAIL')
    expect(amount.overridable).toBe(false)
    expect(amount.reason).toMatch(/Enter the hours and the rate from the invoice/)
    // A recorded waiver is ignored, exactly as a waiver on a duplicate is.
    const waived = matchVendorBill(input({
      bill: { ...input().bill, hours: null, rateCents: null, totalCents: 1_640_000 },
      expectedCents: 1_600_000,
      overrides: [{ code: 'AMOUNT', reason: 'close enough', byName: 'A clerk', at: NOW }],
    }))
    expect(waived.matched).toBe(false)
  })

  it('a total is never paid within a tolerance: one dollar over is a failure', () => {
    expect(totalOnly(1_600_100, 1_600_000).matched).toBe(false)
  })

  it('where the agreed rate cannot be read in the receipt’s currency, the amount check refuses rather than passes', () => {
    const r = totalOnly(1_600_000, null)
    expect(r.checks.find((c) => c.code === 'AMOUNT')!.outcome).toBe('FAIL')
  })

  it('a receipt that states its hours and its rate is judged on those, and its total is not checked a second time', () => {
    const r = matchVendorBill(input({ expectedCents: 1_500_000 }))
    expect(r.checks.find((c) => c.code === 'AMOUNT')).toBeUndefined()
    expect(r.matched).toBe(true)
  })

  it('the same work on an earlier receipt fails the duplicate check in a sentence naming that receipt, and nobody may waive it', () => {
    const says = 'Helena Marsh’s week of Oct 4 is already on Techpeple’s invoice TP-A, received Oct 12, 2026, so this invoice would owe it twice.'
    const r = matchVendorBill(input({ bill: { ...input().bill, duplicateOfBillId: 'TP-A', duplicateSays: says } }))
    const dup = r.checks.find((c) => c.code === 'DUPLICATE')!
    expect(dup.outcome).toBe('FAIL')
    expect(dup.overridable).toBe(false)
    expect(dup.reason).toBe(says)
  })
})

describe('A typed-in invoice receipt is matched line by line, like a platform invoice (2026-10-18)', () => {
  const AUG = { start: new Date('2026-08-02T00:00:00Z'), end: new Date('2026-08-08T00:00:00Z') }
  const week = {
    id: 'ts-1', status: 'APPROVED', approvedHours: 40, contractRateCents: 11_800,
    periodStart: AUG.start, periodEnd: AUG.end, alreadyBilledOnInvoiceId: null,
  }
  const hoursLine = (hours: number, amountCents = Math.round(hours * 11_800)) => ({
    id: 'line-1', timesheetId: 'ts-1', personName: 'Helena Marsh', hours, rateCents: 11_800, amountCents,
  })
  const receipt = (lines: Parameters<typeof threeWayMatch>[0]['lines'], extra: Partial<Parameters<typeof threeWayMatch>[0]> = {}) =>
    threeWayMatch({
      invoice: { id: 'vb-1', totalCents: lines.reduce((n, l) => n + l.amountCents, 0), periodStart: AUG.start, periodEnd: AUG.end, contractPeriod: null },
      lines,
      timesheets: { 'ts-1': week },
      po: null,
      poRequired: false,
      ...extra,
    })

  it('a typed-in receipt’s hours line is matched against the hours the paying firm accepted, at the agreed rate', () => {
    const r = receipt([hoursLine(40)])
    expect(r.matched).toBe(true)
    expect(r.cleanMatch).toBe(true)
  })

  it('an hours line for more hours than were accepted fails the hours check, which the paying team may waive with a reason', () => {
    const r = receipt([hoursLine(42)])
    const q = r.checks.find((c) => c.code === 'QUANTITY')!
    expect(q).toMatchObject({ outcome: 'FAIL', overridable: true, reason: 'Helena Marsh: billed 42h, approved 40h' })
    const waived = receipt([hoursLine(42)], { overrides: [{ code: 'QUANTITY', reason: 'Handover hours agreed in writing', byName: 'An AP clerk', at: NOW }] })
    expect(waived.matched).toBe(true)
    expect(waived.cleanMatch).toBe(false)
  })

  it('an hours line for more than its hours at its rate fails the arithmetic, and nobody may waive it', () => {
    const r = receipt([hoursLine(40, 40 * 11_800 + 5_000)])
    const ext = r.checks.find((c) => c.code === 'EXTENSION')!
    expect(ext).toMatchObject({ outcome: 'FAIL', overridable: false })
    expect(receipt([hoursLine(40, 40 * 11_800 + 5_000)], {
      overrides: [{ code: 'EXTENSION', reason: 'overtime, surely', byName: 'An AP clerk', at: NOW }],
    }).matched).toBe(false)
  })

  it('a receipt whose lines do not add up to its total fails, and nobody may waive it', () => {
    const r = threeWayMatch({
      invoice: { id: 'vb-1', totalCents: 40 * 11_800 + 100, periodStart: AUG.start, periodEnd: AUG.end, contractPeriod: null },
      lines: [hoursLine(40)], timesheets: { 'ts-1': week }, po: null, poRequired: false,
    })
    expect(r.checks.find((c) => c.code === 'HEADER_TOTAL')).toMatchObject({ outcome: 'FAIL', overridable: false })
  })

  it('a typed-in receipt’s expense line is paid only against an expense approved on that line, for the amount approved', () => {
    const expenseLine = { id: 'line-2', timesheetId: null, expenseId: 'ex-1', personName: 'Helena Marsh', hours: 0, rateCents: 0, amountCents: 25_000 }
    const approved = { id: 'ex-1', status: 'APPROVED', totalCents: 25_000, periodStart: AUG.start, periodEnd: AUG.start }
    expect(receipt([expenseLine], { expenses: { 'ex-1': approved } }).matched).toBe(true)

    const said = 'Line 1 bills Helena Marsh’s travel expense of Aug 2, 2026, which is submitted, not approved, so it is not paid.'
    const submitted = receipt([expenseLine], { expenses: { 'ex-1': { ...approved, status: 'SUBMITTED' } }, receiptSays: { 'line-2': said } })
    expect(submitted.checks.find((c) => c.code === 'RECEIPT')).toMatchObject({ outcome: 'FAIL', overridable: false, reason: said })

    const more = receipt([{ ...expenseLine, amountCents: 27_500 }], { expenses: { 'ex-1': approved } })
    expect(more.checks.find((c) => c.code === 'RECEIPT')!.outcome).toBe('FAIL')
  })

  it('an expense incurred outside the receipt’s period fails the period check, as a week would', () => {
    const expenseLine = { id: 'line-2', timesheetId: null, expenseId: 'ex-1', personName: 'Helena Marsh', hours: 0, rateCents: 0, amountCents: 25_000 }
    const july = new Date('2026-07-20T00:00:00Z')
    const r = receipt([expenseLine], { expenses: { 'ex-1': { id: 'ex-1', status: 'APPROVED', totalCents: 25_000, periodStart: july, periodEnd: july } } })
    const period = r.checks.find((c) => c.code === 'PERIOD')!
    expect(period).toMatchObject({ outcome: 'FAIL', overridable: true })
    expect(period.reason).toMatch(/^Helena Marsh: expense incurred Jul 20, 2026 to Jul 20, 2026, billed on a Aug 2, 2026–Aug 8, 2026 invoice$/)
  })

  it('a milestone line passes only against a milestone accepted, for the amount agreed', () => {
    const line = { id: 'line-3', timesheetId: null, milestoneId: 'ms-1', personName: 'Milestone', hours: 0, rateCents: 0, amountCents: 150_000 }
    expect(receipt([line], { milestones: { 'ms-1': { id: 'ms-1', status: 'ACCEPTED', amountCents: 150_000 } } }).matched).toBe(true)
    expect(receipt([line], { milestones: { 'ms-1': { id: 'ms-1', status: 'DELIVERED', amountCents: 150_000 } } }).matched).toBe(false)
  })

  it('work an earlier receipt already holds, or one expense named twice, fails the duplicate check, and nobody may waive it', () => {
    const says = 'Helena Marsh’s expense of $250.00 is already on Techpeple’s invoice TP-9, received Aug 10, 2026, so this invoice would owe it twice.'
    const expenseLine = { id: 'line-2', timesheetId: null, expenseId: 'ex-1', personName: 'Helena Marsh', hours: 0, rateCents: 0, amountCents: 25_000 }
    const approved = { 'ex-1': { id: 'ex-1', status: 'APPROVED', totalCents: 25_000 } }
    const held = receipt([expenseLine], { expenses: approved, heldElsewhere: says })
    expect(held.checks.find((c) => c.code === 'DUPLICATE')).toMatchObject({ outcome: 'FAIL', overridable: false, reason: says })
    const twice = receipt([expenseLine, { ...expenseLine, id: 'line-3' }], { expenses: approved })
    expect(twice.checks.find((c) => c.code === 'DUPLICATE')!.outcome).toBe('FAIL')
  })

  it('a platform invoice with no caller sentences is matched exactly as before', () => {
    const r = receipt([hoursLine(40)])
    expect(r.checks.find((c) => c.code === 'DUPLICATE')!.reason).toBe('No timesheet is billed more than once')
    expect(r.checks.find((c) => c.code === 'PERIOD')!.reason).toBe('All work was done in the period being billed')
  })
})

describe('Exceptions on a typed-in receipt describe one total', () => {
  const waiver = (code: string, totalCentsAtOverride: number) => ({
    code, reason: 'Order being topped up this week', byName: 'Dana Whitfield', at: NOW, totalCentsAtOverride,
  })

  it('a difference the paying team waives with a reason stands while the receipt is for the total it was waived at', () => {
    const w = liveWaivers([waiver('PO_BALANCE', 448_400)], 448_400, 'USD')
    expect(w.live.map((x) => x.code)).toEqual(['PO_BALANCE'])
    expect(w.voided).toBeNull()
  })

  it('the waiver dies if the total changes, and the sentence says what it was for and what the receipt is now', () => {
    const w = liveWaivers([waiver('PO_BALANCE', 448_400)], 472_000, 'USD')
    expect(w.live).toEqual([])
    expect(w.voided).toBe(
      'The exception Dana Whitfield recorded was for $4,484.00; the receipt is now $4,720.00, so it no longer covers it. Record the exception again if it still stands.'
    )
  })

  it('a waiver on the rate, a week nobody accepted, the same work twice or a bare total is never honored, whatever a row says', () => {
    const w = liveWaivers(['PRICE', 'RECEIPT', 'DUPLICATE', 'AMOUNT', 'NO_SUCH_CHECK'].map((c) => waiver(c, 100)), 100, 'USD')
    expect(w.live).toEqual([])
  })
})

describe('The lines a clerk types in', () => {
  it('each line bills exactly one week, expense or milestone, and says so when it does not', () => {
    const none = readLines([{ amount: 100 }], 'USD')
    expect(none).toMatchObject({ ok: false, field: 'lines.0' })
    expect((none as any).says).toMatch(/^Line 1 must bill one thing: .* it names none\.$/)
    const two = readLines([{ timesheetId: 'a', expenseId: 'b', amount: 100, hours: 1, rateCents: 100 }], 'USD')
    expect((two as any).says).toMatch(/it names more than one\.$/)
  })

  it('a week’s line states the hours and the rate the supplier’s invoice states, and an expense or milestone line states only its amount', () => {
    expect(readLines([{ timesheetId: 'a', amount: 100 }], 'USD')).toMatchObject({ ok: false, field: 'lines.0.hours' })
    expect(readLines([{ timesheetId: 'a', hours: 40, amount: 4720 }], 'USD')).toMatchObject({ ok: false, field: 'lines.0.rateCents' })
    expect(readLines([{ timesheetId: 'a', hours: 40.123, rateCents: 11800, amount: 4720 }], 'USD')).toMatchObject({ ok: false, field: 'lines.0.hours' })
    expect(readLines([{ expenseId: 'e', hours: 2, amount: 250 }], 'USD')).toMatchObject({ ok: false, field: 'lines.0' })
  })

  it('an amount typed in whole currency is kept in minor units, and one typed in cents must be whole cents', () => {
    const r = readLines([{ expenseId: 'e', amount: 250.5 }, { timesheetId: 't', hours: 40, rateCents: 11_800, amountCents: 472_000 }], 'USD')
    expect(r).toMatchObject({ ok: true })
    expect((r as any).lines.map((l: any) => l.amountCents)).toEqual([25_050, 472_000])
    expect(readLines([{ expenseId: 'e', amountCents: 250.5 }], 'USD')).toMatchObject({ ok: false, field: 'lines.0.amountCents' })
    // Yen have no minor unit: 2,500 yen is 2,500.
    expect((readLines([{ expenseId: 'e', amount: 2500 }], 'JPY') as any).lines[0].amountCents).toBe(2500)
  })

  it('a receipt with no lines is a total, checked on its amount as before', () => {
    expect(readLines(undefined, 'USD')).toBeNull()
    expect(readLines([], 'USD')).toBeNull()
  })
})
