import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bankCheckers, mayCheckBank, bankHeldSays, bankCheckWrite, type PayerSeat,
} from '@/lib/money/bank-check'
import { weekLinesFor, billedByFor } from '@/lib/money/weeks-read'
import { duplicateDrafts, type BillOnRecord } from '@/lib/money/duplicate-drafts'
import { weekOnPlan } from '@/lib/money/week-bill'
import { withBankHold, type InvoiceVerdict } from '@/lib/twin/rules/invoice'
import type { Rung } from '@/lib/work-chain'

/**
 * The founder's tester on production, 2026-11-08, items 2 and 4 (money):
 * the bank check that nobody at the demo client could make, Helena
 * Marsh's weeks missing from the placement that billed them, and Rajesh
 * Iyer's second draft of one week.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const ap: PayerSeat = { personId: 'renata', name: 'Renata Kowal', roleName: 'AP Clerk', permissions: ['invoices.read', 'payments.record'] }
const owner: PayerSeat = { personId: 'owner', name: 'Dana Whitfield', roleName: 'Owner', permissions: ['*'] }
const pm: PayerSeat = { personId: 'pm', name: 'Helena Brandt', roleName: 'Program Manager', permissions: ['invoices.read'] }
const finance: PayerSeat = { personId: 'rosalind', name: 'Rosalind Tay', roleName: 'Finance', permissions: ['payments.record', 'invoices.issue'] }
const facts = { bankName: 'Chase', accountName: 'Computer Systems Inc', accountLast4: '4471' }

describe('the bank check, where the client has no Finance seat (tester item 2)', () => {
  it('where a client has no Finance seat, the AP clerk may check a supplier’s bank, and the check records who and when', () => {
    const who = bankCheckers([pm, ap, owner])
    expect(who.by).toBe('FALLBACK')
    expect(mayCheckBank('renata', who, 'Northbend Athletic')).toEqual({ ok: true })
    const at = new Date('2026-11-08T15:00:00Z')
    const w = bankCheckWrite({ payee: 'Computer Systems Inc', payer: { id: 'nb', name: 'Northbend Athletic' }, by: { personId: 'renata', name: 'Renata Kowal' }, facts, at })
    expect(w.ok).toBe(true)
    if (w.ok) {
      expect(w.data).toEqual({ verifiedAt: at, verifiedById: 'renata', verifiedByCompanyId: 'nb' })
      expect(w.says).toBe('Renata Kowal checked Computer Systems Inc’s bank details for Northbend Athletic: Chase, Computer Systems Inc, account ending 4471. Computer Systems Inc can be paid.')
    }
  })

  it('where the paying firm has a Finance seat, Finance checks the bank and the AP clerk is told to ask them', () => {
    const who = bankCheckers([ap, finance, owner])
    expect(who.by).toBe('FINANCE')
    expect(who.people.map((p) => p.name)).toEqual(['Rosalind Tay'])
    const refused = mayCheckBank('renata', who, 'Brightmoor Staffing')
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.says).toBe('Rosalind Tay checks a supplier’s bank details at Brightmoor Staffing.')
  })

  it('a held receipt says who checks the bank and links to the check', () => {
    const who = bankCheckers([pm, ap, owner])
    const toTheClerk = bankHeldSays({ payee: 'Computer Systems Inc', payer: 'Northbend Athletic', checkers: who, viewerId: 'renata', facts })
    expect(toTheClerk.says).toBe('Bank details not checked. Check them, then pay.')
    expect(toTheClerk.mayCheck).toBe(true)
    expect(toTheClerk.facts).toEqual(facts)
    const toTheManager = bankHeldSays({ payee: 'Computer Systems Inc', payer: 'Northbend Athletic', checkers: who, viewerId: 'pm', facts })
    expect(toTheManager.says).toBe('Bank details not checked. Ask Renata Kowal or Dana Whitfield to check them, then pay.')
    expect(toTheManager.mayCheck).toBe(false)
    // The receipt's page draws the check from the panel, and posts to the receipt's own door.
    expect(src('src/app/dashboard/invoices/invoice-money.tsx')).toMatch(/payPanel\.bank\?\.mayCheck[\s\S]*<BankCheck/)
    expect(src('src/app/dashboard/invoices/invoice-money.tsx')).toContain("JSON.stringify({ act: 'check-bank' })")
    expect(src('src/app/api/invoices/[id]/route.ts')).toMatch(/export async function POST[\s\S]*checkPayeeBank/)
  })

  it('the twin’s pay question on a receipt held on the bank names who checks it and asks no yes', () => {
    const who = bankCheckers([pm, ap])
    const said = bankHeldSays({ payee: 'Computer Systems Inc', payer: 'Northbend Athletic', checkers: who, viewerId: null, facts })
    expect(said.says).toBe('Computer Systems Inc’s bank details are not checked. Renata Kowal checks them on this invoice receipt, then it can be paid.')
    const clean = { verdict: 'CLEAN', payable: true, rationale: 'Pay it: it matches the signed hours and the contract rate.' } as InvoiceVerdict
    const held = withBankHold(clean, said.says)
    expect(held.payable).toBe(false)
    expect(held.rationale).toBe(said.says)
    expect(src('src/lib/twin/rules/invoice.ts')).toContain('withBankHold(verdict, says)')
  })

  it('a supplier that has entered no bank details is never checked, and the hold says it enters them first', () => {
    const who = bankCheckers([ap])
    const w = bankCheckWrite({ payee: 'Veritan Talent', payer: { id: 'nb', name: 'Northbend Athletic' }, by: { personId: 'renata', name: 'Renata Kowal' }, facts: { bankName: null, accountName: null, accountLast4: null }, at: new Date() })
    expect(w.ok).toBe(false)
    const said = bankHeldSays({ payee: 'Veritan Talent', payer: 'Northbend Athletic', checkers: who, viewerId: 'renata', facts: null })
    expect(said.mayCheck).toBe(false)
    expect(said.says).toBe('Veritan Talent has not entered its bank details yet. It enters them under Setup → Bank details; then you check them and pay.')
  })

  it('a hold where nobody at the paying firm pays suppliers says which role to give, never silence', () => {
    const who = bankCheckers([pm])
    expect(who.by).toBe('NOBODY')
    const said = bankHeldSays({ payee: 'Computer Systems Inc', payer: 'Northbend Athletic', checkers: who, viewerId: 'pm', facts })
    expect(said.says).toContain('Give a seat the AP Clerk or Finance role')
  })
})

describe('one reader of a line’s weeks (tester item 4, Helena Marsh)', () => {
  // Northbend ← Computer Systems ← Techpeple ← Helena: the weeks are filed on Techpeple's line.
  const rungs: Rung[] = [
    { sellContractId: 'csi-to-northbend', companyId: 'csi', buyContractId: 'csi-buys', supplierSellContractId: 'tech-to-csi' },
    { sellContractId: 'tech-to-csi', companyId: 'tech', buyContractId: 'tech-pays-helena', supplierSellContractId: null },
  ]

  it('a person’s page and the Timesheets list read the same weeks the bill priced', () => {
    // The prime's line reads the weeks filed on the rung below it, which is where its bill priced them.
    expect(weekLinesFor(['csi-to-northbend'], rungs).get('csi-to-northbend')).toBe('tech-to-csi')
    expect(billedByFor(['csi-to-northbend'], rungs).get('tech-to-csi')).toBe('csi-to-northbend')
    // A firm whose person is its own reads its own line.
    expect(weekLinesFor(['tech-to-csi'], rungs).get('tech-to-csi')).toBe('tech-to-csi')
    // The bill generator and the books read this one reader.
    expect(src('src/lib/money/bill-generate.ts')).toContain('billedByFor(ownIds, rungs)')
    expect(src('src/lib/money/placement-pay-terms.ts')).toContain('weekLinesFor(ids, rungs)')
  })

  it('a line with no ladder below it reads its own weeks, and a sub-vendor never reads the rung above', () => {
    expect(weekLinesFor(['alone'], []).get('alone')).toBe('alone')
    expect(weekLinesFor(['tech-to-csi'], rungs).get('tech-to-csi')).not.toBe('csi-to-northbend')
  })
})

describe('one week, one draft (tester item 4, Rajesh Iyer)', () => {
  it('a week already on a bill at this firm is never drafted a second time', () => {
    const on = weekOnPlan(
      { timesheetIds: [], weeksLeftOff: [{ timesheetId: 'rajesh-oct-4', billedElsewhere: true, says: 'Rajesh Iyer’s week of Oct 4 – Oct 10, 2026 is already on bill IN-BRT-001.' }] } as any,
      'rajesh-oct-4',
    )
    expect(on).toEqual({ ok: false, code: 'ALREADY_BILLED', says: 'Rajesh Iyer’s week of Oct 4 – Oct 10, 2026 is already on bill IN-BRT-001.' })
  })

  const bill = (over: Partial<BillOnRecord> & { id: string; number: string }): BillOnRecord => ({
    status: 'DRAFT', createdAt: new Date('2026-11-01T10:00:00Z'),
    periodStart: new Date('2026-10-04T00:00:00Z'), periodEnd: new Date('2026-10-10T00:00:00Z'),
    lines: [{ timesheetId: 'rajesh-oct-4', personId: 'rajesh', personName: 'Rajesh Iyer' }],
    ...over,
  })

  it('two drafts that hold the same week are offered as one repair that keeps the first and withdraws the later with a reason', () => {
    const groups = duplicateDrafts([
      bill({ id: 'a', number: 'IN-BRT-001' }),
      bill({ id: 'b', number: 'IN-BRT-002', createdAt: new Date('2026-11-02T10:00:00Z'), lines: [{ timesheetId: null, personId: 'rajesh', personName: 'Rajesh Iyer' }] }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].keep.number).toBe('IN-BRT-001')
    expect(groups[0].withdraw).toEqual([{ id: 'b', number: 'IN-BRT-002' }])
    expect(groups[0].says).toBe('Two drafts hold Rajesh Iyer’s week of Oct 4 – Oct 10, 2026; keep the first, IN-BRT-001.')
    expect(groups[0].reason).toBe('A second draft of Rajesh Iyer’s week of Oct 4 – Oct 10, 2026; IN-BRT-001 is kept.')
  })

  it('a bill that was sent is never withdrawn by the repair; the draft beside it is', () => {
    const groups = duplicateDrafts([
      bill({ id: 'draft', number: 'IN-BRT-001' }),
      bill({ id: 'sent', number: 'IN-BRT-002', status: 'SUBMITTED', createdAt: new Date('2026-11-03T10:00:00Z') }),
    ])
    expect(groups[0].keep).toEqual({ id: 'sent', number: 'IN-BRT-002', status: 'SUBMITTED' })
    expect(groups[0].withdraw.map((d) => d.id)).toEqual(['draft'])
    // Two sent bills on one week offer nothing: a sent bill is corrected with a credit note.
    expect(duplicateDrafts([
      bill({ id: 'x', number: 'X', status: 'SUBMITTED' }),
      bill({ id: 'y', number: 'Y', status: 'PAID' }),
    ])).toEqual([])
  })

  it('a withdrawn or cancelled bill and two people’s drafts for the same days are not duplicates', () => {
    expect(duplicateDrafts([
      bill({ id: 'a', number: 'A' }),
      bill({ id: 'b', number: 'B', status: 'CANCELLED' }),
    ])).toEqual([])
    expect(duplicateDrafts([
      bill({ id: 'a', number: 'A', lines: [{ timesheetId: 't1', personId: 'rajesh', personName: 'Rajesh Iyer' }] }),
      bill({ id: 'b', number: 'B', lines: [{ timesheetId: 't2', personId: 'omar', personName: 'Omar Haddad' }] }),
    ])).toEqual([])
  })

  it('the repair is drawn only for a seat the withdraw route takes, and goes through that route with the reason', () => {
    expect(src('src/app/api/invoices/route.ts')).toContain("hasPermission(caller.permissions, 'invoices.issue')")
    expect(src('src/app/dashboard/invoices/duplicate-drafts.tsx')).toMatch(/\/withdraw`[\s\S]*reason: g\.reason/)
  })
})
