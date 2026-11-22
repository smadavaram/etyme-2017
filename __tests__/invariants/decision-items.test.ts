/** Decision items a person opens (2026-11-21 → 107). The rules, with no database. */
import { describe, it, expect } from 'vitest'
import { ageInDays, ageOf, openRefusal, mayDecide, verdictRefusal, todayIn, seatAtFirm, mayReadProof, proofIsFor, type FirmSeat } from '@/lib/decision-items'

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

  it('today is the firm’s own day: at 02:00 in India on the 22nd a decision dated the 22nd may open', () => {
    const now = new Date('2026-11-21T20:30:00Z')
    const day = todayIn('Asia/Kolkata', now)
    expect(day.toISOString().slice(0, 10)).toBe('2026-11-22')
    expect(openRefusal({ question: 'Q?', proof: 'P', openedOn: new Date('2026-11-22') }, day)).toBeNull()
  })

  it('at 6pm Pacific a decision dated that day is not yet a day old, and the next day is still refused', () => {
    const day = todayIn('America/Los_Angeles', new Date('2026-11-22T02:00:00Z'))
    expect(ageInDays(new Date('2026-11-21'), day)).toBe(0)
    expect(openRefusal({ question: 'Q?', proof: 'P', openedOn: new Date('2026-11-22') }, day)).toMatch(/has not happened/)
  })

  it('a firm with no time zone set reads today as the UTC day', () => {
    expect(todayIn(null, new Date('2026-11-21T23:59:00Z')).toISOString().slice(0, 10)).toBe('2026-11-21')
  })

  it('a decided decision’s age stops on the day it was decided', () => {
    const later = new Date('2026-12-30T12:00:00Z')
    expect(ageOf({ openedOn: new Date('2026-11-01'), decidedAt: new Date('2026-11-03T10:00:00Z') }, later, null)).toBe(2)
    expect(ageOf({ openedOn: new Date('2026-11-01'), decidedAt: null }, later, null)).toBe(59)
  })
})

const seat = (over: Partial<FirmSeat>): FirmSeat => ({
  contextId: 'c1', personId: 'p1', type: 'EMPLOYEE', roleName: 'Recruiter', companyId: 'f', expiresAt: null, isOwner: false,
  rolePermissions: [], revokedAt: null, suspendedAt: null, hasSignedIn: true, ...over,
})
const now = new Date('2026-11-21T12:00:00Z')

describe('who may owe and decide a decision', () => {
  it('a person on the firm’s bench, or whose seat is paused, revoked or ended by its date, cannot be named the owner of a decision', () => {
    for (const s of [
      seat({ type: 'CONSULTANT' }), seat({ suspendedAt: now }), seat({ revokedAt: now }), seat({ expiresAt: new Date('2026-11-01') }),
    ]) expect(seatAtFirm(s, [s, seat({ contextId: 'o', personId: 'o', isOwner: true, rolePermissions: ['*'] })], now)).toBeNull()
  })

  it('an invited seat that never signed in may be named owner but cannot decide', () => {
    const s = seat({ hasSignedIn: false })
    expect(seatAtFirm(s, [s], now)).toBe('MAY_OWE')
    expect(seatAtFirm(seat({}), [], now)).toBe('DECIDES')
  })

  it('an Owner’s seat past its end date still decides, as the end-date rule keeps it open', () => {
    const s = seat({ roleName: 'Owner', isOwner: true, expiresAt: new Date('2026-11-01') })
    expect(seatAtFirm(s, [s], now)).toBe('DECIDES')
  })

  it('the proof is read by the owner, the firm’s Owner and Admins, and whoever sent it back or decided it, and by no other seat', () => {
    const base = { ownerPersonId: 'a', actedBy: ['c'] }
    expect(mayReadProof({ ...base, readerPersonId: 'a', readerRoleNames: ['Recruiter'] })).toBe(true)
    expect(mayReadProof({ ...base, readerPersonId: 'b', readerRoleNames: ['Owner'] })).toBe(true)
    expect(mayReadProof({ ...base, readerPersonId: 'b', readerRoleNames: ['Admin'] })).toBe(true)
    expect(mayReadProof({ ...base, readerPersonId: 'c', readerRoleNames: ['HR'] })).toBe(true)
    expect(mayReadProof({ ...base, readerPersonId: 'd', readerRoleNames: ['Account Manager'] })).toBe(false)
  })

  it('the proof of a decision a disputed month opened is read only by a seat the proof rule allows that also reads payroll', () => {
    const base = { ownerPersonId: 'a', actedBy: ['c'], aboutPayroll: true }
    // Allowed by the proof rule and reading payroll: reads it.
    expect(mayReadProof({ ...base, readerPersonId: 'a', readerRoleNames: ['AP & Payroll'], readsPayroll: true })).toBe(true)
    expect(mayReadProof({ ...base, readerPersonId: 'b', readerRoleNames: ['Owner'], readsPayroll: true })).toBe(true)
    // Allowed by the proof rule alone: an Admin, HR who sent it back, even its owner, from a seat that does not read payroll.
    expect(mayReadProof({ ...base, readerPersonId: 'b', readerRoleNames: ['Admin'], readsPayroll: false })).toBe(false)
    expect(mayReadProof({ ...base, readerPersonId: 'c', readerRoleNames: ['HR'], readsPayroll: false })).toBe(false)
    expect(mayReadProof({ ...base, readerPersonId: 'a', readerRoleNames: ['Account Manager'], readsPayroll: false })).toBe(false)
    // Reading payroll alone is not enough either.
    expect(mayReadProof({ ...base, readerPersonId: 'd', readerRoleNames: ['AP & Payroll'], readsPayroll: true })).toBe(false)
    expect(proofIsFor('Dana Owner', true)).toMatch(/They state payroll amounts, so each of them reads them only from a seat that reads payroll\.$/)
  })
})
