import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rowFor, type ExpenseOnRecord, type Leg } from '@/lib/money/expense-acceptance'
import { approvesOnlyForWorker, filedAtOwnFirmSays, ownCostSays, standsAsApprovalSays } from '@/lib/money/own-firm-expense'

/**
 * The fifth screen walk, 2026-11-04: Colleen Byrne's one-person firm was
 * asked "Colleen Byrne's expense waits for your approval" for the $85
 * she filed herself. An expense follows the week: her filing stands as
 * her firm's approval, and it waits on the firm above her, said to her.
 */

const route = readFileSync(join(process.cwd(), 'src/app/api/expenses/route.ts'), 'utf8')
const decisions = readFileSync(join(process.cwd(), 'src/app/api/decisions/route.ts'), 'utf8')

const halcyonLeg: Leg = {
  sellContractId: 'byrne-sell', sellerId: 'byrne', sellerName: 'Byrne Critical Care LLC',
  payerId: 'halcyon', payerName: 'Halcyon Talent',
  agreement: { id: 'msa', kinds: ['TRAVEL'], said: true, clientName: 'Halcyon Talent', vendorName: 'Byrne Critical Care LLC' },
}

const expense = (over: Partial<ExpenseOnRecord> = {}): ExpenseOnRecord => ({
  id: 'exp', companyId: 'byrne', companyName: 'Byrne Critical Care LLC', personId: 'colleen', personName: 'Colleen Byrne',
  category: 'TRAVEL', billable: true, status: 'APPROVED', totalCents: 8500, currency: 'USD', periodStart: new Date('2026-10-25T00:00:00Z'),
  ...over,
})

describe('a one-person firm and its own worker’s expense', () => {
  it('a one-person firm is never asked to accept her own expense, and reads it as waiting on the firm above her', () => {
    // Every seat that may approve is hers: her filing stands as the approval.
    expect(approvesOnlyForWorker([{ personId: 'colleen' }], 'colleen')).toBe(true)

    // The filing writes it approved, by nobody, so no queue holds it for her:
    // the employer's queue lists only SUBMITTED expenses.
    expect(route).toMatch(/firmApprovesOnlyFor\(line!\.companyId, caller\.person\.id\)/)
    expect(route).toMatch(/status: ownFirm \? 'APPROVED' : 'SUBMITTED'/)
    expect(route).toMatch(/approvedById: null/)
    expect(decisions).toMatch(/companyId,\s*status: 'SUBMITTED',/)

    // What she reads when she files it: the firm it waits on, to her face.
    const filed = filedAtOwnFirmSays({ waitingOn: 'Halcyon Talent' })
    expect(filed).toBe('Filed. It is waiting on Halcyon Talent to accept it. Your firm is yours alone, so you are not asked to approve your own expense.')
    expect(filed).not.toMatch(/Colleen|Byrne Critical Care/)

    // Her own row: no "Approved by you", no button, the firm above named.
    const row = rowFor({
      expense: expense(), legsTopFirst: [halcyonLeg], acceptances: [],
      reader: { id: 'byrne', name: 'Byrne Critical Care LLC' }, personId: 'colleen', ownFirm: true,
    })
    expect(row.line).toBe('Waiting on Halcyon Talent')
    expect(row.upToCents).toBeNull()

    // And the reason is kept, so the approval nobody pressed is never silent.
    expect(standsAsApprovalSays({ firmName: 'Byrne Critical Care LLC', personName: 'Colleen Byrne', waitingOn: 'Halcyon Talent' }))
      .toBe('Byrne Critical Care LLC is Colleen Byrne’s own firm, and nobody approves their own expense, so Colleen Byrne’s filing stands as Byrne Critical Care LLC’s approval and it goes to Halcyon Talent to accept.')
  })

  it('an expense no firm above pays for is said to her as her own firm’s cost, with the reason, and waits on nobody', () => {
    const says = filedAtOwnFirmSays({
      waitingOn: null,
      whyOwnCost: ownCostSays({ payerName: 'Halcyon Talent', agreementSaid: false, kind: 'TRAVEL' }),
    })
    expect(says).toBe('Filed, as your own firm’s cost. No agreement between you and Halcyon Talent says which expenses are billable, so Halcyon Talent is not billed for it for now.')
    expect(ownCostSays({ payerName: 'Halcyon Talent', agreementSaid: true, kind: 'MEALS' }))
      .toBe('Your agreement with Halcyon Talent does not make meals expenses billable, so Halcyon Talent is not billed for it.')
  })

  it('a firm with a team still accepts its worker’s expense', () => {
    // Somebody besides the worker may approve: they do, as at any firm.
    expect(approvesOnlyForWorker([{ personId: 'colleen' }, { personId: 'bookkeeper' }], 'colleen')).toBe(false)
    expect(approvesOnlyForWorker([{ personId: 'bookkeeper' }], 'colleen')).toBe(false)
    // A firm with nobody seated to approve is not read as hers alone.
    expect(approvesOnlyForWorker([], 'colleen')).toBe(false)
    // And that firm's row still says who approved it, as before.
    const row = rowFor({
      expense: expense(), legsTopFirst: [halcyonLeg], acceptances: [],
      reader: { id: 'byrne', name: 'Byrne Critical Care LLC' }, personId: 'bookkeeper',
    })
    expect(row.line).toBe('Approved by you · waiting on Halcyon Talent')
  })
})
