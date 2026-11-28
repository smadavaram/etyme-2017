import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { askBack, warnWindowFrom } from '@/app/api/alumni/ask-back-standing'

/**
 * Asking somebody back reads "near the time limit" through the company's
 * own widest warning, the window the Tenure page and Ask Etyme read
 * (regulatory 392842f78), never a 90-day default of its own.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const DAY = 86_400_000
const now = new Date('2026-11-09T00:00:00Z')
// On site for 470 days of an 18-month limit: about 78 days left.
const lines = [{ startDate: new Date(now.getTime() - 470 * DAY), endDate: null, live: true }]

describe('asking somebody back reads the company’s own warning window', () => {
  it('the window is the company’s widest warning, and a set with none reads as the default', () => {
    expect(warnWindowFrom([90, 60, 30])).toBe(90)
    expect(warnWindowFrom([45, 14])).toBe(45)
    expect(warnWindowFrom([])).toBeNull()
  })

  it('somebody 78 days from the limit is near it at a company that warns at 90, and not at one that warns at 60', () => {
    expect(askBack(lines, { capMonths: 18, breakDays: 90, warnWithinDays: 90 }, now).ledgerStatus).toBe('WARNING')
    expect(askBack(lines, { capMonths: 18, breakDays: 90, warnWithinDays: 60 }, now).ledgerStatus).toBe('OK')
  })

  it('the alumni list and the ask-back request both read the window from the company’s rule set', () => {
    expect(src('src/app/api/alumni/route.ts')).toContain('warnWithinDays: warnWindowFrom((await ruleSetFor(clientCompany.id)).tenureWarnAtDays)')
    expect(src('src/app/api/alumni/ask-back/route.ts')).toContain('warnWithinDays: warnWindowFrom((await ruleSetFor(client.id)).tenureWarnAtDays)')
  })
})
