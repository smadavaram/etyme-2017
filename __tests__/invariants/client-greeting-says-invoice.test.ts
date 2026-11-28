import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { asReceived } from '@/app/api/conversations/twin/notices'
import { billNotice } from '@/lib/notify/bill-letter'

/**
 * The second screen walk, 2026-11-03: Northbend's AP clerk was greeted
 * with "Pinnacle Resourcing's bill IN_E5XIVH_004". What a firm issues
 * upward is a bill; what it receives from below is an invoice receipt,
 * and the supplier's own document in a sentence is "its invoice".
 */

describe('a client’s greeting calls what a supplier sent its invoice, never a bill', () => {
  it('a notice written before the fix reads “Pinnacle Resourcing’s invoice” in the client’s greeting', () => {
    expect(asReceived('INVOICE', 'Pinnacle Resourcing’s bill IN_E5XIVH_004: $4,508.00, due Dec 3, 2026'))
      .toBe('Pinnacle Resourcing’s invoice IN_E5XIVH_004: $4,508.00, due Dec 3, 2026')
    expect(asReceived('INVOICE', "Pinnacle Resourcing's bill IN-7 for Rajesh Iyer"))
      .toBe('Pinnacle Resourcing’s invoice IN-7 for Rajesh Iyer')
  })

  it('the body of such a notice says “who receives its invoices”', () => {
    expect(asReceived('INVOICE', 'Pinnacle recorded you as the person who receives its bills.'))
      .toBe('Pinnacle recorded you as the person who receives its invoices.')
  })

  it('what a supplier reads about its own bill keeps the word bill', () => {
    expect(asReceived('INVOICE', 'Northbend Athletic put bill IN-7 on hold')).toBe('Northbend Athletic put bill IN-7 on hold')
    expect(asReceived('SYSTEM', 'Pinnacle Resourcing’s bill IN-7')).toBe('Pinnacle Resourcing’s bill IN-7')
  })

  it('a notice written today already says the supplier’s invoice, so the greeting and the source agree', () => {
    const n = billNotice({
      supplierName: 'Pinnacle Resourcing', clientName: 'Northbend Athletic', number: 'IN-7', people: ['Rajesh Iyer'], hours: 40,
      total: 4508, currency: 'USD', dueAt: new Date('2026-12-03T00:00:00Z'), periodStart: new Date('2026-10-25T00:00:00Z'),
      periodEnd: new Date('2026-10-31T00:00:00Z'), weeks: 1, signedBy: 'Northbend Athletic', expenses: 0, milestones: 0,
    } as any)
    expect(n.title).toMatch(/^Pinnacle Resourcing’s invoice IN-7/)
    expect(asReceived('INVOICE', n.title)).toBe(n.title)
  })

  it('the greeting reads every notice’s title and body through that one reader', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/notices.ts'), 'utf8')
    expect(src).toContain('title: today?.title ?? asReceived(n.type, n.title)')
    expect(src).toContain("body: today?.body ?? (typeof n.body === 'string' ? asReceived(n.type, n.body) : null)")
  })
})
