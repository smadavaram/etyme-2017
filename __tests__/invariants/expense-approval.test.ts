import { describe, it, expect } from 'vitest'
import { check, gates, returnIt, STALE_AFTER_DAYS, type Expense, type Policy } from '@/lib/expense-approval'

/**
 * The same shape as a timesheet and for the same reason: the client
 * agrees the cost was theirs to bear, the employer agrees to reimburse
 * the person. Different assertions, different companies.
 *
 * 2017 had this right before I did — ClientExpense carried two cycles,
 * one for submission and one for approval, and rejection set it back to
 * not_submitted rather than killing it.
 */

const NOW = new Date('2026-08-29T10:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)
const NAMES = { client: 'Calder Manufacturing', employer: 'Cloudepa Systems' }

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    personName: 'Rohan Menon',
    category: 'Hotel',
    amountCents: 24_000,
    currency: 'USD',
    spentOn: daysAgo(10),
    description: 'Two nights, Dallas',
    hasReceipt: true,
    state: 'SUBMITTED',
    clientApprovedAt: null,
    agreedAt: null,
    agreedCents: null,
    returnedNote: null,
    ...over,
  }
}

function policy(over: Partial<Policy> = {}): Policy {
  return {
    limitCents: 20_000,
    receiptRequired: false,
    receiptAboveCents: 5_000,
    allowed: [],
    ...over,
  }
}

describe('what the policy asks, and how hard it asks', () => {
  it('treats a missing receipt as the one real block', () => {
    // Without it nobody downstream can prove the cost was incurred, and
    // it is the first thing an auditor asks for.
    const c = check(expense({ hasReceipt: false }), policy(), NOW)
    const r = c.find((x) => x.code === 'RECEIPT')!
    expect(r.blocking).toBe(true)
    expect(r.says).toBe('Anything over $50.00 needs a receipt.')
  })

  it('treats over the limit as a question, not a refusal', () => {
    // An expense over the limit is usually a hotel in a city where the
    // limit was set by somebody who has not been there.
    const c = check(expense(), policy(), NOW)
    const over = c.find((x) => x.code === 'OVER_LIMIT')!
    expect(over.blocking).toBe(false)
    expect(over.says).toBe(
      '$240.00 against a limit of $200.00. Not refused — somebody has to say yes to it deliberately.'
    )
  })

  it('blocks a category the client does not reimburse at all', () => {
    const c = check(expense({ category: 'Entertainment' }), policy({ allowed: ['Hotel', 'Travel'] }), NOW)
    const cat = c.find((x) => x.code === 'CATEGORY')!
    expect(cat.blocking).toBe(true)
    expect(cat.says).toBe('This client does not reimburse entertainment.')
  })

  it('flags a stale claim as something a client will fairly query', () => {
    expect(STALE_AFTER_DAYS).toBe(90)
    const c = check(expense({ spentOn: daysAgo(120) }), policy(), NOW)
    const age = c.find((x) => x.code === 'AGE')!
    expect(age.blocking).toBe(false)
    expect(age.says).toMatch(/Past 90 days a client will query it, fairly\./)
  })

  it('says nothing about a receipt when one is attached', () => {
    const c = check(expense({ amountCents: 4_000 }), policy(), NOW)
    expect(c.find((x) => x.code === 'RECEIPT')!.ok).toBe(true)
  })
})

describe('the two agreements', () => {
  it('bills on the client’s and reimburses on the employer’s, separately', () => {
    // A contractor waiting to be paid back for a hotel should not wait
    // on a client's approval queue.
    const g = gates(expense({ agreedAt: NOW }), [], NAMES)
    expect(g.mayReimburse).toBe(true)
    expect(g.mayBill).toBe(false)
    expect(g.says).toBe(
      'Cloudepa Systems will reimburse $240.00. Not billable until Calder Manufacturing agrees.'
    )
  })

  it('says who it is waiting on when only the client has agreed', () => {
    const g = gates(expense({ clientApprovedAt: NOW }), [], NAMES)
    expect(g.says).toBe('Calder Manufacturing agreed $240.00. Waiting on Cloudepa Systems to reimburse.')
  })

  it('shows both numbers where the employer reimburses less', () => {
    const g = gates(
      expense({ clientApprovedAt: NOW, agreedAt: NOW, agreedCents: 20_000 }),
      [], NAMES
    )
    expect(g.says).toBe('Billing $240.00, reimbursing $200.00.')
  })

  it('says it plainly when both agree the same number', () => {
    const g = gates(expense({ clientApprovedAt: NOW, agreedAt: NOW }), [], NAMES)
    expect(g.says).toBe('$240.00 agreed both ways. Billable and reimbursable.')
  })

  it('leads with what is blocking it rather than who is waiting', () => {
    const e = expense({ hasReceipt: false })
    const g = gates(e, check(e, policy(), NOW), NAMES)
    expect(g.maySubmit).toBe(false)
    expect(g.says).toBe('Anything over $50.00 needs a receipt.')
  })
})

describe('sending one back', () => {
  it('is never terminal, because somebody already spent the money', () => {
    // 2017 had this right: rejection reopened it for resubmission. An
    // expense that cannot be corrected is one somebody swallows, and
    // they remember it far longer than the money.
    const v = returnIt('The receipt is for a different date.')
    expect(v.ok).toBe(true)
    expect(v.state).toBe('RETURNED')
  })

  it('needs a reason', () => {
    const v = returnIt('no')
    expect(v.ok).toBe(false)
    expect(v.says).toBe('Say what is wrong with it. Somebody has already spent this money.')
  })

  it('tells the person it is not lost', () => {
    const g = gates(
      expense({ state: 'RETURNED', returnedNote: 'The receipt is for a different date.' }),
      [], NAMES
    )
    expect(g.says).toBe(
      'Sent back: The receipt is for a different date. Correct it and send it again.'
    )
  })
})
