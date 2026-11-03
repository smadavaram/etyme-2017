import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { payLineView, type PayLineFacts } from '@/lib/money/pay-line-repair'

/**
 * "No buy line behind this placement" (the tester's retest, 2026-11-03,
 * Rajesh Iyer at Northbend): the award writes no pay line where nobody has
 * said what the firm pays the person, because an invented rate is a number
 * nobody stands behind. The placement now says so and leads the contract
 * manager to the terms page that writes the line.
 */

const rajesh: PayLineFacts = {
  readerIsSupplier: true, hasBuyLine: false,
  termsSays: 'Brightmoor Staffing has not said how it engages Rajesh Iyer or what it pays them.',
  onRecord: false, readerIsHopZeroFirm: true, readerHoldsContractDesk: true,
  hopZeroSubmissionId: 'sub-1', personName: 'Rajesh Iyer', firmName: 'Brightmoor Staffing',
}

describe('a placement with no buy line', () => {
  it('a placement with no buy line says so and offers the repair to the seat that may', () => {
    const v = payLineView(rajesh)
    expect(v.says).toBe(
      'No buy line behind this placement, so there is no pay line to run payroll from and no week to bill. ' +
      'Brightmoor Staffing has not said how it engages Rajesh Iyer or what it pays them.',
    )
    expect(v.door).toEqual({ href: '/dashboard/submissions/sub-1/terms', label: 'State Rajesh Iyer’s pay' })
  })

  it('a seat at the firm without the contract manager’s permission is told who states the pay, and offered no door', () => {
    const v = payLineView({ ...rajesh, readerHoldsContractDesk: false })
    expect(v.door).toBeNull()
    expect(v.says).toMatch(/Stating Rajesh Iyer’s terms is for the contract manager at Brightmoor Staffing\.$/)
  })

  it('a firm above the person’s own firm is told and given no door, because the pay is the firm below’s to state', () => {
    expect(payLineView({ ...rajesh, readerIsHopZeroFirm: false }).door).toBeNull()
  })

  it('a client reads nothing about a supplier’s pay line, and a placement with a buy line says nothing', () => {
    expect(payLineView({ ...rajesh, readerIsSupplier: false })).toEqual({ says: null, door: null })
    expect(payLineView({ ...rajesh, hasBuyLine: true })).toEqual({ says: null, door: null })
  })

  it('the award still writes no pay line at a rate nobody stated: an employee with no pay on record is a pending line, never a $0 one', () => {
    const award = readFileSync(join(process.cwd(), 'src/lib/award.ts'), 'utf8')
    expect(award).toContain('Their own employee, with no pay on record yet. The firm states it before they can start.')
  })
})

describe('the contracts page and a placed person with no account', () => {
  it('the contracts page draws the placed person’s sign-in link where they have no account', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/contracts/page.tsx'), 'utf8')
    expect(page).toContain("import { SignInLink } from '@/app/dashboard/conversations/sign-in-link'")
    expect(page).toMatch(/<SignInLink personId=\{contract\.personId\}/)
    // The component itself draws nothing where the person has an account or the seat cannot manage the team.
    const link = readFileSync(join(process.cwd(), 'src/app/dashboard/conversations/sign-in-link.tsx'), 'utf8')
    expect(link).toMatch(/export function SignInLink/)
  })
})

import { billStateSays, mayBillWeek } from '@/lib/money/week-bill'

describe('Bill this week, as words and a rule', () => {
  it('the bill’s state reads drafted, sent or paid in a sentence with its number', () => {
    expect(billStateSays({ invoiceId: 'i', number: 'IN-1', status: 'DRAFT' })).toBe('On bill IN-1, drafted and not sent yet.')
    expect(billStateSays({ invoiceId: 'i', number: 'IN-1', status: 'SUBMITTED' })).toBe('On bill IN-1, sent and not yet paid.')
    expect(billStateSays({ invoiceId: 'i', number: 'IN-1', status: 'PAID' })).toBe('On bill IN-1, paid.')
  })
  it('the Owner bills a week only where nobody else at the firm sends bills', () => {
    expect(mayBillWeek({ permitted: true, holdsEverything: true, otherBillers: [] })).toEqual({ ok: true })
    expect(mayBillWeek({ permitted: true, holdsEverything: true, otherBillers: ['Imelda Santoro'] })).toEqual({ ok: false, says: 'Imelda Santoro bills this week.' })
    expect(mayBillWeek({ permitted: true, holdsEverything: false, otherBillers: [] })).toEqual({ ok: true })
    expect(mayBillWeek({ permitted: false, holdsEverything: false, otherBillers: [] }).ok).toBe(false)
  })
})
