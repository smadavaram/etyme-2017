/**
 * How money actually leaves: in batches, one currency, one file, one
 * remittance advice per supplier.
 *
 * Everything in ap-delay.ts measures `VendorBill.paidAt`, and nothing set
 * it except a clerk typing a date one bill at a time.
 */

import { describe, it, expect } from 'vitest'
import {
  proposeRun, remittanceAdvice, mayApproveRun, applyRunPayment,
  type PayableBill,
} from '@/lib/ap-delay'

const PAY_DAY = new Date('2026-09-15T00:00:00Z')

function bill(over: Partial<PayableBill> = {}): PayableBill {
  return {
    id: 'b1',
    number: 'SUP-100',
    vendorCompanyId: 'v1',
    vendorName: 'Sub A',
    currency: 'USD',
    totalCents: 500_000,
    paidCents: 0,
    dueAt: new Date('2026-09-10T00:00:00Z'),
    status: 'APPROVED',
    ...over,
  }
}

describe('A run is one currency, and everything else is left out with a reason', () => {
  it('a payment run never mixes two currencies', () => {
    const run = proposeRun(
      [
        bill({ id: 'a', currency: 'USD', totalCents: 100_000 }),
        bill({ id: 'b', currency: 'INR', totalCents: 8_000_000 }),
      ],
      'USD',
      PAY_DAY
    )
    expect(run.currency).toBe('USD')
    expect(run.lines.map((l) => l.billId)).toEqual(['a'])
    expect(run.totalCents).toBe(100_000)
    // The rupee bill is not an exclusion — it simply belongs to another run.
    expect(run.excluded).toEqual([])
  })

  it('a run batches the bills that are due by the scheduled date and leaves the rest', () => {
    const run = proposeRun(
      [
        bill({ id: 'due', dueAt: new Date('2026-09-01T00:00:00Z') }),
        bill({ id: 'later', number: 'SUP-101', dueAt: new Date('2026-10-01T00:00:00Z') }),
      ],
      'USD',
      PAY_DAY
    )
    expect(run.lines.map((l) => l.billId)).toEqual(['due'])
    expect(run.excluded[0].reason).toBe('NOT_DUE_YET')
    expect(run.excluded[0].says).toContain('Paying early is a decision')
  })

  it('the run total is the sum of its items to the cent', () => {
    const run = proposeRun(
      [
        bill({ id: 'a', totalCents: 333_33 }),
        bill({ id: 'b', number: 'SUP-101', totalCents: 666_67 }),
        bill({ id: 'c', number: 'SUP-102', totalCents: 1, vendorCompanyId: 'v2', vendorName: 'Sub B' }),
      ],
      'USD',
      PAY_DAY
    )
    expect(run.totalCents).toBe(100_001)
    expect(run.totalCents).toBe(run.lines.reduce((n, l) => n + l.amountCents, 0))
    expect(run.vendors).toBe(2)
  })

  it('a part-paid bill enters the run for what is left, not for its face value', () => {
    const run = proposeRun([bill({ totalCents: 500_000, paidCents: 200_000 })], 'USD', PAY_DAY)
    expect(run.lines[0].amountCents).toBe(300_000)
  })

  it('a disputed bill never enters a payment run', () => {
    const run = proposeRun([bill({ status: 'DISPUTED' })], 'USD', PAY_DAY)
    expect(run.lines).toEqual([])
    expect(run.excluded[0].reason).toBe('DISPUTED')
    expect(run.excluded[0].says).toContain('ends the argument in their favour')
  })

  it('a bill nobody has approved is left out, because a run releases money rather than deciding', () => {
    const run = proposeRun([bill({ status: 'RECEIVED' })], 'USD', PAY_DAY)
    expect(run.excluded[0].reason).toBe('NOT_APPROVED')
    expect(run.excluded[0].says).toContain('not the place to decide whether a bill is right')
  })

  it('a bill already in a live run cannot enter a second one', () => {
    const run = proposeRun([bill({ inRunId: 'run-7' })], 'USD', PAY_DAY)
    expect(run.lines).toEqual([])
    expect(run.excluded[0].reason).toBe('ALREADY_IN_A_RUN')
    expect(run.excluded[0].says).toContain('angry controller')
  })
})

describe('Segregation of duties', () => {
  it('the person who created a run cannot approve it', () => {
    const v = mayApproveRun({ status: 'DRAFT', createdById: 'p1' }, 'p1')
    expect(v.ok).toBe(false)
    expect(v.says).toContain('money leaving the building')
  })

  it('somebody else may approve it', () => {
    const v = mayApproveRun({ status: 'DRAFT', createdById: 'p1' }, 'p2')
    expect(v.ok).toBe(true)
  })

  it('a run that is not a draft cannot be approved again', () => {
    const v = mayApproveRun({ status: 'APPROVED', createdById: 'p1' }, 'p2')
    expect(v.ok).toBe(false)
    expect(v.says).toContain('Only a draft')
  })
})

describe('The advice that lets the supplier place the money', () => {
  it('remittance advice lists every bill covered, with the supplier’s own number', () => {
    const run = proposeRun(
      [
        bill({ id: 'a', number: 'SUP-100', totalCents: 100_000 }),
        bill({ id: 'b', number: 'SUP-101', totalCents: 250_000 }),
        bill({
          id: 'c', number: 'OTH-1', totalCents: 90_000,
          vendorCompanyId: 'v2', vendorName: 'Sub B',
        }),
      ],
      'USD',
      PAY_DAY
    )
    const advices = remittanceAdvice(run, 'Acme Staffing')
    expect(advices).toHaveLength(2)

    const subA = advices.find((a) => a.vendorName === 'Sub A')!
    expect(subA.totalCents).toBe(350_000)
    expect(subA.text).toContain('SUP-100')
    expect(subA.text).toContain('SUP-101')
    expect(subA.text).toContain('Total USD 3,500.00')
    expect(subA.text).toContain('Acme Staffing')
  })

  it('a supplier gets one advice covering everything, not one per bill', () => {
    const run = proposeRun(
      [bill({ id: 'a' }), bill({ id: 'b', number: 'SUP-101' }), bill({ id: 'c', number: 'SUP-102' })],
      'USD',
      PAY_DAY
    )
    const advices = remittanceAdvice(run, 'Acme Staffing')
    expect(advices).toHaveLength(1)
    expect(advices[0].lines).toHaveLength(3)
  })
})

describe('Marking a run paid', () => {
  it('marking a run paid sets the paid date on every bill in it and nothing else', () => {
    const paidOn = new Date('2026-09-15T09:00:00Z')
    const out = applyRunPayment(
      [
        { billId: 'a', amountCents: 500_000 },
        { billId: 'b', amountCents: 200_000 },
      ],
      [
        { id: 'a', totalCents: 500_000, paidCents: 0 },
        { id: 'b', totalCents: 500_000, paidCents: 0 },
        { id: 'untouched', totalCents: 100_000, paidCents: 0 },
      ],
      paidOn
    )
    expect(out.map((o) => o.billId)).toEqual(['a', 'b'])
    expect(out[0].paidAt).toEqual(paidOn)
    expect(out[0].status).toBe('PAID')
    // A part payment carries no paid date — the obligation is still open,
    // and every float figure counts to that date.
    expect(out[1].paidAt).toBeNull()
    expect(out[1].status).toBe('APPROVED')
    expect(out[1].paidCentsAfter).toBe(200_000)
  })
})
