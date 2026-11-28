import { describe, it, expect } from 'vitest'
import { standingAgainstLimit, ledgerStatus } from '@/lib/tenure-days'
import { standingWords, ledgerRank } from '@/app/dashboard/tenure/words'
import { plainDate } from '@/lib/plain-date'

/**
 * The founder's tester, 2026-11-08: Kwame Mensah read 135% of the
 * client's time limit and the chip said "In break", with nothing on the
 * row saying he was over it. Past the limit is said first, and where
 * the person is comes second; such rows sort first. Pure: no database.
 *
 * The client: an eighteen-month limit and a ninety-day break.
 */

const DAY = 86_400_000
const NOW = new Date('2026-11-08T00:00:00Z')
const ago = (d: number) => new Date(NOW.getTime() - d * DAY)
const ahead = (d: number) => new Date(NOW.getTime() + d * DAY)
const RULES = { capMonths: 18, breakDays: 90 }

function row(lines: { startDate: Date; endDate: Date | null; live: boolean }[], rules = RULES) {
  const s = standingAgainstLimit(lines, rules, NOW)
  const status = ledgerStatus(s)
  const eligibleDate = s.eligibleOn ? s.eligibleOn.toISOString().slice(0, 10) : null
  return { status, pastLimit: s.pastLimit, onSite: s.onSiteNow, eligibleDate }
}

describe('a person past the time limit', () => {
  // 740 days served, left 20 days ago: in break, 135% of 548 days.
  const kwame = row([{ startDate: ago(760), endDate: ago(21), live: false }])

  it('a person past the limit and in break reads "Past the time limit · in break until <day>", never "In break" alone', () => {
    expect(kwame.status).toBe('IN_BREAK')
    expect(kwame.pastLimit).toBe(true)
    expect(standingWords(kwame)).toMatch(/^Past the time limit · in break until [A-Z][a-z]{2} \d{1,2}, \d{4}$/)
  })

  it('the day in "in break until" is the day the page says they may come back', () => {
    expect(standingWords(kwame)).toBe(`Past the time limit · in break until ${plainDate(kwame.eligibleDate)}`)
  })

  it('a person past the limit and still on site reads "Past the time limit · still on site"', () => {
    const r = row([{ startDate: ago(600), endDate: ahead(30), live: true }])
    expect(standingWords(r)).toBe('Past the time limit · still on site')
  })

  it('a person away past the limit at a client with no break rule reads "Past the time limit"', () => {
    const r = row([{ startDate: ago(700), endDate: ago(30), live: false }], { capMonths: 18, breakDays: null as unknown as number })
    expect(r.status).toBe('BREAK_REQUIRED')
    expect(standingWords(r)).toBe('Past the time limit')
  })

  it('a person who served the break after passing the limit reads Eligible, not past, because the break resets the count', () => {
    const r = row([{ startDate: ago(800), endDate: ago(120), live: false }])
    expect(r.pastLimit).toBe(false)
    expect(standingWords(r)).toBe('Eligible')
  })

  it('a person under the limit and in break still reads "In break"', () => {
    const r = row([{ startDate: ago(200), endDate: ago(10), live: false }])
    expect(r.pastLimit).toBe(false)
    expect(standingWords(r)).toBe('In break')
  })

  it('a person past the limit reads Past the time limit and sorts first, in break or not', () => {
    const rows = [
      { name: 'ok', ...row([{ startDate: ago(30), endDate: ahead(30), live: true }]) },
      { name: 'approaching', ...row([{ startDate: ago(480), endDate: ahead(200), live: true }]) }, // the limit falls in 68 days
      { name: 'in break, under', ...row([{ startDate: ago(200), endDate: ago(10), live: false }]) },
      { name: 'kwame', ...kwame },
      { name: 'on site, past', ...row([{ startDate: ago(600), endDate: ahead(30), live: true }]) },
    ]
    const sorted = [...rows].sort((a, b) => ledgerRank(a) - ledgerRank(b)).map((r) => r.name)
    expect(sorted.slice(0, 2).sort()).toEqual(['kwame', 'on site, past'])
    expect(sorted.slice(2)).toEqual(['approaching', 'in break, under', 'ok'])
  })
})
