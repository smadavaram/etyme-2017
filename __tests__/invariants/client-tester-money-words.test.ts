/**
 * A client tester's walk, 2026-10-03, on commit e80773ab9 — the money
 * screens in the reader's words.
 *
 * The AP clerk at Northbend Athletic was sent to "Open Invoices, under
 * 'We owe'" when her menu says Invoice receipts and offers no such
 * switch; read "chain float"; read "Due 2026-10-15" under a header that
 * said Oct 15, 2026; and read "All 1 lines". Brightmoor's AR clerk was
 * refused a bill in a sentence that did not say whose week was waiting.
 * And the compliance officer read "Next: bill to raise" on a placement
 * where Northbend raises nothing — its supplier bills it.
 */

import { describe, it, expect } from 'vitest'
import { receiptsLink, RECEIPTS_ONLY_NOTE } from '@/lib/money/ap-words'
import { supplierInvoicesOwed } from '@/lib/money/supplier-invoices'
import { dueOn } from '@/lib/billing-cascade'
import { nothingToBillSays, type WeekNotBillable } from '@/lib/money/nothing-to-bill'
import { labelOf } from '@/lib/cycle-kinds'
import { getNavForKind } from '@/components/shell/sidebar'
import { threeWayMatch, type MatchInput } from '@/lib/three-way-match'

const D = (s: string) => new Date(`${s}T00:00:00.000Z`)

function menuLabelFor(kind: string, href: string): string | null {
  for (const section of getNavForKind(kind as any, false)) {
    const item = section.items.find((i) => i.href === href)
    if (item) return item.label
  }
  return null
}

describe('Accounts payable speaks the reader’s words', () => {
  it('a client’s accounts payable page sends the clerk to Invoice receipts, the word on her own menu, and never to a “We owe” switch she does not have', () => {
    const link = receiptsLink({ companyKind: 'CLIENT', seatedAtClient: false })
    expect(link.says).toBe('Open Invoice receipts')
    expect(link.says).not.toContain('We owe')
    expect(link.href).toBe('/dashboard/invoices')
    // The word is the menu's, so the two cannot drift apart unnoticed.
    expect(link.says).toContain(menuLabelFor('CLIENT', '/dashboard/invoices')!)
  })

  it('a program office reading a client’s book is sent the same way as the client', () => {
    expect(receiptsLink({ companyKind: 'MSP', seatedAtClient: true }).says).toBe('Open Invoice receipts')
  })

  it('a firm that both bills and pays is sent to Bills, opened on what it owes', () => {
    const link = receiptsLink({ companyKind: 'VENDOR', seatedAtClient: false })
    expect(link.says).toContain(menuLabelFor('VENDOR', '/dashboard/invoices')!)
    expect(link.href).toBe('/dashboard/invoices?side=PAYABLE')
    expect(link.says).not.toContain('We owe')
  })

  it('the accounts payable page explains itself in plain words and never says chain float', () => {
    expect(RECEIPTS_ONLY_NOTE.toLowerCase()).not.toContain('float')
    expect(RECEIPTS_ONLY_NOTE).toContain('invoice receipts')
  })

  it('the sentence over a client’s invoice receipts points at the list under it, not at a switch elsewhere', () => {
    const l = supplierInvoicesOwed([{
      id: 'a', number: 'IN-1', status: 'SUBMITTED', currency: 'USD', totalMinor: 580_000, paidMinor: 0,
      dueAt: D('2026-10-15'), supplierName: 'Computer Systems Inc',
    } as any], D('2026-10-03'))
    expect(l.says).not.toContain('We owe')
    expect(l.says).not.toContain('on Invoices')
    expect(l.says).toContain('Open one below')
  })
})

describe('Dates and counts, as a clerk reads them', () => {
  it('a due date reads as a plain date — “Oct 15, 2026” — never as a machine date', () => {
    const due = dueOn({ anchor: 'PERIOD_END', days: 45, periodEnd: D('2026-08-31'), issuedAt: D('2026-09-01') })
    expect(due.says).toBe('Due Oct 15, 2026 — net 45 from the end of the work period, Aug 31, 2026.')
    expect(due.says).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})

describe('The three-way check counts in words', () => {
  const sheet = (id: string) => ({
    id, status: 'APPROVED', approvedHours: 40, contractRateCents: 14_500,
    periodStart: D('2026-08-03'), periodEnd: D('2026-08-07'),
  })
  const one: MatchInput = {
    invoice: {
      id: 'inv1', totalCents: 580_000, periodStart: D('2026-08-03'), periodEnd: D('2026-08-07'),
      contractPeriod: { start: D('2026-08-01'), end: D('2026-08-31'), label: 'August 2026' },
    },
    lines: [{ id: 'l1', timesheetId: 'ts1', personName: 'Helena Marsh', hours: 40, rateCents: 14_500, amountCents: 580_000 }],
    timesheets: { ts1: sheet('ts1') },
    po: null,
    poRequired: false,
  }
  const receipt = (input: MatchInput) => threeWayMatch(input).checks.find((c) => c.code === 'RECEIPT')!.reason

  it('a check over one line says “the one line”, never “All 1 lines”', () => {
    expect(receipt(one)).toBe('The one line is backed by an approved timesheet')
    expect(receipt(one)).not.toContain('All 1 lines')
  })

  it('a check over three lines still says all three', () => {
    const three: MatchInput = {
      ...one,
      invoice: { ...one.invoice, totalCents: 1_740_000 },
      lines: ['1', '2', '3'].map((n) => ({ id: `l${n}`, timesheetId: `ts${n}`, personName: 'Helena Marsh', hours: 40, rateCents: 14_500, amountCents: 580_000 })),
      timesheets: { ts1: sheet('ts1'), ts2: sheet('ts2'), ts3: sheet('ts3') },
    }
    expect(receipt(three)).toBe('All 3 lines are backed by an approved timesheet')
  })

  it('a purchase order check names its dates the way a clerk writes them', () => {
    const withPo: MatchInput = {
      ...one,
      po: { id: 'po1', number: 'PO-2026-0Q5ND', status: 'OPEN', startDate: D('2026-01-01'), endDate: D('2027-04-11'), amountCents: 30_200_000, consumedCents: 0 } as any,
      poRequired: true,
    }
    const reasons = threeWayMatch(withPo).checks.map((c) => c.reason).join(' ')
    expect(reasons).toContain('from Aug 3, 2026 to Aug 7, 2026')
    expect(reasons).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})

describe('A refused bill names the week, the person and who must sign first', () => {
  const omar: WeekNotBillable = {
    personName: 'Omar Haddad', periodStart: D('2026-09-21'), status: 'SUBMITTED',
    clientSigned: false, clientName: 'Northbend Athletic', onOurBill: null,
  }

  it('a supplier refused a bill is told whose week is waiting, which week, and who must sign it first', () => {
    const says = nothingToBillSays([omar], { start: D('2026-09-20'), end: D('2026-09-26') })
    expect(says).toContain('Omar Haddad’s week of Sep 21 is waiting for Northbend Athletic to sign it.')
    expect(says).toContain('Nothing can be billed until the client signs the week.')
    expect(says).not.toContain('No approved timesheets')
  })

  it('two weeks waiting on one client are named together, once', () => {
    const says = nothingToBillSays([omar, { ...omar, personName: 'Lucía Fernández' }])
    expect(says).toContain('Omar Haddad’s week of Sep 21 and Lucía Fernández’s week of Sep 21 are waiting for Northbend Athletic to sign them.')
  })

  it('a week the worker has not sent yet is named as not sent, because only the worker sends their own week', () => {
    const says = nothingToBillSays([{ ...omar, status: 'OPEN' }])
    expect(says).toContain('Omar Haddad’s week of Sep 21 has not been sent yet')
    expect(says).toContain('only the worker sends their own week')
  })

  it('a week the client sent back says so, and who sent it', () => {
    expect(nothingToBillSays([{ ...omar, status: 'REJECTED' }]))
      .toContain('Northbend Athletic sent Omar Haddad’s week of Sep 21 back')
  })

  it('a signed week already on one of our bills names the bill', () => {
    const says = nothingToBillSays([{ ...omar, status: 'APPROVED', clientSigned: true, onOurBill: 'IN-N1YFQK-20260901' }])
    expect(says).toBe('Nothing is left to bill. Omar Haddad’s week of Sep 21 is already on bill IN-N1YFQK-20260901.')
  })

  it('dates with no hours in them say so, with the dates', () => {
    expect(nothingToBillSays([], { start: D('2026-09-20'), end: D('2026-09-26') }))
      .toBe('No hours are on record for this engagement between Sep 20, 2026 and Sep 26, 2026, so there is nothing to bill.')
  })
})

describe('A placement’s billing dates, from the side that reads them', () => {
  it('a client reading a placement’s billing dates sees an invoice receipt to expect, never a bill to raise', () => {
    expect(labelOf('INVOICE_GENERATE', 'PAYER')).toBe('Invoice receipt expected')
    expect(labelOf('INVOICE_GENERATE', 'END_CLIENT')).toBe('Invoice receipt expected')
    expect(labelOf('INVOICE_GENERATE', 'PAYER').toLowerCase()).not.toContain('bill to raise')
  })

  it('the supplier reading the same dates still raises its bill', () => {
    expect(labelOf('INVOICE_GENERATE', 'SUPPLIER')).toBe('Bill to raise')
    expect(labelOf('INVOICE_GENERATE')).toBe('Bill to raise')
  })

  it('hours read the same to both sides', () => {
    expect(labelOf('TIMESHEET_APPROVE', 'PAYER')).toBe(labelOf('TIMESHEET_APPROVE', 'SUPPLIER'))
  })
})
