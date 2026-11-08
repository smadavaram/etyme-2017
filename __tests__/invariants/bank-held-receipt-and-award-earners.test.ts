import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bankHeldReceiptDecision } from '@/app/api/decisions/receipt-to-pay'
import { soldBy, recruitedBy } from '@/app/api/submissions/[id]/award/commission-earners'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const NOW = new Date('2026-11-08T12:00:00Z')
const receipt = {
  id: 'inv-0441', number: 'PR-2026-0441', vendorName: 'Pinnacle Resourcing',
  outstandingCents: 392_000, currency: 'USD',
  dueAt: new Date('2026-12-15T00:00:00Z'), receivedAt: new Date('2026-11-01T00:00:00Z'),
}

describe('a receipt through the check and held on the supplier’s bank details', () => {
  it('reads as held for the bank, with the sentence that names who checks', () => {
    const row = bankHeldReceiptDecision(receipt, { says: 'Bank details not checked. Ask Rosalind Tay to check them, then pay.', mayCheck: false }, NOW)
    expect(row.title).toBe('Held: bank details not checked — Pinnacle Resourcing')
    expect(row.subtitle).toBe('Invoice PR-2026-0441 · $3,920.00 · Bank details not checked. Ask Rosalind Tay to check them, then pay.')
    expect(row.actionUrl).toBe('/dashboard/invoices/inv-0441')
  })

  it('for the seat that checks, the row opens the check on that receipt', () => {
    const row = bankHeldReceiptDecision(receipt, { says: 'Bank details not checked. Check them, then pay.', mayCheck: true }, NOW)
    expect(row.actionUrl).toBe('/dashboard/invoices/inv-0441#pay')
    expect(row.subtitle).toContain('Check them, then pay.')
  })

  it('adds nothing to the money waiting to be paid, and is urgent within a week of its due date', () => {
    const hold = { says: 'x', mayCheck: false }
    expect(bankHeldReceiptDecision(receipt, hold, NOW).amount).toBeNull()
    expect(bankHeldReceiptDecision(receipt, hold, NOW).urgency).toBe('MEDIUM')
    expect(bankHeldReceiptDecision({ ...receipt, dueAt: new Date('2026-11-12T00:00:00Z') }, hold, NOW).urgency).toBe('HIGH')
  })

  it('the queue asks the bank gate the payment write asks and says money’s own sentence, never a second rule', () => {
    const route = read('src/app/api/decisions/route.ts')
    expect(route).toContain("import { mayPayFirm } from '@/lib/setup-gates'")
    expect(route).toContain("import { bankHoldAt } from '@/lib/money/bank-check-read'")
    expect(route).toContain('bankHeldReceiptDecision(receipt, hold, now)')
  })
})

describe('who earns the award’s default commissions', () => {
  it('the job’s owner sold the deal where they sit at the firm whose sell line it is', () => {
    expect(soldBy({ jobOwner: { personId: 'owner', seatedAtSeller: true }, relationship: { personId: 'am', isAccountManager: true } })).toBe('owner')
  })

  it('else the account manager on the firm’s own record of the client relationship sold it', () => {
    expect(soldBy({ jobOwner: { personId: 'client-pm', seatedAtSeller: false }, relationship: { personId: 'am', isAccountManager: true } })).toBe('am')
  })

  it('nobody is guessed: a relationship recorded by somebody who is not the account manager names nobody', () => {
    expect(soldBy({ jobOwner: null, relationship: { personId: 'recruiter', isAccountManager: false } })).toBeNull()
    expect(soldBy({ jobOwner: null, relationship: null })).toBeNull()
  })

  it('whoever put the person forward recruited them, and an older submission names nobody', () => {
    expect(recruitedBy({ submittedById: 'nia' })).toBe('nia')
    expect(recruitedBy({ submittedById: null })).toBeNull()
  })

  it('every door that puts a person forward writes who did it', () => {
    expect(read('src/app/api/submissions/route.ts')).toContain('submittedById: (caller.isService ? null : caller.person.id) ?? submitter?.id ?? null')
    expect(read('src/app/api/submissions/[id]/forward/route.ts')).toContain('submittedById: caller.person.id')
    expect(read('src/app/api/invitations/[id]/answer/route.ts')).toContain('submittedById: caller.person.id')
  })
})
