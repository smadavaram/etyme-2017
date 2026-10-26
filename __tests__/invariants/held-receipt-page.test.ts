import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { receiptPayPanel, type ReceiptPanelLine } from '@/lib/money/receipt-pay-panel'
import { payGate } from '@/lib/invoice-match'

/**
 * An invoice receipt's own page offers Pay only where the payment route
 * would pay it (second production walk, 2026-10-26: PR-2026-0442 drew
 * "Pay $4,067.00" over 41.5 hours billed against 40 signed, and the route
 * answered 409). The page reads the route's own gate.
 */

const lucia: ReceiptPanelLine = {
  kind: 'HOURS', personName: 'Lucía Fernández',
  periodStart: '2026-10-04', periodEnd: '2026-10-10', hoursBilled: 41.5, hoursSigned: 40,
}
const fail = (code: string, overridable: boolean) => ({ code, outcome: 'FAIL', overridable })
const pass = (code: string) => ({ code, outcome: 'PASS', overridable: true })

function held(checks: ReturnType<typeof fail>[], lines: ReceiptPanelLine[] = [lucia]) {
  return {
    direction: 'PAYABLE' as const,
    invoice: { number: 'PR-2026-0442', status: 'SUBMITTED' },
    match: { matched: false, summary: '41.5 hours billed, 40 approved', checks, lines },
    supplierName: 'Pinnacle Resourcing',
  }
}

describe('an invoice receipt’s own page offers Pay only where the payment route would pay it', () => {
  it('a receipt that bills 41.5 hours against 40 signed is held on its own page, with the hours and the way forward, and offers no Pay', () => {
    const p = receiptPayPanel(held([fail('QUANTITY', true), pass('PRICE')]))
    expect(p.kind).toBe('HELD')
    if (p.kind !== 'HELD') return
    expect(p.headline).toBe('Held: hours don’t match')
    expect(p.hours.map((h) => h.says)).toEqual(['Lucía Fernández, Oct 4 – Oct 10, 2026: 41.5 hours billed, 40 signed.'])
    expect(p.wayForward).toEqual([
      'Ask Pinnacle Resourcing to correct it and send it again.',
      'Or record an exception with a reason under the check below, and it can be paid.',
    ])
  })

  it('a held receipt whose difference may not be waived, a rate, offers only the supplier’s correction', () => {
    const p = receiptPayPanel(held([fail('PRICE', false)]))
    expect(p.kind).toBe('HELD')
    if (p.kind !== 'HELD') return
    expect(p.headline).toBe('Held: rate doesn’t match')
    expect(p.wayForward).toEqual(['It can be paid once Pinnacle Resourcing corrects it and sends it again.'])
  })

  it('a receipt for a week nobody signed can be paid once every week on it is signed and accepted, and its hours say none signed', () => {
    const p = receiptPayPanel(held([fail('RECEIPT', false)], [{ ...lucia, hoursSigned: null }]))
    expect(p.kind).toBe('HELD')
    if (p.kind !== 'HELD') return
    expect(p.wayForward).toEqual(['It can be paid once every week on it is signed and accepted.'])
    expect(p.hours[0].says).toBe('Lucía Fernández, Oct 4 – Oct 10, 2026: 41.5 hours billed, none signed.')
  })

  it('a receipt whose check could not be run is held, never paid on the check’s say-so', () => {
    const p = receiptPayPanel({ ...held([]), match: null })
    expect(p.kind).toBe('HELD')
  })

  it('a receipt the payer put on hold says to lift the hold first, and offers no Pay', () => {
    const p = receiptPayPanel({ ...held([]), invoice: { number: 'PR-2026-0442', status: 'HELD' } })
    expect(p.kind).toBe('HELD')
    if (p.kind !== 'HELD') return
    expect(p.wayForward).toEqual(['Lift the hold on this page first, then pay it.'])
  })

  it('a receipt that passes the check, or passes with an exception recorded, draws Pay', () => {
    const clean = { ...held([]), match: { matched: true, summary: 'Matches', checks: [pass('QUANTITY')], lines: [] } }
    expect(receiptPayPanel(clean).kind).toBe('PAY')
    const waived = { ...clean, match: { ...clean.match, checks: [{ code: 'QUANTITY', outcome: 'OVERRIDDEN', overridable: true }] } }
    expect(receiptPayPanel(waived).kind).toBe('PAY')
  })

  it('a receipt the supplier has not submitted draws no Pay and says not yet', () => {
    expect(receiptPayPanel({ ...held([]), invoice: { number: 'PR-1', status: 'ISSUED' } }).kind).toBe('NOT_SUBMITTED')
    expect(receiptPayPanel({ ...held([]), invoice: { number: 'PR-1', status: 'DRAFT' } }).kind).toBe('NOT_SUBMITTED')
  })

  it('a paid or cancelled receipt draws no Pay', () => {
    expect(receiptPayPanel({ ...held([]), invoice: { number: 'PR-1', status: 'PAID' } }).kind).toBe('CLOSED')
    expect(receiptPayPanel({ ...held([]), invoice: { number: 'PR-1', status: 'CANCELLED' } }).kind).toBe('CLOSED')
  })

  it('a firm recording money in on its own bill is not held by the check, because the payment route does not hold it', () => {
    expect(receiptPayPanel({ ...held([fail('QUANTITY', true)]), direction: 'RECEIVABLE' }).kind).toBe('PAY')
  })

  it('wherever the page says Pay to a payer, the payment route’s own gate says yes, and nowhere else', () => {
    const statuses = ['DRAFT', 'ISSUED', 'SUBMITTED', 'PARTIALLY_PAID', 'HELD', 'PAID', 'CANCELLED', 'VOID']
    const matches = [
      null,
      { matched: true, summary: 'ok', checks: [], lines: [] },
      { matched: false, summary: 'hours', checks: [fail('QUANTITY', true)], lines: [lucia] },
    ]
    for (const status of statuses) for (const match of matches) {
      const inv = { number: 'PR-1', status }
      const panel = receiptPayPanel({ direction: 'PAYABLE', invoice: inv, match, supplierName: 'Pinnacle' })
      expect(panel.kind === 'PAY', `${status} / ${match?.summary ?? 'no check'}`).toBe(payGate(inv, match).ok)
    }
  })

  it('the invoice page draws the Pay form and the desk’s sentence only where the route’s gate says Pay', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/dashboard/invoices/invoice-money.tsx'), 'utf8')
    expect(src).toMatch(/const gateSaysPay = payPanel\.kind === 'PAY'/)
    const forms = src.match(/\{outstanding > 0 && !notSubmitted && [^\n]*desk\.mayPay[^\n]*&& \($/gm) ?? []
    expect(forms.length).toBe(2)
    for (const f of forms) expect(f).toContain('gateSaysPay')
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/invoices/[id]/page.tsx'), 'utf8')
    expect(page).toContain('payPanel={data.payPanel}')
  })
})
