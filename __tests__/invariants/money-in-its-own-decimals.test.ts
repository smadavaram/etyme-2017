import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { check, type Expense, type Policy } from '@/lib/expense-approval'
import { remittanceAdvice, type RunLine } from '@/lib/ap-delay'
import { toExport } from '@/lib/gl'
import { spreadOn } from '@/lib/money/placement-margin'
import { billRateMinor, payRateMinor, contractorName, CORVANE_NAME } from '@/lib/seed-corvane/plan'

/**
 * "₫170.00" (the screen walk, 2026-11-03): an amount shown with cents a
 * currency does not have. The one formatter was fixed then; these are the
 * money sentences that still divided every currency by a hundred and
 * printed two decimals, found on 2026-11-08. A yen or a dong has no minor
 * unit, so 3,800,000 dong is 3,800,000, never 38,000.00.
 *
 * The dong figures are read from the seed: Corvane Packaging bills a
 * specialist in Vietnam at the seed's own hourly rate, and the expense
 * below is four of those hours, a hotel night on the trip.
 */

const VND_HOUR = billRateMinor('VN')
const VND_PAY = payRateMinor('VN')
const HOTEL = VND_HOUR * 4
const dong = (n: number) => n.toLocaleString('en-US')
const WORKER = contractorName('VN', 0)

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1', personName: WORKER, category: 'Travel', amountCents: HOTEL, currency: 'VND',
  spentOn: new Date('2026-11-01T00:00:00Z'), description: 'Hotel', hasReceipt: false, state: 'SUBMITTED',
  clientApprovedAt: null, agreedAt: null, agreedCents: null, returnedNote: null, ...over,
})
const POLICY: Policy = { limitCents: 1_000_000, receiptRequired: false, receiptAboveCents: 500_000, allowed: [] }

describe('every money sentence shows the decimals its currency has', () => {
  it('an expense in dong over its limit names the amounts in whole dong, never with cents', () => {
    const said = check(expense(), POLICY, new Date('2026-11-02T00:00:00Z')).map((c) => c.says ?? '').join(' ')
    expect(HOTEL).toBeGreaterThan(POLICY.limitCents ?? 0)
    expect(said).toContain(dong(HOTEL))
    expect(said).not.toContain(dong(HOTEL / 100))
    expect(said).not.toMatch(/\d\.00\b/)
  })

  it('an expense in dollars still reads its cents', () => {
    const said = check(expense({ currency: 'USD', amountCents: 1_250_050 }), POLICY, new Date('2026-11-02T00:00:00Z')).map((c) => c.says ?? '').join(' ')
    expect(said).toContain('$12,500.50')
  })

  it('a remittance advice in yen lists each invoice receipt and the total in whole yen', () => {
    const lines: RunLine[] = [{
      billId: 'b1', billNumber: 'TK-1', vendorCompanyId: 'v', vendorName: 'Tokai Systems',
      amountCents: 450_000, dueAt: new Date('2026-11-20T00:00:00Z'),
    } as RunLine]
    const [advice] = remittanceAdvice({ currency: 'JPY', scheduledFor: new Date('2026-11-20T00:00:00Z'), lines }, 'Northbend Athletic')
    expect(advice.text).toContain('JPY 450,000')
    expect(advice.text).not.toContain('4,500.00')
  })

  it('a journal export in yen carries whole yen, so the accounting system books the right amount', () => {
    const out = toExport(
      { postedAt: new Date('2026-11-08T00:00:00Z'), memo: 'Bill', lines: [{ accountCode: 'AR', debitCents: 450_000, creditCents: 0 }, { accountCode: 'REV', debitCents: 0, creditCents: 450_000 }] },
      'CSV', { AR: { account: '1100' }, REV: { account: '4000' } }, 'JPY',
    )
    expect(out.rows[0].debit).toBe('450000')
    expect(out.rows[1].credit).toBe('450000')
  })

  it('a journal export in dollars still carries two decimals', () => {
    const out = toExport(
      { postedAt: new Date('2026-11-08T00:00:00Z'), memo: 'Bill', lines: [{ accountCode: 'AR', debitCents: 450_050, creditCents: 0 }] },
      'CSV', { AR: { account: '1100' } }, 'USD',
    )
    expect(out.rows[0].debit).toBe('4500.50')
  })

  it('a placement billed in dong says its rates in whole dong an hour', () => {
    const s = spreadOn({
      sell: { id: 's', billRateCents: VND_HOUR, billCurrency: 'VND', state: 'IN_PROGRESS', personId: 'p', personName: WORKER, clientId: 'c', clientName: CORVANE_NAME, masterContractId: null },
      buy: { id: 'b', payRateCents: VND_PAY, payCurrency: 'VND', contractType: 'W2', state: 'IN_PROGRESS', vendorName: null, masterContractId: null },
    })
    expect(s.says).toContain(dong(VND_HOUR))
    expect(s.says).toContain(dong(VND_PAY))
    expect(s.says).not.toContain(dong(VND_HOUR / 100))
  })

  it('the statutory and settlement sentences format through the one formatter, never by a hundred', () => {
    for (const f of ['src/app/api/payroll/statutory/route.ts', 'src/app/api/profitability/settle/route.ts']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/\/ 100\)\.(toFixed|toLocaleString)/)
    }
  })
})

