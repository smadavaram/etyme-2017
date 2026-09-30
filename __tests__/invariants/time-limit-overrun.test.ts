import { describe, it, expect } from 'vitest'
import { againstLimit, daysFor } from '@/lib/tenure-days'
import { eligibleWords, limitLine, tenureSubtitle } from '@/app/dashboard/tenure/words'

/**
 * Kwame Mensah served 740 days at Northbend Athletic against an
 * eighteen-month time limit, and the ledger said "100%" with a return
 * date of "2026-11-09" (tester, 2026-09-30). The bar may stop at full;
 * the number may not.
 */

describe('where somebody stands against the time limit', () => {
  it('reads 740 days against an eighteen-month limit as 135% and over the limit by 6 months', () => {
    const k = againstLimit(740, 18)
    expect(daysFor(18)).toBe(548)
    expect(k.percent).toBe(135)
    expect(k.over).toBe(true)
    expect(k.overBy).toBe('over the limit by 6 months')
  })

  it('draws the bar full past the limit while the number keeps counting', () => {
    const k = againstLimit(740, 18)
    expect(k.barPercent).toBe(100)
    expect(k.percent).toBeGreaterThan(100)
  })

  it('never reads a hundred percent a day before the limit', () => {
    const k = againstLimit(547, 18)
    expect(k.percent).toBe(99)
    expect(k.over).toBe(false)
    expect(k.overBy).toBeNull()
  })

  it('says days rather than months when somebody is less than a month past the limit', () => {
    expect(againstLimit(560, 18).overBy).toBe('over the limit by 12 days')
  })

  it('counts the same days the block counts, so the percentage and the status cannot disagree', () => {
    expect(againstLimit(548, 18).over).toBe(true)
    expect(againstLimit(548, 18).overBy).toBe('at the limit')
  })
})

describe('the words on the time-limit page', () => {
  it('shows the percentage, the days behind it and how far past the limit, in one line', () => {
    expect(limitLine({ days: 740, capMonths: 18, percent: 135, limitDays: 548, overBy: 'over the limit by 6 months' }))
      .toBe('135% of the 18-month time limit (740 of 548 days) — over the limit by 6 months')
  })

  it('writes the day somebody may come back as a person reads it, never as a machine date', () => {
    expect(eligibleWords('2026-11-09')).toBe('Nov 9, 2026')
    expect(eligibleWords(null)).toBe('—')
  })

  it('says time limit and every supplier, never tenure cap, cross-vendor or exposure', () => {
    const said = tenureSubtitle({ clientName: 'Northbend Athletic', capMonths: 18, breakDays: 90 })
    expect(said).toContain('Time limit: 18 months.')
    expect(said).toContain('added up across every supplier')
    expect(said).not.toMatch(/tenure cap|cross-vendor|exposure/i)
  })

  it('says nothing about a company it cannot yet name', () => {
    expect(tenureSubtitle({ clientName: null, capMonths: null, breakDays: null })).not.toContain(' at ')
  })
})
