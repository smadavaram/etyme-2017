/**
 * Disputes and credit notes.
 *
 * A short payment is a client deciding not to pay part of an invoice. A
 * credit note is us agreeing with them. Same argument, two stages — which
 * is why they belong in one view, and why chasing one while the other is
 * agreed is the fastest way to lose an account.
 */

import { describe, it, expect } from 'vitest'
import {
  checkCreditNote, creditsByInvoice, netOfCredits, disputesView,
  ageInvoice, settlementOf, type ArInvoice, type AppliedCredit,
} from '@/lib/ar-ageing'
import { entryFor, onInvoice, onCreditNote, balance, wellFormed } from '@/lib/gl'

const NOW = new Date('2026-08-29T00:00:00Z')

function inv(over: Partial<ArInvoice> = {}): ArInvoice {
  return {
    id: 'inv-1',
    number: 'IN_ABC_001',
    currency: 'USD',
    totalMinor: 1_000_000,
    paidMinor: 0,
    dueAt: new Date('2026-07-30T00:00:00Z'),
    customerId: 'c-nike',
    customerName: 'Nike Inc',
    ...over,
  }
}

describe('A reason a director can add up', () => {
  it('a credit note must carry a reason code from the list, not free text', () => {
    const v = checkCreditNote({
      reasonCode: 'they moaned about it',
      amountMinor: 10_000,
      invoiceTotalMinor: 1_000_000,
      alreadyCreditedMinor: 0,
    })
    expect(v.ok).toBe(false)
    expect(v.problems[0]).toContain('how much did we credit last quarter')
  })

  it('a credit note reason of other refuses to be saved without a sentence saying why', () => {
    const bare = checkCreditNote({
      reasonCode: 'OTHER_SAY_WHY',
      note: null,
      amountMinor: 10_000,
      invoiceTotalMinor: 1_000_000,
      alreadyCreditedMinor: 0,
    })
    expect(bare.ok).toBe(false)
    expect(bare.problems[0]).toContain('free-text field back again')

    const said = checkCreditNote({
      reasonCode: 'OTHER_SAY_WHY',
      note: 'Agreed with Priya to drop the travel line pending the new expense policy.',
      amountMinor: 10_000,
      invoiceTotalMinor: 1_000_000,
      alreadyCreditedMinor: 0,
    })
    expect(said.ok).toBe(true)
  })

  it('a credit note cannot exceed the invoice it credits', () => {
    const v = checkCreditNote({
      reasonCode: 'GOODWILL',
      amountMinor: 1_200_000,
      invoiceTotalMinor: 1_000_000,
      alreadyCreditedMinor: 0,
    })
    expect(v.ok).toBe(false)
    expect(v.problems[0]).toContain('refund')
  })

  it('a second credit note counts what the first one already took', () => {
    const v = checkCreditNote({
      reasonCode: 'HOURS_DISPUTED',
      amountMinor: 400_000,
      invoiceTotalMinor: 1_000_000,
      alreadyCreditedMinor: 700_000,
    })
    expect(v.ok).toBe(false)
    expect(v.problems[0]).toContain('3,000.00')
  })
})

describe('A credit reduces the debt only once it is posted', () => {
  const credits: AppliedCredit[] = [
    { invoiceId: 'inv-1', amountMinor: 250_000, currency: 'USD', reasonCode: 'RATE_WRONG', appliedAt: NOW },
    { invoiceId: 'inv-1', amountMinor: 100_000, currency: 'USD', reasonCode: 'GOODWILL', appliedAt: null },
  ]

  it('an applied credit note reduces what the invoice is owed everywhere the receivable is counted', () => {
    const byInvoice = creditsByInvoice(credits)
    const net = netOfCredits(inv(), byInvoice.get('inv-1') ?? 0)
    expect(net.totalMinor).toBe(750_000)
    expect(settlementOf(net).outstandingMinor).toBe(750_000)
  })

  it('an unapplied credit note is shown but does not yet reduce the debt', () => {
    const byInvoice = creditsByInvoice(credits)
    // Only the 250,000 that was actually posted.
    expect(byInvoice.get('inv-1')).toBe(250_000)
  })

  it('a credit is a reduction of the invoice and never an addition to what was paid', () => {
    // The client has not paid the credited part — we have agreed they
    // never will. Adding it to `paid` would report cash that never came.
    const net = netOfCredits(inv({ paidMinor: 0 }), 250_000)
    expect(net.paidMinor).toBe(0)
    expect(net.totalMinor).toBe(750_000)
  })

  it('a fully credited invoice ages as settled rather than as arrears', () => {
    const net = netOfCredits(inv(), 1_000_000)
    const aged = ageInvoice(net, NOW)
    expect(aged.outstandingMinor).toBe(0)
    expect(aged.settlement).toBe('SETTLED')
  })
})

describe('The journal side', () => {
  it('a credit note posts into the period the invoice belonged to, not the period somebody noticed', () => {
    const billed = new Date('2026-03-31T00:00:00Z')
    const e = onCreditNote(250_000, billed, 'IN_ABC_001', 'RATE_WRONG')
    expect(e.postedAt).toEqual(billed)
  })

  it('a credit note gives up revenue and reduces the receivable, and never touches cash', () => {
    const billed = new Date('2026-03-31T00:00:00Z')
    const credited = onCreditNote(250_000, billed, 'IN_ABC_001', 'RATE_WRONG')

    expect(balance(credited).balanced).toBe(true)
    expect(wellFormed(credited)).toEqual([])

    const accounts = credited.lines.map((l) => l.accountCode).sort()
    expect(accounts).toEqual(['1100', '4000'])
    // Crediting a client is not a payment to them. No money moves.
    expect(accounts).not.toContain('1200')
    expect(credited.lines.find((l) => l.accountCode === '1100')!.creditCents).toBe(250_000)
    expect(credited.lines.find((l) => l.accountCode === '4000')!.debitCents).toBe(250_000)
  })

  it('the receivable a credit note reduces is the one the invoice raised', () => {
    const billed = new Date('2026-03-31T00:00:00Z')
    const raised = onInvoice(250_000, billed, 'IN_ABC_001')
    const credited = onCreditNote(250_000, billed, 'IN_ABC_001', 'RATE_WRONG')
    const arRaised = raised.lines.find((l) => l.accountCode === '1100')!
    const arCleared = credited.lines.find((l) => l.accountCode === '1100')!
    expect(arRaised.debitCents).toBe(arCleared.creditCents)
  })

  it('a revenue posting and its reversal net to nothing in the journal', () => {
    const e = entryFor({
      kind: 'REVENUE', amountCents: 100_000,
      postedAt: NOW, says: 'Hours approved',
    })
    expect(balance(e).balanced).toBe(true)
  })
})

describe('One view for the same argument', () => {
  it('short payments and credit notes appear in one disputes view, because they are the same argument', () => {
    const shortPaid = [ageInvoice(inv({ totalMinor: 1_000_000, paidMinor: 980_000 }), NOW)]
    expect(shortPaid[0].disputed).toBe(true)

    const rows = disputesView(
      shortPaid,
      [
        {
          invoiceId: 'inv-2', invoiceNumber: 'IN_ABC_002', customerName: 'Nike Inc',
          currency: 'USD', amountMinor: 300_000, reasonCode: 'HOURS_DISPUTED',
          appliedAt: NOW, issuedAt: new Date('2026-08-01T00:00:00Z'),
        },
      ],
      NOW
    )

    expect(rows).toHaveLength(2)
    expect(rows[0].kind).toBe('CREDIT_NOTE')
    expect(rows[0].amountMinor).toBe(300_000)
    expect(rows[1].kind).toBe('SHORT_PAID')
    expect(rows[1].reasonCode).toBeNull()
    expect(rows[1].says).toContain('Nobody has said why yet')
  })

  it('an issued but unposted credit note says in the view that it does not reduce the debt yet', () => {
    const rows = disputesView(
      [],
      [
        {
          invoiceId: 'inv-2', invoiceNumber: 'IN_ABC_002', customerName: 'Nike Inc',
          currency: 'USD', amountMinor: 100_000, reasonCode: 'GOODWILL',
          appliedAt: null, issuedAt: new Date('2026-08-25T00:00:00Z'),
        },
      ],
      NOW
    )
    expect(rows[0].says).toContain('does not reduce the debt yet')
    expect(rows[0].ageDays).toBe(4)
  })
})
