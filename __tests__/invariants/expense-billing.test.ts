import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { billableNow, sortForBill, expenseLine, expenseTotal, type ExpenseRow } from '@/lib/expense-billing'
import { billsOnLeg, billsToPayer, rungBilled, rungStatus, billedWords, rowFor, type Leg, type ExpenseBillLine } from '@/lib/money/expense-acceptance'

/**
 * A client-billable expense rides on the next invoice and is paid with it.
 *
 * INVOICED was a button with no invoice behind it; PAID was a word
 * nothing wrote. The flight the consultant paid for was approved and
 * then went nowhere.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const row = (over: Partial<ExpenseRow> = {}): ExpenseRow => ({
  id: 'e1', status: 'APPROVED', billable: true, invoiceId: null, sellContractId: 'sc1',
  personId: 'p1', personName: 'Tariq Al-Amin', category: 'TRAVEL', description: 'Flight PDX–DEN for the kickoff',
  total: 412.5, currency: 'USD', periodStart: new Date('2026-09-09T00:00:00Z'), periodEnd: new Date('2026-09-11T00:00:00Z'),
  payerName: 'Northbend Athletic', own: { kind: 'ACCEPTED', cents: 41_250 }, ...over,
})

describe('which expenses go on the next invoice', () => {
  it('an approved, billable expense the payer accepted and not yet on an invoice goes on', () => {
    expect(billableNow([row()]).map((e) => e.id)).toEqual(['e1'])
  })

  it('a non-billable expense never reaches a client invoice — it is reimbursed through pay', () => {
    expect(billableNow([row({ billable: false })])).toEqual([])
  })

  it('an expense still waiting on approval, or rejected, is not billed', () => {
    expect(billableNow([row({ status: 'SUBMITTED' }), row({ id: 'e2', status: 'REJECTED' })])).toEqual([])
  })

  it('an expense already on an invoice is not billed twice', () => {
    expect(billableNow([row({ invoiceId: 'inv1', status: 'INVOICED' })])).toEqual([])
  })
})

describe('the bill carries what the firm paying it accepted (the founder, 2026-10-19)', () => {
  it('a bill carries the expense at the amount the firm above accepted, never the amount the worker claimed', () => {
    const l = expenseLine(row({ own: { kind: 'ACCEPTED', cents: 38_000 } }))
    expect(l.amountCents).toBe(38_000)
    expect(l.description).toBe('Tariq Al-Amin — Travel expense: Flight PDX–DEN for the kickoff (accepted $380.00 of $412.50)')
    // And nothing nobody accepted has an amount at all.
    expect(() => expenseLine(row({ own: { kind: 'NONE' } }))).toThrow(/no acceptance from the firm paying it/)
  })

  it('an expense the payer has not accepted, or sent back, is left off the bill with a sentence', () => {
    const r = sortForBill([row({ own: { kind: 'NONE' } }), row({ id: 'e2', own: { kind: 'SENT_BACK', reason: 'No receipt for the cab.' } })])
    expect(r.on).toEqual([])
    expect(r.leftOff).toEqual([
      { expenseId: 'e1', says: 'Tariq Al-Amin’s travel expense of Sep 9, 2026 is not on this bill: Northbend Athletic has not accepted it yet.' },
      { expenseId: 'e2', says: 'Tariq Al-Amin’s travel expense of Sep 9, 2026 is not on this bill: Northbend Athletic sent it back (No receipt for the cab.).' },
    ])
  })

  it('an expense of a kind the agreement does not list is left off the bill with a sentence naming the agreement', () => {
    const says = 'The agreement between Northbend Athletic and Brightmoor does not list travel expenses as billable, so Northbend Athletic does not pay for this one.'
    const r = sortForBill([row({ leg: { bills: false, says } })])
    expect(r.on).toEqual([])
    expect(r.leftOff).toEqual([{ expenseId: 'e1', says: `Tariq Al-Amin’s travel expense is not on this bill: ${says}` }])
  })

  it('where the agreement lists the kind, the employer’s own flag does not keep it off the bill', () => {
    expect(sortForBill([row({ billable: false, leg: { bills: true, says: null } })]).on.map((e) => e.id)).toEqual(['e1'])
  })
})

describe('what the line says', () => {
  it('names the person, the kind of expense and what it was for, in cents', () => {
    const l = expenseLine(row())
    expect(l.description).toBe('Tariq Al-Amin — Travel expense: Flight PDX–DEN for the kickoff')
    expect(l.amountCents).toBe(41250)
    expect(l.expenseId).toBe('e1')
  })

  it('adds up in whole currency units the way the invoice total is kept', () => {
    expect(expenseTotal([expenseLine(row()), expenseLine(row({ id: 'e2', total: 87.5, own: { kind: 'ACCEPTED', cents: 8_750 } }))])).toBe(500)
  })
})

describe('the routes carry it through', () => {
  const GENERATE = read('src/lib/money/bill-generate.ts')
  const PAY = read('src/app/api/invoices/[id]/payments/route.ts')
  const ACTIONS = read('src/app/api/expenses/actions/route.ts')

  it('raising an invoice picks up the approved expenses the payer accepted on its contracts and marks them INVOICED with the invoice behind them', () => {
    expect(GENERATE).toContain("from '@/lib/expense-billing'")
    expect(GENERATE).toContain("status: 'APPROVED', invoiceId: null")
    // Billable is the whole chain's up to this leg, the agreement's where it says, and what goes on is what the payer accepted.
    expect(GENERATE).toContain('billsOnLeg(e, chain, ours)')
    expect(GENERATE).toContain('payersOwn(leg.payerId,')
    expect(GENERATE).toContain("data: { status: 'INVOICED', invoiceId: invoice.id }")
  })

  it('a firm in the middle reads whether it already billed an expense from its own lines, and marks the employer’s column only on the employer’s own bill', () => {
    // Once per contract, the same question a week is asked.
    expect(GENERATE).toContain('invoiceLines: { none: { sellContractId: { in: ownIds } } }')
    expect(GENERATE).toMatch(/if \(employersRung\.has\(l\.expenseId\)\) \{\s*await tx\.expense\.update\(\{ where: \{ id: l\.expenseId \}, data: \{ status: 'INVOICED', invoiceId: invoice\.id \} \}\)/)
  })

  it('an expense line has the expense behind it and no timesheet', () => {
    expect(GENERATE).toMatch(/expenseId: l\.expenseId,\s*timesheetId: null/)
  })

  it('an invoice with only expenses on it can still be raised', () => {
    expect(GENERATE).toContain('if (timesheets.length === 0 && expenseRows.length === 0 && milestones.length === 0)')
  })

  it('paying the invoice in full pays the expenses on it', () => {
    expect(PAY).toContain("await tx.expense.updateMany({ where: { invoiceId: id, status: 'INVOICED' }, data: { status: 'PAID' } })")
  })

  it('no button sets INVOICED any more', () => {
    expect(ACTIONS).toContain("const DECISIONS: Decision[] = ['submit', 'approve', 'reject']")
    expect(ACTIONS).not.toContain("updateData.status = 'INVOICED'")
  })
})

// ── A firm in the middle of a chain (2026-10-19) ─────────────────────

/** Northbend Athletic ← Computer Systems ← Techpeple, who employs Helena. */
const LEGS: Leg[] = [
  { sellContractId: 'cs-line', sellerId: 'cs', sellerName: 'Computer Systems', payerId: 'nb', payerName: 'Northbend Athletic', agreement: null },
  { sellContractId: 'tp-line', sellerId: 'tp', sellerName: 'Techpeple', payerId: 'cs', payerName: 'Computer Systems', agreement: null },
]

describe('a firm in the middle of a chain bills its client for an expense (the founder, 2026-10-19)', () => {
  const helena = (over: Partial<ExpenseRow> = {}) => row({
    personName: 'Helena Marsh', description: 'Train to the Tualatin site for the cut-over', total: 250,
    sellContractId: 'cs-line', aboveTheEmployer: true, payerName: 'Northbend Athletic',
    own: { kind: 'ACCEPTED', cents: 25_000 }, ...over,
  })

  it('a firm in the middle bills its client for an expense at what the client accepted, on its own line, once', () => {
    // Techpeple has already billed it to Computer Systems: its column reads INVOICED, with Techpeple's bill on it.
    const r = sortForBill([helena({ status: 'INVOICED', invoiceId: 'tp-bill', own: { kind: 'ACCEPTED', cents: 24_000 } })])
    expect(r.leftOff).toEqual([])
    const l = expenseLine(r.on[0])
    expect(l).toMatchObject({ sellContractId: 'cs-line', amountCents: 24_000 })
    // The line names the person and what it was for, never the firm below Computer Systems.
    expect(l.description).toBe('Helena Marsh — Travel expense: Train to the Tualatin site for the cut-over (accepted $240.00 of $250.00)')
    expect(l.description).not.toContain('Techpeple')
    // Paid to Techpeple already makes no difference either: the employer's column is the employer's rung.
    expect(billableNow([helena({ status: 'PAID', invoiceId: 'tp-bill' })]).map((e) => e.id)).toEqual(['e1'])
  })

  it('a firm in the middle leaves off an expense its client has not accepted, and one its employer has not approved is not a candidate at all', () => {
    expect(sortForBill([helena({ own: { kind: 'NONE' } })]).leftOff).toEqual([
      { expenseId: 'e1', says: 'Helena Marsh’s travel expense of Sep 9, 2026 is not on this bill: Northbend Athletic has not accepted it yet.' },
    ])
    expect(sortForBill([helena({ status: 'SUBMITTED' })])).toEqual({ on: [], leftOff: [] })
  })

  it('an expense accepted in one currency is left off a bill in another, in a sentence, and never converted', () => {
    const r = sortForBill([helena({ currency: 'INR', billCurrency: 'USD' })])
    expect(r.on).toEqual([])
    expect(r.leftOff).toEqual([{
      expenseId: 'e1',
      says: 'Helena Marsh’s travel expense is not on this bill: it was accepted in INR and this bill is in USD, and nothing here converts one into the other.',
    }])
  })

  it('a leg bills an expense only where every leg from the employer’s up to it does, and a stop further down names only the biller’s own supplier', () => {
    const travel = { category: 'TRAVEL', billable: true }
    expect(billsOnLeg(travel, LEGS, 'cs-line')).toEqual({ bills: true, says: null })
    expect(billsOnLeg(travel, LEGS, 'tp-line')).toEqual({ bills: true, says: null })
    // Techpeple carried it as its own cost: Computer Systems is not billed it, so does not bill it on.
    const own = billsOnLeg({ category: 'TRAVEL', billable: false }, LEGS, 'cs-line')
    expect(own.bills).toBe(false)
    expect(own.says).toBe('Techpeple recorded this travel expense as its own cost, and no agreement between Computer Systems and Techpeple says which expenses are billable.')
    // A stop two rungs down names Computer Systems' own supplier, never the firm below it.
    const deep: Leg[] = [
      LEGS[0],
      { ...LEGS[1], sellContractId: 'tp-line', agreement: null },
      {
        sellContractId: 'sub-line', sellerId: 'sub', sellerName: 'Quillon Staffing', payerId: 'tp', payerName: 'Techpeple',
        agreement: { id: 'a', kinds: [], said: true, clientName: 'Techpeple', vendorName: 'Quillon Staffing' },
      },
    ]
    const far = billsOnLeg(travel, deep, 'cs-line')
    expect(far).toEqual({ bills: false, says: 'Techpeple does not bill it to Computer Systems, so Northbend Athletic does not pay for it.' })
    expect(far.says).not.toContain('Quillon')
  })
})

describe('the payer reads an expense’s billability the way the bill does', () => {
  it('the receipt form and the typed-in check judge an expense’s billability on the whole chain, as the bill does', () => {
    const travel = { category: 'TRAVEL', billable: true }
    // Northbend ← Computer Systems ← Techpeple ← Quillon Staffing, whose agreement with Techpeple bills no expense.
    const quillon: Leg = {
      sellContractId: 'sub-line', sellerId: 'sub', sellerName: 'Quillon Staffing', payerId: 'tp', payerName: 'Techpeple',
      agreement: { id: 'a', kinds: [], said: true, clientName: 'Techpeple', vendorName: 'Quillon Staffing' },
    }
    const deep: Leg[] = [...LEGS, quillon]
    // Read on Computer Systems' line alone, the expense would be billable; the bill reads the whole chain and leaves it off.
    expect(billsOnLeg(travel, deep, 'cs-line').bills).toBe(false)
    const paying = billsToPayer(travel, deep, 'cs-line', LEGS[0])
    expect(paying.bills).toBe(billsOnLeg(travel, deep, 'cs-line').bills)
    // Said to Northbend, it names Computer Systems and nobody below it.
    expect(paying.says).toBe('The firm that supplies Computer Systems does not bill it for this travel expense, so Northbend Athletic does not pay for it.')
    expect(paying.says).not.toMatch(/Techpeple|Quillon/)
    // Where every leg bills it, the payer pays for it, as the bill carries it.
    expect(billsToPayer(travel, LEGS, 'tp-line', LEGS[1])).toEqual({ bills: true, says: null })
    // A stop on the supplier's own leg is that leg's sentence, naming the two of them.
    expect(billsToPayer({ category: 'TRAVEL', billable: false }, LEGS, 'tp-line', LEGS[1])).toEqual({
      bills: false,
      says: 'Techpeple recorded this travel expense as its own cost, and no agreement between Computer Systems and Techpeple says which expenses are billable.',
    })
    // With no chain through the supplier's line, the supplier's leg decides, then the employer's own flag.
    expect(billsToPayer({ category: 'TRAVEL', billable: false }, [], null, null)).toEqual({ bills: false, says: null })
    // Both doors ask this, never the supplier's leg alone.
    for (const file of ['src/lib/money/receipt-options.ts', 'src/lib/money/keyed-receipt.ts']) {
      const src = read(file)
      expect(src, file).toContain('billsToPayer(e, chains.get(e.sellContractId) ?? []')
      expect(src, file).toContain('legsOverMany(')
      expect(src, file).not.toMatch(/\blegBills\(/)
    }
  })
})

describe('billed and paid are read per rung', () => {
  const lines: ExpenseBillLine[] = [
    // Techpeple's bill of it to Computer Systems, paid.
    { sellerId: 'tp', payerId: 'cs', payerName: 'Computer Systems', number: 'IN_TP_001', status: 'PAID' },
    // Computer Systems' bill of it to Northbend, sent.
    { sellerId: 'cs', payerId: 'nb', payerName: 'Northbend Athletic', number: 'IN_CS_004', status: 'SUBMITTED' },
  ]

  it('a rung reads an expense as billed or paid only from its own line, never from a rung below', () => {
    // Northbend: billed to it by Computer Systems; Techpeple's paid bill below is not its to read.
    const nb = rungBilled('nb', lines)
    expect(nb).toEqual({ byReader: null, toReader: { number: 'IN_CS_004', state: 'BILLED' } })
    expect(rungStatus(nb)).toBe('INVOICED')
    expect(billedWords(nb)).toEqual(['billed to you on IN_CS_004'])
    // Computer Systems: its own bill upward, and its supplier's to it.
    const cs = rungBilled('cs', lines)
    expect(billedWords(cs)).toEqual(['billed to you on IN_TP_001, paid', 'billed to Northbend Athletic on IN_CS_004'])
    expect(rungStatus(cs)).toBe('INVOICED')
    // Before Computer Systems bills it on, Northbend reads it as approved, whatever Techpeple did below.
    const early = rungBilled('nb', [lines[0]])
    expect(early).toEqual({ byReader: null, toReader: null })
    expect(rungStatus(early)).toBe('APPROVED')
    // Once Northbend pays Computer Systems, both read paid at their own rung.
    const paid = lines.map((l) => (l.sellerId === 'cs' ? { ...l, status: 'PAID' } : l))
    expect(rungStatus(rungBilled('nb', paid))).toBe('PAID')
    expect(rungStatus(rungBilled('cs', paid))).toBe('PAID')
  })

  it('a draft bill is not sent: the firm that drew it reads it as a draft, and the firm it is addressed to does not read it at all', () => {
    const draft: ExpenseBillLine[] = [{ sellerId: 'cs', payerId: 'nb', payerName: 'Northbend Athletic', number: 'IN_CS_005', status: 'DRAFT' }]
    expect(billedWords(rungBilled('cs', draft))).toEqual(['on draft bill IN_CS_005 to Northbend Athletic, not sent'])
    expect(rungStatus(rungBilled('cs', draft))).toBe('APPROVED')
    expect(rungBilled('nb', draft)).toEqual({ byReader: null, toReader: null })
    // A void bill holds nothing.
    expect(rungBilled('cs', [{ ...draft[0], status: 'VOID' }])).toEqual({ byReader: null, toReader: null })
  })

  it('the where-it-stands row says “billed to Northbend Athletic on IN_…” only on the reader’s own rung', () => {
    const expense = {
      id: 'e1', companyId: 'tp', companyName: 'Techpeple', personId: 'helena', personName: 'Helena Marsh',
      category: 'TRAVEL', billable: true, status: 'INVOICED', totalCents: 25_000, currency: 'USD', periodStart: new Date('2026-09-09T00:00:00Z'),
    }
    const acceptances = [
      { companyId: 'nb', status: 'ACCEPTED' as const, acceptedCents: 25_000, reason: null, createdAt: new Date() },
      { companyId: 'cs', status: 'ACCEPTED' as const, acceptedCents: 25_000, reason: null, createdAt: new Date() },
    ]
    const read = (id: string, name: string) =>
      rowFor({ expense, legsTopFirst: LEGS, acceptances, reader: { id, name }, personId: 'someone', billed: rungBilled(id, lines) }).line
    expect(read('cs', 'Computer Systems')).toBe(
      'Approved by Techpeple · accepted by Northbend Athletic $250.00 · accepted by you $250.00 · billed to you on IN_TP_001, paid · billed to Northbend Athletic on IN_CS_004'
    )
    expect(read('nb', 'Northbend Athletic')).toBe('Approved by the employer · accepted by you $250.00 · accepted by Computer Systems $250.00 · billed to you on IN_CS_004')
    expect(read('nb', 'Northbend Athletic')).not.toContain('IN_TP_001')
    expect(read('tp', 'Techpeple')).toBe(
      'Approved by you · accepted by Northbend Athletic $250.00 · accepted by Computer Systems $250.00 · billed to Computer Systems on IN_TP_001, paid'
    )
  })
})
