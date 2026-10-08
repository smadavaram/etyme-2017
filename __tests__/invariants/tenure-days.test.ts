import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DAYS_PER_MONTH, daysFor, daysOnSite, fewestDaysIn, monthsOf } from '@/lib/tenure-days'
import { merge } from '@/lib/one-person'
import { longestOnSite, type Placement } from '@/lib/census-page'

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
  it('one contract counts its own days, the first and the last both included', () => {
    // January 1 to January 31 is the whole of January: thirty-one days.
    expect(daysOnSite([{ startDate: on('2026-01-01'), endDate: on('2026-01-31') }], now)).toBe(31)
  })

  it('the last day of a contract is a day on site: Kwame Mensah’s Aug 9, 2024 to Aug 19, 2026 is 741 days, not 740', () => {
    // Round six of the sign-up walk, problem 18. Counting the end date as
    // the first day off put every limit date a day late per contract.
    expect(daysOnSite([{ startDate: on('2024-08-09'), endDate: on('2026-08-19') }], now)).toBe(741)
  })

  it('a one-day contract is one day on site, not none', () => {
    expect(daysOnSite([{ startDate: on('2026-03-02'), endDate: on('2026-03-02') }], now)).toBe(1)
  })

  it('a day on two lines is counted once, when one line ends the same day the next begins', () => {
    // A handover day: the old supplier's last day and the new one's first.
    // One day on site, not two.
    const days = daysOnSite(
      [
        { startDate: on('2026-01-01'), endDate: on('2026-01-10') },
        { startDate: on('2026-01-10'), endDate: on('2026-01-20') },
      ],
      now
    )
    expect(days).toBe(20)
  })

  it('back-to-back contracts with no day between them add up to every day, each counted once', () => {
    const days = daysOnSite(
      [
        { startDate: on('2026-01-01'), endDate: on('2026-01-10') },
        { startDate: on('2026-01-11'), endDate: on('2026-01-20') },
      ],
      now
    )
    expect(days).toBe(20)
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
    // January 1 to April 1, both ends counted.
    expect(days).toBe(91)
  })

  it('the gap between two contracts is not tenure', () => {
    const days = daysOnSite(
      [
        { startDate: on('2026-01-01'), endDate: on('2026-02-01') },
        { startDate: on('2026-06-01'), endDate: on('2026-07-01') },
      ],
      now
    )
    // January 1 to February 1 is 32 days and June 1 to July 1 is 31.
    expect(days).toBe(63)
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

/**
 * Months served are whole months, never rounded up. Decided by the
 * founder, 2026-09-29.
 *
 * `Math.round(days / 30.44)` counted a month as served once half of it
 * was, so 533 days read eighteen months and three screens said "past
 * the limit" a fortnight before the block, which counts days, fired.
 */
describe('how many whole months that is', () => {
  it('a person sixteen days in has served no whole month', () => {
    expect(monthsOf(16)).toBe(0)
    expect(monthsOf(27)).toBe(0)
    // A February is the shortest month there is, and it is a month.
    expect(monthsOf(28)).toBe(1)
  })

  it('533 days on site reads seventeen months, never eighteen before the eighteenth month is served', () => {
    expect(monthsOf(533)).toBe(17)
    // Eighteen are served at the fewest days any eighteen calendar
    // months can hold, and the block fires two days after that.
    expect(fewestDaysIn(18)).toBe(546)
    expect(monthsOf(545)).toBe(17)
    expect(monthsOf(546)).toBe(18)
    expect(daysFor(18)).toBe(548)
  })

  it('reads the founder’s own examples as he wrote them', () => {
    expect(fewestDaysIn(1)).toBe(28)
    expect(fewestDaysIn(6)).toBe(181)
    expect(fewestDaysIn(12)).toBe(365)
    expect(fewestDaysIn(24)).toBe(730)
    expect(monthsOf(200)).toBe(6)
    expect(monthsOf(690)).toBe(22)
  })

  it('any exact span of calendar months reads that many months, whatever the start day', () => {
    // Every start day from 2024 (a leap year) to the end of 2027, and
    // every length up to four years.
    for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2028, 0, 1); t += 86_400_000) {
      const from = new Date(t)
      for (let n = 1; n <= 48; n++) {
        const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + n, from.getUTCDate()))
        if (to.getUTCDate() !== from.getUTCDate()) continue // the 31st into a shorter month is no anniversary
        const got = monthsOf(daysOnSite([{ startDate: from, endDate: to }], to))
        if (got !== n) throw new Error(`${from.toISOString().slice(0, 10)} plus ${n} months read as ${got}`)
      }
    }
  })

  it('never rounds up: a day short of the shortest n calendar months is not n months', () => {
    for (let n = 1; n <= 60; n++) {
      expect(monthsOf(fewestDaysIn(n) - 1)).toBe(n - 1)
      expect(monthsOf(fewestDaysIn(n))).toBe(n)
    }
  })

  it('no days, or a negative count, is no months', () => {
    expect(monthsOf(0)).toBe(0)
    expect(monthsOf(-5)).toBe(0)
  })
})

describe('the limit and the block', () => {
  it('the block still fires on days, unchanged, and the award and the ledger both read it from one function', () => {
    // `daysFor` is the formula every copy of the block already used,
    // moved to one place, so the day it fires has not moved.
    for (let n = 1; n <= 60; n++) expect(daysFor(n)).toBe(Math.round(n * 30.44))
    expect(DAYS_PER_MONTH).toBe(30.44)

    // Since 2026-10-06 neither door keeps its own copy: the award's
    // engine and the ledger both ask `standingAgainstLimit`, which
    // compares the counted days against `daysFor(capMonths)`.
    const days = readFileSync(join(process.cwd(), 'src/lib/tenure-days.ts'), 'utf8')
    expect(days).toMatch(/const limitDays = capMonths != null \? daysFor\(capMonths\) : null/)
    expect(days).toMatch(/const pastLimit = limitDays != null && countedDays >= limitDays/)
    const governance = readFileSync(join(process.cwd(), 'src/lib/governance.ts'), 'utf8')
    expect(governance).toMatch(/standingAgainstLimit\(/)
    expect(governance).not.toMatch(/daysFor\(/)
    const ledger = readFileSync(join(process.cwd(), 'src/app/api/tenure/route.ts'), 'utf8')
    expect(ledger).toMatch(/standingAgainstLimit\(/)
    expect(ledger).not.toMatch(/daysFor\(/)
  })

  it('never reads a limit as reached more than three days before the block fires', () => {
    // The limit is enforced in 30.44-day months and the count is in
    // calendar months, so "18 months" can arrive at 546 against a block
    // at 548. That residue is a choice, written down in lib/tenure-days,
    // and this holds it at three days.
    for (let cap = 1; cap <= 48; cap++) {
      for (let d = 0; d < daysFor(cap) - 3; d++) {
        if (monthsOf(d) >= cap) throw new Error(`${d} days read ${monthsOf(d)} months against a ${cap}-month limit that blocks at ${daysFor(cap)}`)
      }
    }
  })

  it('every screen that compares months to the limit reads the same count as the ledger', () => {
    // The person register (lib/one-person) and the census (lib/census-page)
    // both say "past your limit". Each reads the ledger's month count, and
    // each decides "past" on the block's own days.
    const NOW = new Date('2026-09-29T12:00:00Z')
    const cap = 18
    for (const days of [16, 200, 533, 545, 546, 547, 548, 549, 690, 700, 730]) {
      const startedAt = new Date(NOW.getTime() - days * 86_400_000)
      const row = merge(
        { personId: 'p', name: 'P', offers: [], barred: null, capMonths: cap, stints: [{ startedAt, endedAt: null, vendorName: 'V' }] },
        NOW
      )
      const ledgerDays = daysOnSite([{ startDate: startedAt, endDate: null }], NOW)
      expect(ledgerDays).toBe(days)
      expect(row.monthsHere, `${days} days on the register`).toBe(monthsOf(days))
      expect(row.pastCap, `${days} days past the limit on the register`).toBe(days >= daysFor(cap))
      expect(row.says.includes('past your cap'), `${days} days: ${row.says}`).toBe(days >= daysFor(cap))

      const placement: Placement = {
        id: 'c', personId: 'p', personName: 'P', companyId: 'v', clientCompanyId: 'c', supplier: 'V',
        role: null, rateMinor: null, currency: 'USD', hoursPerWeek: null,
        startDate: startedAt, endDate: null, state: 'IN_PROGRESS',
      }
      const census = longestOnSite([placement], NOW, cap)
      expect(census.top[0].months, `${days} days on the census`).toBe(monthsOf(days))
      expect(census.pastCap, `${days} days past the limit on the census`).toBe(days >= daysFor(cap) ? 1 : 0)
    }
  })

  it('no screen keeps a private copy of the month', () => {
    // Every private `Math.round(days / 30.44)` was a screen that could
    // disagree with the ledger. The month lives in lib/tenure-days.
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const path = join(dir, f)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|tsx)$/.test(f) && !path.endsWith(join('lib', 'tenure-days.ts'))) {
          const src = readFileSync(path, 'utf8')
          if (/Math\.round\([^)]*30\.44/.test(src)) offenders.push(path)
        }
      }
    }
    walk(join(process.cwd(), 'src'))
    expect(offenders).toEqual([])
  })
})
