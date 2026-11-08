import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sift, listingRates, profileEditBody, submitFields, rateEnd } from '@/lib/bench-filter'

/**
 * Every amount on supply's screens says its own currency, through money's
 * one formatter or the currency's own exponent, never "/ 100" and a typed
 * "$" (the "₫170.00" class, the screen walk of 2026-11-03).
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a rate reads in its own currency', () => {
  it('a rate in dong reads whole dong, and a rate in dollars keeps its cents', () => {
    expect(rateEnd(170, 'VND')).toBe('₫170')
    expect(rateEnd(9550, 'USD')).toBe('$95.50')
    expect(rateEnd(9500, 'USD')).toBe('$95')
    expect(rateEnd(null, 'VND')).toBe('open')
  })

  it('a person dropped on rate is told the rate in the firm’s own currency', () => {
    const role = { skills: ['validation'], location: null, billMin: null, billMax: 400_000, startDate: null, currency: 'VND' }
    const c = { personId: 'p', name: 'Linh', skills: ['validation'], location: null, workAuth: null, rateFloor: 500_000, availableFrom: null }
    expect(sift(role, [c]).dropped[0].because).toBe('wants ₫500,000, the job tops out at ₫400,000')
  })

  it('a dollar job still says dollars, as it always did', () => {
    const role = { skills: ['validation'], location: null, billMin: null, billMax: 6800, startDate: null }
    const c = { personId: 'p', name: 'Ana', skills: ['validation'], location: null, workAuth: null, rateFloor: 9500, availableFrom: null }
    expect(sift(role, [c]).dropped[0].because).toBe('wants $95, the job tops out at $68')
  })

  it('a rate typed in dong is stored as whole dong, and in dollars as cents', () => {
    expect(listingRates({ min: '150000', max: '200000' }, null, 'VND')).toEqual({ ok: true, rateMin: 150_000, rateMax: 200_000 })
    expect(listingRates({ min: '90.5', max: '110' }, null)).toEqual({ ok: true, rateMin: 9050, rateMax: 11_000 })
    expect(profileEditBody({ skills: '', availableFrom: '', rateFloor: '170' }, true, 'VND')).toMatchObject({ ok: true, body: { rateFloor: 170 } })
    expect(submitFields({ rate: null, payRate: null, offeredBy: null }, { bill: '170' }, { person: 'Linh', firm: 'X' }, 'VND')).toEqual({ ok: true, rate: 170, payRate: null })
  })

  it('a rate under the person’s floor says the floor in its own currency', () => {
    expect(listingRates({ min: '', max: '100' }, 170, 'VND')).toEqual({ ok: false, says: 'The highest rate is under the ₫170 an hour they said they take at the least.' })
  })

  it('no file of these divides by a hundred and types a dollar sign over a rate', () => {
    for (const p of ['src/lib/bench-filter.ts', 'src/app/api/bench/listings/[id]/route.ts', 'src/lib/match-engine.ts']) {
      expect(src(p), p).not.toMatch(/\$\$\{[^}]*\/ ?100/)
    }
  })
})
