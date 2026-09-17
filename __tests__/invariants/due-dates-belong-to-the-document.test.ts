import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MONEY_KINDS, RESERVED_KINDS, isMoneyKind, categoryOf, labelOf, cyclesFor } from '@/lib/cycle-kinds'
import { generateCycles } from '@/lib/cycle-generator'
import { TEMPLATE_PACKS, TEMPLATE_PACK_IDS } from '@/lib/template-packs'
import { dueOn } from '@/lib/billing-cascade'

/**
 * "Are we complicating with so many cycles?"
 *
 * Two of the eight were. INVOICE_DUE and VENDOR_BILL_DUE were a second
 * answer to a question the document already answers — and a worse one,
 * because the calendar guessed months in advance while the invoice
 * counts from the day the client actually received it.
 *
 * A cycle is money that moves on a schedule decided in advance. A
 * payment term is a clock a document starts. Pay day is the first;
 * a due date is the second.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const day = (d: Date) => d.toISOString().slice(0, 10)
const on = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

describe('a due date belongs to the document, not to the calendar', () => {
  it('a due date comes from the invoice the client received, not from a day on the calendar', () => {
    // The default pack raises invoices semimonthly on the 1st, so the
    // second half of August is billed on 16 September. On NET 30 from
    // receipt, that falls due on 18 October — and the retired cycle row
    // would have claimed the 28th of September, three weeks early.
    const verdict = dueOn({
      anchor: 'RECEIPT_DATE',
      days: 30,
      periodEnd: on(2026, 8, 31),
      issuedAt: on(2026, 9, 16),
      receivedAt: on(2026, 9, 18),
    })
    expect(verdict.clockStarted).toBe(true)
    expect(day(verdict.dueAt)).toBe('2026-10-18')
    expect(day(verdict.dueAt)).not.toBe('2026-09-28')

    // And nothing generates the calendar's answer any more.
    expect(isMoneyKind('INVOICE_DUE')).toBe(false)
  })

  it('an invoice nobody has confirmed receiving says what it is waiting for, where a cycle would have named a date anyway', () => {
    const verdict = dueOn({
      anchor: 'RECEIPT_DATE',
      days: 30,
      periodEnd: on(2026, 8, 31),
      issuedAt: on(2026, 9, 16),
      receivedAt: null,
    })
    expect(verdict.clockStarted).toBe(false)
    expect(verdict.waitingFor).toBe('the client to confirm they received it')
  })

  it("a vendor bill's due date is the bill's own, so nothing schedules one in advance", () => {
    expect(isMoneyKind('VENDOR_BILL_DUE')).toBe(false)
    expect(generateCycles(on(2026, 1, 1), on(2026, 6, 30), [
      { kind: 'VENDOR_BILL_DUE', frequency: 'MONTHLY', dayOfMonth: 15 },
    ])).toEqual([])
  })

  it('pay day is still a cycle, because nobody sends a document that decides it', () => {
    expect(isMoneyKind('SALARY_PAY')).toBe(true)
    const pay = generateCycles(on(2026, 1, 1), on(2026, 2, 28), [
      { kind: 'SALARY_PAY', frequency: 'MONTHLY', dayOfMonth: 15 },
    ])
    expect(pay.length).toBeGreaterThan(0)
    expect(labelOf('SALARY_PAY')).toBe('Pay day')
  })

  it('the day we raise an invoice is still ours to schedule; the day it falls due never was', () => {
    expect(isMoneyKind('INVOICE_GENERATE')).toBe(true)
    expect(isMoneyKind('VENDOR_BILL_GENERATE')).toBe(true)
    expect(isMoneyKind('INVOICE_DUE')).toBe(false)
    expect(isMoneyKind('VENDOR_BILL_DUE')).toBe(false)
  })

  it('six kinds are generated, and every one of them is a date the calendar decides', () => {
    expect([...MONEY_KINDS]).toEqual([
      'TIMESHEET_SUBMIT',
      'TIMESHEET_APPROVE',
      'INVOICE_GENERATE',
      'SALARY_CALCULATE',
      'SALARY_PAY',
      'VENDOR_BILL_GENERATE',
    ])
  })
})

describe('no pack brings the two back', () => {
  it('no template pack schedules an invoice due date months before the invoice exists', () => {
    for (const id of TEMPLATE_PACK_IDS) {
      const kinds = TEMPLATE_PACKS[id].cycleDefinitions.map((c) => c.kind)
      expect(kinds, `${id} still carries INVOICE_DUE`).not.toContain('INVOICE_DUE')
    }
  })

  it('no template pack schedules a vendor bill due date', () => {
    for (const id of TEMPLATE_PACK_IDS) {
      const kinds = TEMPLATE_PACKS[id].cycleDefinitions.map((c) => c.kind)
      expect(kinds, `${id} still carries VENDOR_BILL_DUE`).not.toContain('VENDOR_BILL_DUE')
    }
  })

  it('a pack that asks for one anyway is refused by name and generates nothing', () => {
    const { sell, buy, refused } = cyclesFor(
      { contractType: 'C2C', vendorCompanyId: 'sub' },
      [
        { kind: 'INVOICE_GENERATE', frequency: 'MONTHLY' as const, label: 'Invoice to raise' },
        { kind: 'INVOICE_DUE', frequency: 'MONTHLY' as const, label: 'Invoice due' },
        { kind: 'VENDOR_BILL_DUE', frequency: 'MONTHLY' as const, label: 'Vendor bill due' },
      ]
    )
    const generated = [...sell, ...buy].map((d) => d.kind)
    expect(generated).toEqual(['INVOICE_GENERATE'])
    expect(refused).toEqual(['INVOICE_DUE', 'VENDOR_BILL_DUE'])
  })
})

describe('the rows already written still read as a person would say them', () => {
  it('a cycle written by an older engine still reads "Invoice due" rather than an enum', () => {
    expect(labelOf('INVOICE_DUE')).toBe('Invoice due')
    expect(labelOf('VENDOR_BILL_DUE')).toBe('Vendor bill due')
  })

  it('an old invoice-due row still files under bill, and an old vendor-bill-due row under pay', () => {
    expect(categoryOf('INVOICE_DUE')).toBe('BILL')
    expect(categoryOf('VENDOR_BILL_DUE')).toBe('PAY')
  })

  it('both are recognized and never generated, which is what reserved means', () => {
    expect([...RESERVED_KINDS]).toContain('INVOICE_DUE')
    expect([...RESERVED_KINDS]).toContain('VENDOR_BILL_DUE')
    for (const k of RESERVED_KINDS) expect(isMoneyKind(k), k).toBe(false)
  })

  it('the rows left over are swept once by a script, not left to argue with the invoice', () => {
    const script = read('scripts/retire-due-cycles.mjs')
    expect(script).toContain('INVOICE_DUE')
    expect(script).toContain('VENDOR_BILL_DUE')
    // Uncompleted only. A completed row records something that happened.
    expect(script).toContain('completedAt: null')
  })
})

describe('what is owed and when is still on a screen — read off the document', () => {
  it('the AR desk reads what is owed and when from the invoice itself', () => {
    const ar = read('src/app/dashboard/ar/page.tsx')
    expect(ar).toContain('dueAt')
    expect(ar).not.toContain('INVOICE_DUE')
  })

  it('the AP desk reads when a bill falls due from the bill itself', () => {
    expect(read('src/lib/ap-delay.ts')).toContain('dueAt')
    expect(read('src/app/api/ap/bills/route.ts')).not.toContain("kind: 'VENDOR_BILL_DUE'")
  })

  it('a placement shows the due date of each invoice raised against it, from the invoice', () => {
    expect(read('src/app/dashboard/placements/[id]/page.tsx')).toContain('due {inv.dueAt}')
  })
})
