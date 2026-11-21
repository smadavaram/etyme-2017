/** Decision items a person opens (2026-11-21 → 107). The rules, with no database. */
import { describe, it, expect } from 'vitest'
import { ageInDays, openRefusal, mayDecide, verdictRefusal } from '@/lib/decision-items'

const today = new Date('2026-11-21T15:00:00Z')

describe('a decision item', () => {
  it('a decision’s age is counted in whole days from the day a person says it opened', () => {
    expect(ageInDays(new Date('2026-11-01'), today)).toBe(20)
    expect(ageInDays(new Date('2026-11-21'), today)).toBe(0)
    expect(ageInDays(new Date('2026-11-20T23:59:00Z'), new Date('2026-11-21T00:01:00Z'))).toBe(1)
  })

  it('a decision may open on a day in the past', () => {
    expect(openRefusal({ question: 'Pay the March invoice?', proof: 'Emailed by the supplier', openedOn: new Date('2026-03-02') }, today)).toBeNull()
  })

  it('a decision cannot be opened with a day that has not happened', () => {
    expect(openRefusal({ question: 'Q?', proof: 'P', openedOn: new Date('2026-11-22') }, today)).toMatch(/has not happened/)
  })

  it('a decision cannot be opened without its question or its proof', () => {
    expect(openRefusal({ question: '', proof: 'P', openedOn: today }, today)).toMatch(/question/)
    expect(openRefusal({ question: 'Q?', proof: ' ', openedOn: today }, today)).toMatch(/shows it is owed/)
  })

  it('only its owner or the firm’s Owner or Admin decides a decision', () => {
    expect(mayDecide({ ownerPersonId: 'a', deciderPersonId: 'a', deciderRoleNames: ['Recruiter'] })).toBeNull()
    expect(mayDecide({ ownerPersonId: 'a', deciderPersonId: 'b', deciderRoleNames: ['Owner'] })).toBeNull()
    expect(mayDecide({ ownerPersonId: 'a', deciderPersonId: 'b', deciderRoleNames: ['Admin'] })).toBeNull()
    expect(mayDecide({ ownerPersonId: 'a', deciderPersonId: 'b', deciderRoleNames: ['Account Manager', null] })).toMatch(/Only the person who owes/)
  })

  it('a decision cannot be rejected or sent back without a reason', () => {
    expect(verdictRefusal('OPEN', 'REJECT', '')).toMatch(/why it is rejected/)
    expect(verdictRefusal('OPEN', 'SEND_BACK', '  ')).toMatch(/why it is sent back/)
    expect(verdictRefusal('OPEN', 'APPROVE', null)).toBeNull()
  })

  it('a closed decision cannot be decided again', () => {
    for (const state of ['APPROVED', 'REJECTED']) {
      for (const v of ['APPROVE', 'REJECT', 'SEND_BACK'] as const) expect(verdictRefusal(state, v, 'reason')).toMatch(/already closed/)
    }
  })
})
