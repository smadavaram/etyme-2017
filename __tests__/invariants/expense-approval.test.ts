import { describe, it, expect } from 'vitest'
import { check, gates, returnIt, STALE_AFTER_DAYS, type Expense, type Policy } from '@/lib/expense-approval'
import {
  mayDecide, acceptanceChain, legBills, capFor, waitingOn,
  type ExpenseOnRecord, type Leg, type AcceptanceRow,
} from '@/lib/money/expense-acceptance'

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
const NAMES = { client: 'Calder Manufacturing', employer: 'Techpeple' }

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
      'Techpeple will reimburse $240.00. Not billable until Calder Manufacturing agrees.'
    )
  })

  it('says who it is waiting on when only the client has agreed', () => {
    const g = gates(expense({ clientApprovedAt: NOW }), [], NAMES)
    expect(g.says).toBe('Calder Manufacturing agreed $240.00. Waiting on Techpeple to reimburse.')
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

// ── Accepted like a week (the founder, 2026-10-19) ───────────────────
//
// The employer approves an expense for reimbursement; each firm above
// accepts it before it pays it, the client first and then down the
// chain, nobody accepting their own. Northbend Athletic ← Computer
// Systems ← Techpeple, who employs Helena Marsh.

const helenaExpense = (over: Partial<ExpenseOnRecord> = {}): ExpenseOnRecord => ({
  id: 'ex1', companyId: 'techpeple', companyName: 'Techpeple', personId: 'helena', personName: 'Helena Marsh',
  category: 'TRAVEL', billable: true, status: 'APPROVED', totalCents: 41_250, currency: 'USD',
  periodStart: new Date('2026-10-12T00:00:00Z'), ...over,
})
const top: Leg = { sellContractId: 'cs-sell', sellerId: 'cs', sellerName: 'Computer Systems', payerId: 'northbend', payerName: 'Northbend Athletic', agreement: null }
const bottom: Leg = { sellContractId: 'tp-sell', sellerId: 'techpeple', sellerName: 'Techpeple', payerId: 'cs', payerName: 'Computer Systems', agreement: null }
const LEGS = [top, bottom]
const accepted = (companyId: string, cents: number): AcceptanceRow => ({ companyId, status: 'ACCEPTED', acceptedCents: cents, reason: null, createdAt: new Date('2026-10-14T00:00:00Z') })
const decide = (firm: { id: string; name: string }, over: Partial<Parameters<typeof mayDecide>[0]> = {}) =>
  mayDecide({ expense: helenaExpense(), legsTopFirst: LEGS, acceptances: [], firm, personId: 'someone', decision: 'ACCEPT', ...over })
const NB = { id: 'northbend', name: 'Northbend Athletic' }
const CSF = { id: 'cs', name: 'Computer Systems' }

describe('an expense is accepted by each firm that pays it, the client first', () => {
  it('the client accepts a worker’s expense before anyone bills it, and a rung below cannot accept first', () => {
    const early = decide(CSF)
    expect(early).toMatchObject({ ok: false, status: 409, code: 'ABOVE_FIRST' })
    expect((early as any).says).toBe('Northbend Athletic accepts Helena Marsh’s travel expense of Oct 12, 2026 first, then Computer Systems. It has not yet.')

    const client = decide(NB)
    expect(client).toMatchObject({ ok: true, row: { status: 'ACCEPTED', acceptedCents: 41_250 }, capCents: 41_250 })
    expect(waitingOn(acceptanceChain(helenaExpense(), LEGS), [])?.companyId).toBe('northbend')

    const after = decide(CSF, { acceptances: [accepted('northbend', 41_250)] })
    expect(after).toMatchObject({ ok: true, row: { status: 'ACCEPTED', acceptedCents: 41_250 } })
  })

  it('a firm never accepts its own expense', () => {
    const own = decide({ id: 'techpeple', name: 'Techpeple' })
    expect(own).toMatchObject({ ok: false, status: 403, code: 'OWN_EXPENSE' })
    expect((own as any).says).toMatch(/approving it was Techpeple agreeing to reimburse Helena Marsh\. The firms above accept it before they pay it, and Techpeple does not accept its own\.$/)
    // Nor the person who spent the money, wherever they sit.
    expect(decide(NB, { personId: 'helena' })).toMatchObject({ ok: false, code: 'OWN_EXPENSE' })
  })

  it('a firm that pays nobody for this expense has nothing to accept', () => {
    expect(decide({ id: 'elsewhere', name: 'Brightmoor' })).toMatchObject({ ok: false, status: 403, code: 'NOT_A_PAYER' })
  })

  it('an expense its employer has not approved is accepted by nobody above, and the sentence does not name the employer to the client', () => {
    const r = decide(NB, { expense: helenaExpense({ status: 'SUBMITTED' }) })
    expect(r).toMatchObject({ ok: false, code: 'NOT_APPROVED' })
    expect((r as any).says).not.toContain('Techpeple')
  })

  it('the client accepts up to the approved amount, and each firm below up to what the firm above accepted', () => {
    expect(decide(NB, { cents: 41_251 })).toMatchObject({ ok: false, code: 'OVER' })
    const cut = decide(NB, { cents: 38_000, reason: 'Hotel over the city rate.' })
    expect(cut).toMatchObject({ ok: true, row: { acceptedCents: 38_000, reason: 'Hotel over the city rate.' } })
    const below = decide(CSF, { acceptances: [accepted('northbend', 38_000)], cents: 41_250 })
    expect(below).toMatchObject({ ok: false, code: 'OVER' })
    expect((below as any).says).toContain('Northbend Athletic accepted $380.00')
    expect(capFor(helenaExpense(), acceptanceChain(helenaExpense(), LEGS), [accepted('northbend', 38_000)], 'cs')).toBe(38_000)
  })

  it('accepting less than was asked, or sending it back, needs a reason', () => {
    expect(decide(NB, { cents: 38_000 })).toMatchObject({ ok: false, code: 'REASON' })
    expect(decide(NB, { decision: 'SEND_BACK' })).toMatchObject({ ok: false, code: 'REASON' })
    expect(decide(NB, { decision: 'SEND_BACK', reason: 'No receipt for the hotel.' })).toMatchObject({ ok: true, row: { status: 'SENT_BACK', acceptedCents: 0 } })
  })

  it('an acceptance stands; a send-back can be followed by an accept; nothing below accepts what the firm above sent back', () => {
    expect(decide(NB, { acceptances: [accepted('northbend', 41_250)] })).toMatchObject({ ok: false, code: 'ALREADY_ACCEPTED' })
    const sentBack: AcceptanceRow = { companyId: 'northbend', status: 'SENT_BACK', acceptedCents: 0, reason: 'No receipt.', createdAt: new Date() }
    expect(decide(NB, { acceptances: [sentBack] })).toMatchObject({ ok: true })
    expect(decide(CSF, { acceptances: [sentBack] })).toMatchObject({ ok: false, code: 'ABOVE_SENT_BACK' })
  })

  it('where the client’s agreement does not make the kind billable, the firm under it accepts first and the client has nothing to accept', () => {
    const noTravel: Leg = { ...top, agreement: { id: 'msa', kinds: ['EQUIPMENT'], said: true, clientName: 'Northbend Athletic', vendorName: 'Computer Systems' } }
    const chain = acceptanceChain(helenaExpense(), [noTravel, bottom])
    expect(chain.steps.map((s) => s.companyId)).toEqual(['cs'])
    expect(chain.stopped?.says).toBe('The agreement between Northbend Athletic and Computer Systems does not list travel expenses as billable, so Northbend Athletic does not pay for this one.')
    expect(mayDecide({ expense: helenaExpense(), legsTopFirst: [noTravel, bottom], acceptances: [], firm: NB, personId: 'x', decision: 'ACCEPT' })).toMatchObject({ ok: false, code: 'NOT_BILLABLE' })
    expect(mayDecide({ expense: helenaExpense(), legsTopFirst: [noTravel, bottom], acceptances: [], firm: CSF, personId: 'x', decision: 'ACCEPT' })).toMatchObject({ ok: true, capCents: 41_250 })
  })

  it('which kinds are billable comes from the agreement where it says, and from the employer’s own flag only where it is silent', () => {
    const said = (kinds: string[]): Leg => ({ ...bottom, agreement: { id: 'm', kinds, said: true, clientName: 'Computer Systems', vendorName: 'Techpeple' } })
    expect(legBills({ category: 'TRAVEL', billable: false }, said(['TRAVEL'])).bills).toBe(true)
    expect(legBills({ category: 'TRAVEL', billable: true }, said([])).says).toBe('The agreement between Computer Systems and Techpeple makes no expense billable, so Computer Systems does not pay for this travel expense.')
    const silent: Leg = { ...bottom, agreement: { id: 'm', kinds: ['TRAVEL'], said: false, clientName: 'Computer Systems', vendorName: 'Techpeple' } }
    expect(legBills({ category: 'MEALS', billable: true }, silent).bills).toBe(true)
    expect(legBills({ category: 'TRAVEL', billable: false }, silent).bills).toBe(false)
  })
})
