import { describe, it, expect } from 'vitest'
import { shareOf, lastShare } from '@/lib/seed-steps'

/**
 * A step too heavy for one function call is cut into shares of what it
 * walks — signed weeks, journal entries, a program's placements — one
 * step each (lib/seed-steps). The shares have to do in several calls
 * exactly what one pass does in one: nothing twice, nothing skipped,
 * nothing out of order.
 */

const rows = Array.from({ length: 23 }, (_, i) => `row-${i}`)

describe('cutting a step into shares', () => {
  it('every row lands in exactly one share, and the shares taken in order are the list in order', () => {
    for (const of of [1, 2, 3, 4, 7, 14, 23, 30]) {
      const joined = Array.from({ length: of }, (_, index) => shareOf(rows, { index, of })).flat()
      expect(joined).toEqual(rows)
    }
  })

  it('shares differ in size by at most one row, so no share carries twice the work of another', () => {
    for (const of of [2, 3, 4, 7, 14]) {
      const sizes = Array.from({ length: of }, (_, index) => shareOf(rows, { index, of }).length)
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
    }
  })

  it('a list shorter than the number of shares leaves some shares empty rather than splitting a row', () => {
    const few = ['a', 'b', 'c']
    const shares = Array.from({ length: 14 }, (_, index) => shareOf(few, { index, of: 14 }))
    expect(shares.flat()).toEqual(few)
    expect(shares.filter((s) => s.length === 0).length).toBe(11)
  })

  it('a share of nothing is nothing', () => {
    expect(shareOf([], { index: 0, of: 4 })).toEqual([])
    expect(shareOf([], { index: 3, of: 4 })).toEqual([])
  })

  it('with no share asked for, the whole list is one pass', () => {
    expect(shareOf(rows)).toEqual(rows)
  })

  it('only the last share, or no share at all, does the work that comes after the list', () => {
    expect(lastShare()).toBe(true)
    expect(lastShare({ index: 3, of: 4 })).toBe(true)
    expect(lastShare({ index: 0, of: 4 })).toBe(false)
    expect(lastShare({ index: 2, of: 4 })).toBe(false)
    expect(lastShare({ index: 0, of: 1 })).toBe(true)
  })
})
