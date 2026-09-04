/**
 * The journal behind the postings.
 *
 * Not a general ledger — no trial balance, no period close, no statutory
 * reporting. One canonical double-entry journal and a mapping per
 * accounting system, so that a client on SAP and a vendor on QuickBooks
 * read the same numbers through their own chart of accounts.
 *
 * The one rule is that debits equal credits, checked before writing
 * rather than reconciled afterwards. Reconciling afterwards means finding
 * out in March that February was wrong, by which time somebody has filed
 * something.
 */

import { describe, it, expect } from 'vitest'
import {
  entryFor, onInvoice, onReceipt, onPayment, balance, wellFormed, reverse,
  toExport, DEFAULT_ACCOUNTS, TYPICALLY, type Entry,
} from '@/lib/gl'

const AT = new Date('2019-03-31T00:00:00Z')

describe('Every entry balances, or it does not get written', () => {

  it('revenue earned debits an asset and credits income', () => {
    const e = entryFor({ kind: 'REVENUE', amountCents: 960_000, postedAt: AT, says: '160 hours approved' })
    expect(balance(e).balanced).toBe(true)
    expect(e.lines[0]).toMatchObject({ accountCode: '1150', debitCents: 960_000 })
    expect(e.lines[1]).toMatchObject({ accountCode: '4000', creditCents: 960_000 })
  })

  it('consultant pay debits the cost and credits what we owe them', () => {
    const e = entryFor({ kind: 'PAY', amountCents: -720_000, postedAt: AT, says: '160 hours accepted' })
    expect(balance(e).balanced).toBe(true)
    expect(e.lines.map((l) => l.accountCode).sort()).toEqual(['2150', '5000'])
  })

  it('every kind of posting produces a balanced entry', () => {
    const kinds = ['REVENUE', 'PAY', 'PREMIUM', 'BURDEN', 'EXPENSE',
      'COMMISSION', 'VISA', 'OVERHEAD', 'RESERVE', 'SETTLEMENT'] as const
    for (const kind of kinds) {
      const e = entryFor({ kind, amountCents: -100_000, postedAt: AT, says: kind })
      expect(balance(e).balanced, kind).toBe(true)
    }
  })

  it('says how far out it is rather than just refusing', () => {
    const wrong: Entry = {
      postedAt: AT, memo: 'wrong',
      lines: [
        { accountCode: '5000', debitCents: 100_000, creditCents: 0 },
        { accountCode: '2150', debitCents: 0, creditCents: 90_000 },
      ],
    }
    expect(balance(wrong).says).toBe(
      'Out by $100.00 — $1,000.00 debit against $900.00 credit. This will not be written.'
    )
  })

  it('refuses a line carrying both a debit and a credit', () => {
    const muddled: Entry = {
      postedAt: AT, memo: 'muddled',
      lines: [{ accountCode: '5000', debitCents: 100, creditCents: 100 }],
    }
    expect(wellFormed(muddled)).toContain(
      'Line 1 has both a debit and a credit. It has to be one or the other.'
    )
  })

  it('refuses a negative amount, because the other side exists for that', () => {
    const negative: Entry = {
      postedAt: AT, memo: 'negative',
      lines: [
        { accountCode: '5000', debitCents: -100, creditCents: 0 },
        { accountCode: '2150', debitCents: 0, creditCents: -100 },
      ],
    }
    expect(wellFormed(negative)[0]).toContain('negative amount')
  })
})

describe('A reserve is somebody else’s money, not this month’s cost', () => {

  it('credits a liability rather than reducing the expense', () => {
    // Held back from a consultant's share. It sits on the balance sheet
    // as something owed to them, which is what it is.
    const e = entryFor({ kind: 'RESERVE', amountCents: -72_000, postedAt: AT, says: 'held back' })
    expect(e.lines.map((l) => l.accountCode)).toContain('2300')
  })
})

describe('Earning, invoicing, collecting and paying are four separate facts', () => {

  it('earning revenue does not raise a receivable', () => {
    // Recognising straight into AR would report a debt the client has
    // never been told about.
    const e = entryFor({ kind: 'REVENUE', amountCents: 960_000, postedAt: AT, says: 'earned' })
    expect(e.lines.map((l) => l.accountCode)).not.toContain('1100')
  })

  it('invoicing moves it from unbilled to owed, without touching margin', () => {
    const e = onInvoice(960_000, AT, 'INV-1042')
    expect(balance(e).balanced).toBe(true)
    expect(e.lines[0]).toMatchObject({ accountCode: '1100', debitCents: 960_000 })
    expect(e.lines[1]).toMatchObject({ accountCode: '1150', creditCents: 960_000 })
  })

  it('collecting cash clears the receivable and changes no margin at all', () => {
    const e = onReceipt(960_000, AT, 'INV-1042')
    expect(e.lines.map((l) => l.accountCode)).toEqual(['1200', '1100'])
    expect(balance(e).balanced).toBe(true)
  })

  it('paying a consultant clears the wages we owed, not the cost we booked', () => {
    const e = onPayment(720_000, AT, 'March payroll', '2150')
    expect(e.lines[0]).toMatchObject({ accountCode: '2150', debitCents: 720_000 })
    expect(e.lines[1]).toMatchObject({ accountCode: '1200', creditCents: 720_000 })
  })
})

describe('A correction is another entry, in the period it belonged to', () => {

  it('swaps every side', () => {
    const e = entryFor({ kind: 'PAY', amountCents: -720_000, postedAt: AT, says: 'wrong rate' })
    const r = reverse(e, 'wrong rate')
    expect(r.lines[0].creditCents).toBe(e.lines[0].debitCents)
    expect(balance(r).balanced).toBe(true)
  })

  it('keeps the original date, not the date somebody noticed', () => {
    const e = entryFor({ kind: 'PAY', amountCents: -720_000, postedAt: AT, says: 'wrong rate' })
    expect(reverse(e, 'spotted in June').postedAt).toEqual(AT)
  })

  it('says what it reverses and why', () => {
    const e = entryFor({ kind: 'PAY', amountCents: -720_000, postedAt: AT, says: '160 hours accepted' })
    expect(reverse(e, 'client rejected 8 hours').memo).toBe(
      'Reverses: 160 hours accepted — client rejected 8 hours'
    )
  })
})

describe('The same journal reads into anybody’s accounting system', () => {

  const sap = { '1150': { account: '0001150000', costObject: 'IO-4711' },
                '4000': { account: '0004000000', costObject: 'IO-4711' } }

  it('exports through the mapping, not through our own codes', () => {
    const e = entryFor({ kind: 'REVENUE', amountCents: 960_000, postedAt: AT, says: 'earned' })
    const out = toExport(e, 'SAP', sap, 'USD', 'INV-1042')
    expect(out.rows.map((r) => r.account)).toEqual(['0001150000', '0004000000'])
    expect(out.rows[0].debit).toBe('9600.00')
    expect(out.rows[1].credit).toBe('9600.00')
  })

  it('carries the client’s own cost object onto every line their system needs it on', () => {
    const e = entryFor({ kind: 'REVENUE', amountCents: 960_000, postedAt: AT, says: 'earned' })
    expect(toExport(e, 'SAP', sap, 'USD').rows.every((r) => r.costObject === 'IO-4711')).toBe(true)
  })

  it('refuses on an unmapped account rather than putting it in a suspense line', () => {
    // A suspense line is a line somebody chases in a month, and they
    // chase it in our direction.
    const e = entryFor({ kind: 'PAY', amountCents: -720_000, postedAt: AT, says: 'pay' })
    const out = toExport(e, 'SAP', sap, 'USD')
    expect(out.rows).toHaveLength(0)
    expect(out.unmapped.sort()).toEqual(['2150', '5000'])
  })

  it('knows which side of the market runs which system', () => {
    // A client on SAP will not adopt our chart of accounts, and a
    // two-person vendor on QuickBooks has no chart to adopt. The mapping
    // goes to them either way.
    expect(TYPICALLY.SAP).toBe('CLIENT')
    expect(TYPICALLY.QUICKBOOKS).toBe('VENDOR')
    expect(TYPICALLY.CSV).toBe('EITHER')
  })
})

describe('The starting chart of accounts is small enough to read', () => {

  it('has one code per thing that actually happens in a staffing firm', () => {
    expect(DEFAULT_ACCOUNTS.length).toBeLessThanOrEqual(20)
  })

  it('has no duplicate codes', () => {
    const codes = DEFAULT_ACCOUNTS.map((a) => a.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('every account an entry can reach is in it', () => {
    const known = new Set(DEFAULT_ACCOUNTS.map((a) => a.code))
    const kinds = ['REVENUE', 'PAY', 'PREMIUM', 'BURDEN', 'EXPENSE',
      'COMMISSION', 'VISA', 'OVERHEAD', 'RESERVE', 'SETTLEMENT'] as const
    for (const kind of kinds) {
      for (const l of entryFor({ kind, amountCents: -1, postedAt: AT, says: '' }).lines) {
        expect(known.has(l.accountCode), `${kind} → ${l.accountCode}`).toBe(true)
      }
    }
    for (const e of [onInvoice(1, AT, 'x'), onReceipt(1, AT, 'x'), onPayment(1, AT, 'x')]) {
      for (const l of e.lines) expect(known.has(l.accountCode)).toBe(true)
    }
  })

  it('assets and expenses increase on the debit side, income on the credit', () => {
    for (const a of DEFAULT_ACCOUNTS) {
      const expected = a.type === 'ASSET' || a.type === 'EXPENSE' ? 'DEBIT' : 'CREDIT'
      expect(a.normalSide, a.name).toBe(expected)
    }
  })
})
