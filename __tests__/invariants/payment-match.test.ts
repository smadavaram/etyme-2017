import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  judgeBill, judgeUnplaced, driftOf, shortPayWords, overPayWords, currencyWords, noBillWords, manyBillsWords, driftWords,
  type OpenBill,
} from '@/lib/money/payment-match'
import { pickOwner } from '@/lib/money/agent-owners'
import type { FirmSeat } from '@/lib/decision-items'

const bill = { id: 'b1', number: 'INV-1', minor: 100_000, currency: 'USD' }
const pay = (id: string, minor: number, currency = 'USD') => ({ id, minor, currency })
const open = (id: string, owedMinor: number, currency = 'USD'): OpenBill => ({ id, number: id.toUpperCase(), minor: owedMinor, currency, owedMinor })

describe('a payment read against its bill', () => {
  it('a payment of exactly the bill, in the bill’s currency, is a match', () => {
    expect(judgeBill(bill, [pay('p1', 100_000)])).toEqual([{ kind: 'MATCHED', paidMinor: 100_000 }])
  })
  it('two payments that add up to the bill to the cent are a match', () => {
    expect(judgeBill(bill, [pay('p1', 60_000), pay('p2', 40_000)])).toEqual([{ kind: 'MATCHED', paidMinor: 100_000 }])
  })
  it('a payment one cent short is a short pay with both figures', () => {
    expect(judgeBill(bill, [pay('p1', 99_999)])).toEqual([{ kind: 'SHORT', paidMinor: 99_999, owedMinor: 100_000 }])
  })
  it('a payment one cent over is an overpay with both figures', () => {
    expect(judgeBill(bill, [pay('p1', 100_001)])).toEqual([{ kind: 'OVER', paidMinor: 100_001, owedMinor: 100_000 }])
  })
  it('a payment in another currency is never added to the bill’s payments, and never converted', () => {
    const out = judgeBill(bill, [pay('p1', 100_000, 'INR')])
    expect(out).toEqual([{ kind: 'CURRENCY', payment: pay('p1', 100_000, 'INR') }])
    const mixed = judgeBill(bill, [pay('p1', 60_000), pay('p2', 40_000, 'EUR')])
    expect(mixed.map((v) => v.kind).sort()).toEqual(['CURRENCY', 'SHORT'])
  })
})

describe('a payment nobody placed, read against the bills still owed', () => {
  it('one bill owed exactly that amount is a match', () => {
    expect(judgeUnplaced(pay('p', 5_000), [open('a', 5_000), open('b', 7_000)])).toMatchObject({ kind: 'MATCHED', bill: { id: 'a' } })
  })
  it('a payment that matches no bill is a payment with no bill', () => {
    expect(judgeUnplaced(pay('p', 5_001), [open('a', 5_000)])).toEqual({ kind: 'NO_BILL' })
    expect(judgeUnplaced(pay('p', 5_000), [])).toEqual({ kind: 'NO_BILL' })
  })
  it('two bills owed the same amount are never chosen between', () => {
    expect(judgeUnplaced(pay('p', 5_000), [open('a', 5_000), open('b', 5_000)]).kind).toBe('MANY_BILLS')
  })
  it('a bill owed the same number in another currency is a currency finding, never a match', () => {
    expect(judgeUnplaced(pay('p', 5_000, 'EUR'), [open('a', 5_000, 'USD')])).toMatchObject({ kind: 'CURRENCY' })
  })
})

describe('a bill’s rate read against its contract line’s', () => {
  const base = { lineRateCents: 10_500, lineCurrency: 'USD', contractRateCents: 10_000, contractCurrency: 'USD', hasAmendments: false }
  it('a bill whose rate differs from its contract line is drift, with both rates', () => {
    expect(driftOf(base)).toEqual({ lineRateCents: 10_500, contractRateCents: 10_000, currency: 'USD' })
  })
  it('a bill at the contract’s rate is not drift', () => {
    expect(driftOf({ ...base, lineRateCents: 10_000 })).toBeNull()
  })
  it('a contract with approved rate changes is not judged here, so nothing is flagged on a guess', () => {
    expect(driftOf({ ...base, hasAmendments: true })).toBeNull()
  })
  it('two currencies are never compared for drift', () => {
    expect(driftOf({ ...base, contractCurrency: 'EUR' })).toBeNull()
  })
})

describe('what a decision card says', () => {
  it('a short pay says the bill, what was paid, and how much is short, in the bill’s currency', () => {
    const f = shortPayWords(bill, { paidMinor: 90_000, owedMinor: 100_000 })
    expect(f.question).toBe('Bill INV-1 was paid $900.00 of $1,000.00. Accept the short pay?')
    expect(f.proof).toMatch(/\$1,000\.00.*\$900\.00.*\$100\.00 short.*moved nothing/)
  })
  it('an overpay and a currency mismatch each say both figures', () => {
    expect(overPayWords(bill, { paidMinor: 110_000, owedMinor: 100_000 }).proof).toMatch(/\$1,100\.00.*\$100\.00 more/)
    expect(currencyWords(bill, pay('p', 100_000, 'EUR')).proof).toMatch(/different currencies, so nothing was compared or converted/)
  })
  it('a payment with no bill and one that fits two bills each say so and name the figure', () => {
    expect(noBillWords(pay('p', 5_000)).question).toBe('A payment of $50.00 matches no bill. Place it by hand?')
    expect(manyBillsWords(pay('p', 5_000), [open('a', 5_000), open('b', 5_000)]).proof).toMatch(/bill A, bill B.*will not choose/)
  })
  it('drift says both rates and who it is for', () => {
    expect(driftWords({ number: 'INV-1' }, 'Ana Rao', { lineRateCents: 10_500, contractRateCents: 10_000, currency: 'USD' }).question)
      .toBe('Bill INV-1 charges Ana Rao $105.00 an hour and the contract says $100.00. Is the bill wrong?')
  })
})

describe('who owes a decision the agent opens about money', () => {
  const seat = (personId: string, roleName: string): FirmSeat => ({
    contextId: `c-${personId}`, personId, type: 'EMPLOYEE', roleName, companyId: 'co', expiresAt: null, isOwner: roleName === 'Owner',
    rolePermissions: [], revokedAt: null, suspendedAt: null, hasSignedIn: true,
  })
  const seats = [seat('p-owner', 'Owner'), seat('p-ap', 'AP & Payroll'), seat('p-ar', 'Accounts Receivable')]
  it('receivables go to the Accounts Receivable seat where there is one, else Finance, else the Owner', () => {
    expect(pickOwner(seats, ['Accounts Receivable', 'Finance'], new Date())).toBe('p-ar')
    expect(pickOwner(seats.filter((s) => s.roleName !== 'Accounts Receivable'), ['Accounts Receivable', 'Finance'], new Date())).toBe('p-owner')
  })
  it('payroll goes to AP & Payroll, else the Owner, and nobody where neither has a working seat', () => {
    expect(pickOwner(seats, ['AP & Payroll'], new Date())).toBe('p-ap')
    expect(pickOwner([seat('p-owner', 'Owner')], ['AP & Payroll'], new Date())).toBe('p-owner')
    expect(pickOwner([{ ...seat('p-ap', 'AP & Payroll'), revokedAt: new Date() }], ['AP & Payroll'], new Date())).toBeNull()
  })
})

describe('what the reconciliation agent is built never to do', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/agents/reconciliation.ts'), 'utf8')
  it('the reconciliation agent sends nothing: no mail door, no task, no message', () => {
    expect(src).not.toMatch(/mail-door|sendMail|proposeTask|mayAgentSend|noteSent/)
  })
  it('the reconciliation agent never moves a month past “paid, not confirmed”, so it never closes one', () => {
    expect(src).toContain("to: 'PAID_UNCONFIRMED'")
    expect(src).not.toContain('CONFIRMED_CLOSED')
  })
  it('the reconciliation agent never writes a payment, a bill or a payroll row', () => {
    expect(src).not.toMatch(/\.(payment|invoice|invoiceLine|payrollDraft)\.(create|update|updateMany|delete|upsert)/)
  })
})
