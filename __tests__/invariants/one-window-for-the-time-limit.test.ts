import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/db', () => ({ prisma: {} }))

import { standingAgainstLimit, ledgerStatus, DEFAULT_WARN_WITHIN_DAYS } from '@/lib/tenure-days'
import { tenureWarningsFor } from '@/lib/twin/rules/tenure'
import { DEFAULT_RULE_SET } from '@/lib/twin/rule-set'

/**
 * Two doors gave two answers to "who is near the time limit" (2026-11-09):
 * Ask Etyme read the rule set's warnings (90, 60, 30 days) and named
 * Tobias Lindqvist; the Tenure page counted three quarters of the way and
 * named Lucía Fernández at about 121 days too. One window now, the
 * company's widest warning, read by the page and the warnings alike.
 */
const NOW = new Date('2026-11-09T00:00:00Z')
const DAY = 86_400_000
const ago = (n: number) => new Date(NOW.getTime() - n * DAY)
const ahead = (n: number) => new Date(NOW.getTime() + n * DAY)
const RULES = { capMonths: 18, breakDays: 90 }
// 18 months is 548 days. On site 427 days, booked a year more: the limit falls in 121 days.
const lucia = [{ startDate: ago(427), endDate: ahead(365), live: true }]
// On site 488 days: the limit falls in 60 days.
const tobias = [{ startDate: ago(488), endDate: ahead(365), live: true }]
const asTwin = (personId: string, personName: string, lines: typeof lucia) =>
  lines.map((l) => ({ ...l, personId, personName, supplierName: 'Computer Systems Inc', contractId: `${personId}-1` }))

describe('one window for the time limit', () => {
  it('Lucía Fernández, 121 days from the limit, is not near it by default', () => {
    expect(ledgerStatus(standingAgainstLimit(lucia, RULES, NOW))).toBe('OK')
  })

  it('Tobias Lindqvist, 60 days from the limit, is near it by default', () => {
    expect(ledgerStatus(standingAgainstLimit(tobias, RULES, NOW))).toBe('WARNING')
  })

  it('a company that set its widest warning to 150 days sees Lucía near the limit', () => {
    expect(ledgerStatus(standingAgainstLimit(lucia, { ...RULES, warnWithinDays: 150 }, NOW))).toBe('WARNING')
  })

  it('the Tenure page and the nightly warnings Ask Etyme reads name the same people', () => {
    for (const warnAtDays of [[90, 60, 30], [150, 60, 30]]) {
      const people = [['p-lucia', 'Lucía Fernández', lucia], ['p-tobias', 'Tobias Lindqvist', tobias]] as const
      const page = people
        .filter(([, , l]) => ledgerStatus(standingAgainstLimit(l as never, { ...RULES, warnWithinDays: Math.max(...warnAtDays) }, NOW)) === 'WARNING')
        .map(([, n]) => n)
      const warned = tenureWarningsFor(people.flatMap(([id, n, l]) => asTwin(id, n, l as never)) as never, { ...RULES, warnAtDays }, NOW)
        .map((w) => w.personName)
      expect(page.sort(), String(warnAtDays)).toEqual(warned.sort())
    }
  })

  it('a person past the limit stays past, whatever the window', () => {
    const past = [{ startDate: ago(600), endDate: ahead(30), live: true }]
    expect(ledgerStatus(standingAgainstLimit(past, { ...RULES, warnWithinDays: 30 }, NOW))).toBe('BREAK_REQUIRED')
  })

  it('a person whose booked contracts end before the limit is not near it, on the page as in the warnings', () => {
    expect(ledgerStatus(standingAgainstLimit([{ startDate: ago(500), endDate: ahead(20), live: true }], RULES, NOW))).toBe('OK')
  })

  it('the default window is the shipped rule set’s widest warning, and the Tenure page reads the company’s own', () => {
    expect(DEFAULT_WARN_WITHIN_DAYS).toBe(Math.max(...DEFAULT_RULE_SET.tenureWarnAtDays))
    const route = readFileSync(join(__dirname, '../../src/app/api/tenure/route.ts'), 'utf8')
    expect(route).toContain('(await ruleSetFor(clientCompany.id)).tenureWarnAtDays')
    expect(route).toContain('{ capMonths, breakDays, warnWithinDays }')
  })
})
