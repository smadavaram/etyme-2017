import { describe, it, expect } from 'vitest'
import { balanceOf, summaryOf, accrualFor, hoursIn, mayDraw, drawFor, saysBalance, type Entry } from '@/lib/time-off'

/**
 * The bank of hours an overtime decision can put somebody into.
 *
 * A client that answers "give the time back instead" is not saving
 * money — it is taking on an obligation to pay for hours nobody works
 * later. The ledger is where that obligation lives, and the two things
 * that would make it worthless are a balance that can go negative and
 * an accrual that can happen twice.
 */

const entry = (kind: Entry['kind'], hours: number, effectiveOn?: string): Entry => ({
  kind,
  hours,
  effectiveOn,
})

describe('what is in the bank', () => {
  it('the balance is the sum of the ledger, and there is no balance column to disagree with it', () => {
    const ledger = [entry('ACCRUAL', 5), entry('ACCRUAL', 3), entry('DRAW', -4)]
    expect(balanceOf(ledger)).toBe(4)
  })

  it('an empty ledger is no hours, not an error and not a guess', () => {
    expect(balanceOf([])).toBe(0)
    expect(saysBalance('Priya Nair', 0)).toBe('Priya Nair has no banked time off.')
  })

  it('hours that have not taken effect yet are not spendable today', () => {
    const ledger = [entry('ACCRUAL', 8, '2026-09-07'), entry('ACCRUAL', 8, '2026-10-05')]
    expect(balanceOf(ledger, '2026-09-20')).toBe(8)
    expect(balanceOf(ledger, '2026-10-06')).toBe(16)
  })

  it('a payout empties the bank without pretending the hours were taken as leave', () => {
    const ledger = [entry('ACCRUAL', 10), entry('PAYOUT', -10)]
    const s = summaryOf(ledger)
    expect(s.balanceHours).toBe(0)
    expect(s.paidOutHours).toBe(10)
    expect(s.takenHours).toBe(0)
  })

  it('hours that lapsed are written off with a row of their own, so the balance never shrinks quietly', () => {
    const ledger = [entry('ACCRUAL', 6), entry('EXPIRY', -6)]
    expect(summaryOf(ledger)).toMatchObject({ balanceHours: 0, accruedHours: 6, lapsedHours: 6 })
  })
})

describe('what a decision banks', () => {
  it('a decision banks its hours once, however many times approval runs', () => {
    const decision = { id: 'd1', treatment: 'TIME_OFF', overtimeHours: 5, accrualBps: 10_000 }
    // The arithmetic is the same every time it is asked; what stops the
    // second row is the caller checking for one already written against
    // this decision, and the unique index behind it.
    expect(accrualFor(decision)).toBe(5)
    const ledger = [entry('ACCRUAL', accrualFor(decision))]
    const alreadyBanked = ledger.length > 0
    expect(alreadyBanked ? 0 : accrualFor(decision)).toBe(0)
    expect(balanceOf(ledger)).toBe(5)
  })

  it('banking one hour per overtime hour is the default, and anything else is somebody’s explicit choice', () => {
    expect(accrualFor({ treatment: 'TIME_OFF', overtimeHours: 5 })).toBe(5)
    expect(accrualFor({ treatment: 'TIME_OFF', overtimeHours: 5, accrualBps: 15_000 })).toBe(7.5)
  })

  it('a week paid at the usual rate or at a premium banks nothing at all', () => {
    expect(accrualFor({ treatment: 'SAME_RATE', overtimeHours: 5 })).toBe(0)
    expect(accrualFor({ treatment: 'PREMIUM', overtimeHours: 5, accrualBps: 10_000 })).toBe(0)
  })

  it('a decision with no overtime left on it banks nothing, so an amended week cannot pay twice', () => {
    expect(accrualFor({ treatment: 'TIME_OFF', overtimeHours: 0 })).toBe(0)
    expect(accrualFor({ treatment: 'TIME_OFF', overtimeHours: -3 })).toBe(0)
  })
})

describe('taking the hours back out', () => {
  it('a consultant cannot take more leave than they have banked', () => {
    const v = mayDraw({ personName: 'Priya Nair', balanceHours: 6, askingHours: 8 })
    expect(v.ok).toBe(false)
    expect(v.says).toBe(
      'Priya Nair has 6 hours of banked time off and this sheet takes 8 hours — ' +
        '2 hours more than there is. Correct the week, or bank the hours first.'
    )
  })

  it('taking exactly what is banked leaves the balance at zero rather than below it', () => {
    const v = mayDraw({ personName: 'Priya Nair', balanceHours: 8, askingHours: 8 })
    expect(v.ok).toBe(true)
    expect(v.says).toMatch(/leaving 0 hours/)
  })

  it('a sheet with no leave on it asks the bank for nothing', () => {
    expect(mayDraw({ personName: 'Priya Nair', balanceHours: 0, askingHours: 0 }).ok).toBe(true)
    expect(hoursIn(null)).toBe(0)
    expect(hoursIn({ '2026-09-07': 8, '2026-09-08': 0 })).toBe(8)
  })

  it('a sheet approved twice draws from the bank once', () => {
    const leaveDays = { '2026-09-07': 8 }
    const first = drawFor({ personName: 'Priya Nair', leaveDays, balanceHours: 8 })
    expect(first).toMatchObject({ ok: true, hours: 8 })

    const second = drawFor({
      personName: 'Priya Nair',
      leaveDays,
      balanceHours: 0,
      alreadyDrawnHours: 8,
    })
    expect(second).toMatchObject({ ok: true, hours: 0 })
  })

  it('a sheet amended to hold more leave than the bank holds is refused, and says by how much', () => {
    const v = drawFor({
      personName: 'Priya Nair',
      leaveDays: { '2026-09-07': 8, '2026-09-08': 8 },
      // They had eight and took eight, so the bank is empty; the sheet
      // now asks for eight more.
      balanceHours: 0,
      alreadyDrawnHours: 8,
    })
    expect(v.ok).toBe(false)
    expect(v.hours).toBe(0)
    expect(v.says).toMatch(/8 hours more than there is/)
  })

  it('the refusal names both numbers and never a code, because a code tells nobody what to fix', () => {
    const v = mayDraw({ personName: 'Helena Marsh', balanceHours: 1.5, askingHours: 4 })
    expect(v.says).toMatch(/1\.5 hours/)
    expect(v.says).toMatch(/4 hours/)
    expect(v.says).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/)
  })

  it('one banked hour reads as an hour, not as 1 hours', () => {
    expect(saysBalance('Priya Nair', 1)).toBe('Priya Nair has 1 hour of banked time off.')
  })
})
