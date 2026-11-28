import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { daySpan, plainDate } from '@/lib/plain-date'

const page = readFileSync(path.join(__dirname, '../../src/app/dashboard/placements/[id]/page.tsx'), 'utf8')

describe('the placement page never shows an ISO date', () => {
  it('the placement page never shows an ISO date', () => {
    // A raw day printed between braces with an arrow was the week column
    // the browser walk caught: "2026-09-21 → 2026-09-25".
    expect(page).not.toMatch(/\{t\.periodStart\}|\{t\.periodEnd\}/)
    expect(page).not.toContain('} → {')
    // And no rendered field that carries an ISO day is printed bare.
    expect(page).not.toMatch(/\{inv\.dueAt\}/)
    expect(page).not.toContain('toISOString().slice(0, 10)')
  })

  it('a week of hours on the placement page reads as two days a person can read', () => {
    expect(page).toContain('daySpan(t.periodStart, t.periodEnd)')
    expect(daySpan('2026-09-21', '2026-09-25')).toBe('Sep 21 – Sep 25, 2026')
  })

  it('a calendar day on the placement page is read in UTC, so a reader west of London sees the day the contract says', () => {
    expect(page).toContain("import { plainDate, daySpan } from '@/lib/plain-date'")
    expect(plainDate('2026-10-01T00:00:00.000Z')).toBe('Oct 1, 2026')
  })
})
