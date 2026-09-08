import { describe, it, expect } from 'vitest'
import { splitByLink, hoursFor, theLinkFor, covers, type Link } from '@/lib/contract-links'

/**
 * ContractLink carries effectiveFrom and effectiveTo. Award, convert and
 * import all write them. Nothing read them.
 *
 * So payroll walked every link on a buy contract and picked up every
 * timesheet on the sell contract at the other end, whatever period it
 * covered. A consultant moves sub-vendor mid-assignment, the old link is
 * closed, and the old vendor keeps being paid for hours worked under the
 * new one — reconciling cleanly on both sides against a number that was
 * wrong before either of them looked.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

const link = (buy: string, from: string, to: string | null): Link => ({
  buyContractId: buy,
  sellContractId: 'sell1',
  effectiveFrom: d(from),
  effectiveTo: to ? d(to) : null,
})

/** A working week, Monday to Friday, eight hours a day. */
const WEEK = {
  '2026-09-07': 8, '2026-09-08': 8, '2026-09-09': 8, '2026-09-10': 8, '2026-09-11': 8,
}

describe('a closed link stops being paid', () => {
  it('pays nothing for work after the link ended', () => {
    // The bug, in one assertion.
    const old = link('buy-old', '2026-01-01', '2026-08-31')
    expect(hoursFor('buy-old', [old], WEEK)).toBe(0)
  })

  it('pays nothing for work before the link started', () => {
    expect(hoursFor('buy-new', [link('buy-new', '2026-10-01', null)], WEEK)).toBe(0)
  })

  it('pays an open-ended link for everything after it starts', () => {
    expect(hoursFor('buy', [link('buy', '2026-01-01', null)], WEEK)).toBe(40)
  })

  it('counts both ends of the window as inside it', () => {
    const l = link('buy', '2026-09-07', '2026-09-11')
    expect(covers(l, '2026-09-07')).toBe(true)
    expect(covers(l, '2026-09-11')).toBe(true)
    expect(covers(l, '2026-09-12')).toBe(false)
  })
})

describe('somebody who moves mid-week is split by day, not by week', () => {
  it('gives the old contract Monday and Tuesday and the new one the rest', () => {
    // An overlap filter hands the whole forty hours to both. The days
    // map is already on the timesheet, so the week does not have to be
    // treated as indivisible.
    const links = [
      link('buy-old', '2026-01-01', '2026-09-08'),
      link('buy-new', '2026-09-09', null),
    ]
    expect(hoursFor('buy-old', links, WEEK)).toBe(16)
    expect(hoursFor('buy-new', links, WEEK)).toBe(24)
  })

  it('accounts for every hour exactly once, which is the whole point', () => {
    const links = [
      link('buy-old', '2026-01-01', '2026-09-08'),
      link('buy-new', '2026-09-09', null),
    ]
    const s = splitByLink(links, WEEK)
    expect(s.settled).toBe(40)
    expect(s.shares.reduce((a, x) => a + x.hours, 0)).toBe(40)
  })

  it('names the dates it counted, so the arithmetic can be checked', () => {
    const s = splitByLink([link('buy-old', '2026-01-01', '2026-09-08')], WEEK)
    expect(s.shares[0].dates).toEqual(['2026-09-07', '2026-09-08'])
  })
})

describe('two contracts claiming one day is reported, never resolved', () => {
  it('pays neither of them for the contested day', () => {
    // Paying both reconciles perfectly on each side and is twice the
    // right number.
    const links = [
      link('buy-a', '2026-01-01', null),
      link('buy-b', '2026-09-09', null),
    ]
    const s = splitByLink(links, WEEK)
    expect(s.contested.map((c) => c.date)).toEqual(['2026-09-09', '2026-09-10', '2026-09-11'])
    expect(hoursFor('buy-a', links, WEEK)).toBe(16)
    expect(hoursFor('buy-b', links, WEEK)).toBe(0)
  })

  it('says somebody has to decide, rather than deciding', () => {
    const links = [link('buy-a', '2026-01-01', null), link('buy-b', '2026-01-01', null)]
    expect(splitByLink(links, WEEK).says).toMatch(/Somebody has to say which/i)
  })
})

describe('a day no contract covers is worked and unpaid, and says so', () => {
  it('reports it rather than dropping it', () => {
    // Silently dropping it is how somebody works a week nobody pays for.
    const s = splitByLink([link('buy', '2026-09-09', null)], WEEK)
    expect(s.uncovered.map((u) => u.date)).toEqual(['2026-09-07', '2026-09-08'])
    expect(s.says).toMatch(/nobody is paying for those/i)
  })

  it('reports the whole timesheet as uncovered when there are no links at all', () => {
    const s = splitByLink([], WEEK)
    expect(s.settled).toBe(0)
    expect(s.uncovered).toHaveLength(5)
  })

  it('ignores days with no hours on them rather than calling them uncovered', () => {
    const s = splitByLink([link('buy', '2026-01-01', null)], { ...WEEK, '2026-09-12': 0 })
    expect(s.uncovered).toEqual([])
    expect(s.settled).toBe(40)
  })
})

describe('where a caller genuinely needs one link, it refuses to guess', () => {
  it('returns the one link in force for the period', () => {
    const l = theLinkFor([link('buy', '2026-01-01', null)], d('2026-09-07'), d('2026-09-11'))
    expect(l?.buyContractId).toBe('buy')
  })

  it('returns nothing when two links overlap the period', () => {
    // This replaces `sellLinks[0]`, which was right by luck.
    const links = [link('a', '2026-01-01', null), link('b', '2026-09-09', null)]
    expect(theLinkFor(links, d('2026-09-07'), d('2026-09-11'))).toBeNull()
  })

  it('returns nothing when no link covers the period', () => {
    expect(theLinkFor([link('a', '2026-01-01', '2026-08-01')], d('2026-09-07'), d('2026-09-11'))).toBeNull()
  })
})
