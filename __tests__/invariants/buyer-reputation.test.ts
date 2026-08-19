import { describe, it, expect } from 'vitest'
import {
  decisionSpeed,
  paymentBehaviour,
  reputationOf,
  type Decided,
  type InvoiceRecord,
} from '@/lib/buyer-reputation'

/**
 * Every VMS on the market publishes supplier scorecards, because the VMS is
 * bought by the buyer. Nobody scores the buyer — and the buyer's behaviour
 * is the largest cost a small supplier carries.
 *
 * A staffing firm deciding whether to work a requisition asks: will they
 * actually decide, will they pay me, and how many firms am I against.
 */

const NOW = new Date('2026-08-19T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

function sub(submittedDaysAgo: number, decidedDaysAgo: number | null): Decided {
  return {
    submittedAt: daysAgo(submittedDaysAgo),
    decidedAt: decidedDaysAgo === null ? null : daysAgo(decidedDaysAgo),
  }
}

describe('how fast a buyer decides', () => {
  it('says nothing at all on three submissions', () => {
    // Three is an anecdote wearing a metric's clothes, and a supplier
    // planning around it is planning around noise.
    const m = decisionSpeed([sub(10, 8), sub(9, 7), sub(8, 6)], NOW)
    expect(m.value).toBeNull()
    expect(m.said).toMatch(/too few to be worth a number/i)
  })

  it('gives a number once there is enough to stand on', () => {
    const subs = Array.from({ length: 10 }, (_, i) => sub(30 - i, 27 - i))
    const m = decisionSpeed(subs, NOW)
    expect(m.value).toBe(3)
    expect(m.confidence).toBe('ENOUGH')
    expect(m.said).toMatch(/usually 3 days/i)
  })

  it('names the candidates left hanging, which the median flatters away', () => {
    // A buyer who decides quickly on eight and has left eleven waiting is
    // not a fast buyer, and the median cannot see that.
    const decided = Array.from({ length: 8 }, () => sub(20, 19))
    const waiting = Array.from({ length: 3 }, () => sub(40, null))
    const m = decisionSpeed([...decided, ...waiting], NOW)
    expect(m.value).toBe(1)
    expect(m.unknown).toMatch(/3 candidates have been waiting over a fortnight/i)
  })

  it('does not count somebody submitted yesterday as left hanging', () => {
    const decided = Array.from({ length: 8 }, () => sub(20, 19))
    const m = decisionSpeed([...decided, sub(2, null)], NOW)
    expect(m.unknown).toBeNull()
  })

  it('says same day rather than nothing when they are that fast', () => {
    const subs = Array.from({ length: 9 }, () => sub(5, 5))
    expect(decisionSpeed(subs, NOW).said).toMatch(/same day/i)
  })
})

describe('whether a buyer pays on time', () => {
  function inv(dueDaysAgo: number, paidDaysAgo: number | null): InvoiceRecord {
    return {
      dueAt: daysAgo(dueDaysAgo),
      paidAt: paidDaysAgo === null ? null : daysAgo(paidDaysAgo),
      amountCents: 500_000,
    }
  }

  it('never counts an invoice that is not due yet as late', () => {
    // Otherwise anybody who invoiced last week looks like a bad payer.
    const notYetDue: InvoiceRecord[] = Array.from({ length: 10 }, () => ({
      dueAt: inDays(20), paidAt: null, amountCents: 1000,
    }))
    const m = paymentBehaviour(notYetDue, NOW)
    expect(m.value).toBeNull()
    expect(m.said).toMatch(/nothing has come due/i)
  })

  it('says plainly when they pay late', () => {
    const rows = Array.from({ length: 10 }, () => inv(40, 20))
    const m = paymentBehaviour(rows, NOW)
    expect(m.value).toBe(20)
    expect(m.said).toBe('Pays 20 days late.')
  })

  it('says plainly when they pay early, which is worth knowing too', () => {
    const rows = Array.from({ length: 10 }, () => inv(20, 25))
    expect(paymentBehaviour(rows, NOW).said).toMatch(/5 days early/i)
  })

  it('counts an unpaid overdue invoice as late so far rather than ignoring it', () => {
    // Leaving it out would let somebody look punctual by never paying.
    const rows = [
      ...Array.from({ length: 8 }, () => inv(30, 29)),
      ...Array.from({ length: 2 }, () => inv(90, null)),
    ]
    const m = paymentBehaviour(rows, NOW)
    expect(m.unknown).toMatch(/2 invoices are past due and still unpaid/i)
  })

  it('holds back on two invoices', () => {
    expect(paymentBehaviour([inv(30, 20), inv(20, 10)], NOW).value).toBeNull()
  })
})

describe('the line a supplier reads first', () => {
  const base = {
    submissions: Array.from({ length: 10 }, () => sub(20, 18)),
    invoices: Array.from({ length: 10 }, () => ({ dueAt: daysAgo(30), paidAt: daysAgo(28), amountCents: 1000 })),
    supplierCount: 4,
    openPositions: 3,
    medianTenureMonths: 14,
  }

  it('leads with what is actually open to a supplier', () => {
    const r = reputationOf(base, NOW)
    expect(r.worthIt).toMatch(/3 positions open to any supplier/i)
    expect(r.worthIt).toMatch(/4 suppliers already working with them/i)
  })

  it('says so when there is nothing open, rather than selling', () => {
    expect(reputationOf({ ...base, openPositions: 0 }, NOW).worthIt)
      .toMatch(/nothing open to suppliers/i)
  })

  it('reads as slow and late when they are slow and late, rather than flattering', () => {
    // The alternative is a supplier finding out over three months and never
    // coming back.
    const r = reputationOf(
      {
        ...base,
        submissions: Array.from({ length: 10 }, () => sub(60, 20)),
        invoices: Array.from({ length: 10 }, () => ({ dueAt: daysAgo(60), paidAt: daysAgo(15), amountCents: 1000 })),
      },
      NOW
    )
    expect(r.worthIt).toMatch(/usually 40 days/i)
    expect(r.worthIt).toMatch(/pays 45 days late/i)
  })

  it('admits it is too new rather than showing a number built on nothing', () => {
    const r = reputationOf({ ...base, submissions: [], invoices: [] }, NOW)
    expect(r.worthIt).toMatch(/too new to say/i)
  })
})
