import { describe, it, expect } from 'vitest'
import { daysOnSite, monthsOf } from '@/lib/tenure-days'

/**
 * Tenure is time on site, counted once.
 *
 * The ledger summed every sell contract at the client. A person supplied
 * through a prime and a bench vendor has one contract per rung for the
 * same weeks, so the sum doubled them — and an eighteen-month cap
 * stopped somebody at nine.
 */

const on = (iso: string) => new Date(`${iso}T00:00:00Z`)
const now = on('2026-09-10')

describe('how long somebody has been on site', () => {
  it('one contract counts its own days', () => {
    expect(daysOnSite([{ startDate: on('2026-01-01'), endDate: on('2026-01-31') }], now)).toBe(30)
  })

  it('twelve months through one supplier and twelve through another is twenty-four', () => {
    const days = daysOnSite(
      [
        { startDate: on('2024-01-01'), endDate: on('2025-01-01') },
        { startDate: on('2025-03-01'), endDate: on('2026-03-01') },
      ],
      now
    )
    expect(monthsOf(days)).toBe(24)
  })

  it('two legs of one chain are one person on site once, not twice', () => {
    // The prime's contract and the sub's contract, same person, same
    // weeks. Two rows; one stretch of exposure.
    const days = daysOnSite(
      [
        { startDate: on('2026-01-01'), endDate: on('2026-07-01') },
        { startDate: on('2026-01-01'), endDate: on('2026-07-01') },
      ],
      now
    )
    expect(monthsOf(days)).toBe(6)
  })

  it('a contract that overlaps the end of the last one adds only the new days', () => {
    const days = daysOnSite(
      [
        { startDate: on('2026-01-01'), endDate: on('2026-03-01') },
        { startDate: on('2026-02-01'), endDate: on('2026-04-01') },
      ],
      now
    )
    expect(days).toBe(90)
  })

  it('the gap between two contracts is not tenure', () => {
    const days = daysOnSite(
      [
        { startDate: on('2026-01-01'), endDate: on('2026-02-01') },
        { startDate: on('2026-06-01'), endDate: on('2026-07-01') },
      ],
      now
    )
    expect(days).toBe(61)
  })

  it('a contract with no end date counts up to today', () => {
    expect(daysOnSite([{ startDate: on('2026-09-01'), endDate: null }], now)).toBe(9)
  })

  it('a contract booked to run on counts only the days served so far', () => {
    // Two hundred days into a year-long contract is two hundred days on
    // site, not three hundred and sixty — what it will add up to is a
    // forecast, and the ledger is a record.
    expect(daysOnSite([{ startDate: on('2026-02-22'), endDate: on('2027-02-22') }], now)).toBe(200)
  })

  it('a contract that has not started yet counts nothing', () => {
    expect(daysOnSite([{ startDate: on('2026-10-01'), endDate: null }], now)).toBe(0)
  })

  it('nobody on site is zero days', () => {
    expect(daysOnSite([], now)).toBe(0)
  })
})
