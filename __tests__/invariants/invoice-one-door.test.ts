import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { payMethodFor, PAYMENT_METHODS } from '@/lib/money/pay-method'
import { sidesOffered, openCountSays } from '@/lib/money/invoice-parties'

/**
 * An AP clerk at Northbend Athletic, walked 2026-09-30.
 *
 * The invoice receipt's number opened a page with the three-way check
 * and no way to pay. A click beside it opened a side panel with Pay and
 * no check. The panel's method said Wire for a supplier set up for ACH;
 * the payment she had just made read "—" for its amount; the list opened
 * with an "Owed to us" switch for a client nobody owes; the page printed
 * 2026-09-01 where the list said Sep 1; and the AP page opened on a
 * paragraph of finance theory.
 */

const ROOT = join(__dirname, '..', '..', 'src')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const LIST = read('app/dashboard/invoices/page.tsx')
const DETAIL = read('app/dashboard/invoices/[id]/page.tsx')
const MONEY = read('app/dashboard/invoices/invoice-money.tsx')

describe('an invoice receipt has one detail, with the check and the pay form together', () => {
  it('a row on the list opens the invoice’s own page, never a side panel of its own', () => {
    expect(LIST).toContain('onRowClick={(row) => router.push(invoiceHref(row.id, whoseBooks)')
    expect(LIST).not.toMatch(/InvoiceDetailDrawer/)
    expect(LIST).not.toMatch(/Pay this invoice/)
  })

  it('the invoice page draws the pay form, after the check', () => {
    const check = DETAIL.indexOf('The verdict, before anything else')
    const pay = DETAIL.indexOf('<InvoiceMoney')
    expect(check).toBeGreaterThan(-1)
    expect(pay).toBeGreaterThan(check)
  })

  it('the invoice page prints days as a person reads them, never as 2026-09-01', () => {
    expect(DETAIL).toContain("from '@/lib/plain-date'")
    expect(DETAIL).not.toMatch(/\{inv\.(dueAt|periodStart|periodEnd)\}/)
    expect(DETAIL).not.toMatch(/inv\.status\.toLowerCase\(\)/)
  })
})

describe('the pay form opens on how the supplier is set up to be paid', () => {
  it('a supplier set up for ACH opens the form on ACH', () => {
    expect(payMethodFor('ACH')).toBe('ACH')
  })

  it('wire and check are read in the form’s own words', () => {
    expect(payMethodFor('WIRE')).toBe('Wire')
    expect(payMethodFor('CHECK')).toBe('Check')
  })

  it('a supplier with no method on file is asked about, never assumed to be paid by wire', () => {
    expect(payMethodFor(null)).toBeNull()
    expect(payMethodFor('')).toBeNull()
    expect(payMethodFor('CARRIER PIGEON')).toBeNull()
    expect(MONEY).not.toMatch(/useState<string>\('Wire'\)/)
    expect(MONEY).toContain('payMethodFor(coding?.remitTo?.paymentMethod)')
  })

  it('every method the form offers is one a remit-to line can name or the clerk can choose', () => {
    expect(PAYMENT_METHODS).toContain('ACH')
    expect(PAYMENT_METHODS[0]).toBe('ACH')
  })
})

describe('a payment just recorded reads back in full', () => {
  it('the new payment row takes its amount in minor units from the route, never a field the route does not send', () => {
    const route = read('app/api/invoices/[id]/payments/route.ts')
    expect(route).toMatch(/amountMinor: fromPrismaDecimal\(result\.amount/)
    expect(route).toMatch(/paidBy: result\.payerCompany\?\.name/)
    expect(MONEY).toContain('p.amountMinor')
  })

  it('a payment row says who paid whom, how, and the reference', () => {
    expect(MONEY).toContain('`${p.paidBy} paid ${p.paidTo}`')
    expect(MONEY).toContain('`by ${p.method}`')
    expect(MONEY).toContain('`reference ${p.reference}`')
  })
})

describe('the list opens on what the reader owes, and offers no side it does not have', () => {
  it('a client, who is never owed, is not offered an "Owed to us" side', () => {
    expect(sidesOffered({ receivable: 0, payable: 1 })).toEqual([])
  })

  it('a firm that both bills and pays is offered both sides', () => {
    expect(sidesOffered({ receivable: 1, payable: 1 })).toEqual(['RECEIVABLE', 'PAYABLE'])
  })

  it('the line under the list counts what is still open, not every row: one to pay and three paid', () => {
    const rows = [
      { outstandingMinor: 580_000, status: 'SUBMITTED' },
      { outstandingMinor: 0, status: 'PAID' },
      { outstandingMinor: 0, status: 'PAID' },
      { outstandingMinor: 0, status: 'PAID' },
    ]
    expect(openCountSays(rows, 'PAYABLE')).toBe('1 invoice receipt to pay · 3 paid')
    expect(openCountSays([{ outstandingMinor: 100, status: 'ISSUED' }, { outstandingMinor: 200, status: 'ISSUED' }], 'RECEIVABLE'))
      .toBe('2 bills to collect')
  })
})

describe('the accounts payable page opens on one plain line', () => {
  it('its opening line is one short sentence, not a paragraph of finance theory', () => {
    const ap = read('app/dashboard/ap/page.tsx')
    expect(ap).not.toMatch(/Float is your cash out/)
    expect(ap).toContain('What you owe, to whom, and when each one is due.')
  })
})

describe('money on an invoice is printed the way a person reads money', () => {
  it('the early-payment sentence prints dollars with their sign and separators, never "509.76 off 16992.00"', async () => {
    const { discountOn } = await import('@/lib/billing-cascade')
    const offer = discountOn({
      ladder: { rungs: [{ discountBps: 300, withinDays: 10 }], source: 'AGREEMENT', says: '' } as any,
      anchoredOn: new Date('2026-09-20T00:00:00Z'),
      payingOn: new Date('2026-09-25T00:00:00Z'),
      netMinor: 1_699_200,
      currency: 'USD',
    })
    expect(offer.says).toContain('$509.76 off $16,992.00 of work, so $16,482.24 settles it.')
    expect(offer.says).not.toMatch(/ 16992\.00/)
  })

  it('a match that clears one line says "1 line", and two say "2 lines", never "line(s)"', () => {
    const src = read('lib/three-way-match.ts')
    expect(src).not.toContain('line(s)')
    expect(src).not.toContain('exception(s)')
  })
})
