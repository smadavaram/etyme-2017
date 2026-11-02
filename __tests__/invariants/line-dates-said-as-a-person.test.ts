import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lineDates } from '@/lib/money/line-dates'

/**
 * A placement's dates are refused in a sentence a person says.
 *
 * The screen walk, 2026-11-02: Record a placement and Add a line refused
 * a last day on the start day with "endDate must be after startDate" —
 * the right rule in the code's own words, at Brightmoor and at Colleen
 * Byrne's firm. The rule does not move; the sentence names the two days.
 */

describe('a placement’s dates are refused in a sentence a person says', () => {
  it('a last day on the start day is refused with the day, and says what to give instead', () => {
    const v = lineDates('2026-11-09', '2026-11-09')
    expect(v).toEqual({
      ok: false, field: 'endDate',
      says: 'The last day, Nov 9, 2026, is the day this person starts. Give a last day after Nov 9, 2026, or leave it empty where it is not known.',
    })
  })

  it('a last day before the start is refused with both days', () => {
    const v = lineDates('2026-11-09', '2026-11-02')
    expect(v.ok === false && v.says).toBe('The last day, Nov 2, 2026, is before the start, Nov 9, 2026. Give a last day after the start, or leave it empty where it is not known.')
  })

  it('a day that is not a day is quoted back, with the shape a day takes', () => {
    const v = lineDates('next Monday', null)
    expect(v.ok === false && v.field).toBe('startDate')
    expect(v.ok === false && v.says).toMatch(/^“next Monday” is not a day\./)
  })

  it('no start is asked for in a sentence, and no last day is not a refusal', () => {
    expect(lineDates('', null)).toEqual({ ok: false, field: 'startDate', says: 'Give the day this person starts.' })
    const v = lineDates('2026-11-09', '')
    expect(v.ok && v.end).toBeNull()
  })

  it('a last day after the start passes as the same two days the route read before', () => {
    const v = lineDates('2026-11-09', '2027-04-30')
    expect(v.ok && [v.start.toISOString(), v.end?.toISOString()]).toEqual([new Date('2026-11-09').toISOString(), new Date('2027-04-30').toISOString()])
  })

  it('recording a placement and adding a line refuse their dates through it, and no sentence names a field', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/contracts/route.ts'), 'utf8')
    expect(route).toMatch(/const dates = lineDates\(startDate, endDate\)/)
    expect(route).not.toMatch(/endDate must be after startDate|Invalid startDate|Invalid endDate|startDate is required|billRate must be/)
  })
})
