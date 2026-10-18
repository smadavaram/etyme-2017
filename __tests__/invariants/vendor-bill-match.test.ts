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
  matchVendorBill, exceptionQueue,
  type VendorBillMatchInput,
} from '@/lib/three-way-match'
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
