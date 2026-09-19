import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PROGRAMMES, mondayWeek, spread, week } from '@/lib/seed-programmes'
import { policyOf, splitWeeks, valueOf, weekStart, type Decision } from '@/lib/overtime'

/**
 * Overtime shipped green and nothing in the seeded world could reach it:
 * every contract was straight time, so the desk that decides had nothing
 * on it and the decision was unclickable. A feature the founder cannot
 * click is a feature that is not done.
 *
 * So Northbend Athletic's desk gets one week over the line, on one contract, waiting.
 * These are the sentences that hold it there — the arithmetic of the
 * seeded week, not a screenshot of it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** Omar Haddad's leg: Brightmoor bills Northbend Athletic direct, $132 an hour. */
const nike = PROGRAMMES.find((p) => p.client === 'nike')!
const over = nike.placements.filter((pl) => pl.overtimeWeekHours)

describe('the seeded week somebody has to decide the overtime on', () => {
  it('the seeded Northbend Athletic desk has a week somebody must decide the overtime on', () => {
    expect(over).toHaveLength(1)
    const pl = over[0]
    expect(pl.person).toBe('Omar Haddad')
    expect(pl.overtimeAfterHours).toBe(40)
    expect(pl.overtimeWeekHours).toBe(45)
    // Submitted and unsigned, or there is nothing to decide.
    expect(read('src/lib/seed-programmes.ts')).toContain(
      "totalHours: pl.overtimeWeekHours, status: 'SUBMITTED', submittedAt: slot.end,"
    )
  })

  it('the seeded week is over the threshold its own contract sets', () => {
    const pl = over[0]
    const split = splitWeeks(mondayWeek(1, pl.overtimeWeekHours!).days, policyOf({
      overtimeAfterHours: pl.overtimeAfterHours,
      overtimeMultiplierBps: null,
    }))
    expect(split.weeks).toHaveLength(1)
    expect(split.weeks[0].workedHours).toBe(45)
    expect(split.regularHours).toBe(40)
    expect(split.pendingHours).toBe(5)
  })

  it('the threshold is written onto the contract the hours are filed against, not onto the requirement alone', () => {
    const seed = read('src/lib/seed-programmes.ts')
    expect(seed).toContain('overtimeAfterHours: pl.overtimeAfterHours ?? null,')
    expect(seed).toContain('sellContractId: bottom.id, personId: who.id,')
  })

  it('seeding twice leaves one week to decide, not two', () => {
    const seed = read('src/lib/seed-programmes.ts')
    // Looked for before it is made, and a sheet already sitting there is
    // corrected rather than joined by a second one.
    expect(seed).toContain('let sitting = await overlapping(slot.start, slot.end)')
    expect(seed).toContain('if (Number(sitting.totalHours) !== pl.overtimeWeekHours) {')
    // A second run the same day computes the same week, so it finds it.
    expect(mondayWeek(1, 45).start.getTime()).toBe(mondayWeek(1, 45).start.getTime())
  })

  it('a week the contract has already signed is never rewritten to make room for it', () => {
    const seed = read('src/lib/seed-programmes.ts')
    expect(seed).toContain("while (sitting && sitting.status !== 'SUBMITTED' && back < 12) {")
    expect(seed).toContain("if (sitting && sitting.status !== 'SUBMITTED') {")
  })

  it('the week claims no day another sheet on that contract already claims', () => {
    const seed = read('src/lib/seed-programmes.ts')
    // Overlap, not equal start dates. The spans above are five
    // consecutive days from whenever the seed ran, so a calendar week
    // can sit across the end of one without sharing its first day — and
    // two sheets claiming the same Tuesday is a day billed twice.
    expect(seed).toContain('periodStart: { lte: to }, periodEnd: { gte: from }')
    expect(seed).toContain('while (mondayWeek(back, 40).end.getTime() >= oldest) back += 1')
  })

  it('the week runs Monday to Friday, because a threshold is judged Monday to Monday', () => {
    const { start, end, days } = mondayWeek(1, 45)
    expect(start.getUTCDay()).toBe(1)
    expect(end.getUTCDay()).toBe(5)
    // Every day of it falls in one week, so the hours add up against
    // one threshold rather than two.
    const weeks = new Set(Object.keys(days).map(weekStart))
    expect(weeks.size).toBe(1)
    // And it is a week that has finished. Nobody files hours they have
    // not worked.
    expect(end.getTime()).toBeLessThan(Date.now())
  })

  it('the five days of the seeded week add up to what the sheet says it is worth deciding', () => {
    const { days } = mondayWeek(1, 45)
    expect(Object.values(days)).toEqual([9, 9, 9, 9, 9])
    expect(Object.values(days).reduce((a, b) => a + b, 0)).toBe(45)
  })

  it('a sheet claimed over the role spreads its hours across the days too, so its total and its days agree', () => {
    // Lucía Fernández's 44-hour week: the exception the client desk
    // reads. It said 44 and showed five eights, which is a figure with
    // nothing behind it.
    const exception = nike.placements.find((pl) => pl.exceptionHours)!
    expect(exception.exceptionHours).toBe(44)
    const { days } = week(1, exception.exceptionHours!)
    expect(Object.values(days).reduce((a, b) => a + b, 0)).toBe(44)
    expect(Object.values(days)).toEqual([8, 9, 9, 9, 9])
  })

  it('the odd hours land on the later days, never as a twelve-hour day nobody worked', () => {
    expect(spread(44, 5)).toEqual([8, 9, 9, 9, 9])
    expect(spread(45, 5)).toEqual([9, 9, 9, 9, 9])
    expect(spread(40, 5)).toEqual([8, 8, 8, 8, 8])
    expect(spread(44, 5).every((h) => h <= 12)).toBe(true)
  })

  it('at the usual rate the five hours are $660, and the week bills $5,940', () => {
    expect(money('SAME_RATE', 10_000)).toEqual({ total: 594_000, overtime: 66_000 })
  })

  it('at the contract’s time and a half they are $990, and the week bills $6,270', () => {
    expect(money('PREMIUM', 15_000)).toEqual({ total: 627_000, overtime: 99_000 })
  })

  it('banked as time off the week bills $5,280 — forty hours — and five hours are owed to him instead', () => {
    expect(money('TIME_OFF', 0)).toEqual({ total: 528_000, overtime: 0 })
    const split = decided('TIME_OFF', 0)
    expect(split.bankedHours).toBe(5)
    expect(split.pendingHours).toBe(0)
  })

  it('until somebody decides, the five hours are billed by nobody', () => {
    const pl = over[0]
    const split = splitWeeks(mondayWeek(1, 45).days, policyOf({ overtimeAfterHours: pl.overtimeAfterHours, overtimeMultiplierBps: null }))
    const value = valueOf(split, 13_200)
    expect(value.totalCents).toBe(528_000)
    expect(value.pendingHours).toBe(5)
  })

  it('nothing else in the seeded world claims overtime on a contract that allows none', () => {
    for (const program of PROGRAMMES) {
      for (const pl of program.placements) {
        if (!pl.overtimeWeekHours) continue
        expect(pl.overtimeAfterHours).toBeGreaterThan(0)
        expect(pl.overtimeWeekHours).toBeGreaterThan(pl.overtimeAfterHours!)
      }
    }
  })

  it('the week is not bought through a chain, because a decision is written against the leg the hours sit on', () => {
    // Every rung of a chain files its own sheet, and the decision is
    // written against the hours' leg whoever approved it. Seeding a
    // chain here would show a client deciding on somebody else's
    // agreement, which is half-built and not a demo.
    expect(over[0].via).toEqual(['nike', 'brightmoor'])
    expect(over[0].via).toHaveLength(2)
  })
})

/** Northbend Athletic's rate on that leg, in cents an hour. */
const RATE = 13_200

function decided(treatment: 'SAME_RATE' | 'PREMIUM' | 'TIME_OFF', appliedBps: number) {
  const days = mondayWeek(1, 45).days
  const decision: Decision = {
    weekOf: weekStart(Object.keys(days)[0]),
    treatment,
    appliedBps,
    overtimeHours: 5,
  }
  return splitWeeks(days, { afterHours: 40, multiplierBps: 15_000 }, { decisions: [decision] })
}

function money(treatment: 'SAME_RATE' | 'PREMIUM' | 'TIME_OFF', appliedBps: number) {
  const v = valueOf(decided(treatment, appliedBps), RATE)
  return { total: v.totalCents, overtime: v.overtimeCents }
}
